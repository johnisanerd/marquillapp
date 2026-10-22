import {
  ContentValidationError,
  DocumentTruncatedError,
} from '../../agent/agent-runner.error';
import type { AgentHooks } from '../../agent/agent-runner.interface';
import type { DesignSystemDefinition } from '../../design-system/design-system-definition';
import { check } from '../../document-source/candidate-check';
import { sha256Hex } from '../../document-source/sha256';
import {
  boundViolations,
  type Violation,
} from '../../document-source/violation';
import { USAGE_KINDS } from '../../feature-gating/credit-meter.constants';
import { RunEventType } from '../engine/run-event.types';
import { terminal } from '../engine/workflow.error';
import type { DocumentCheck, StepContext } from '../engine/workflow.types';
import {
  DOCUMENT_REPAIR_BUDGET,
  FailureCode,
  WorkflowStep,
} from '../workflow.constants';

/** The envelope code for a Candidate Source over the size cap (spec §4.4). */
const TRUNCATED_CODE = 'envelope.truncated';

/**
 * What a DOCUMENT step needs to spend the shared Repair budget (spec §7.2).
 * `fragment` and `includeTitle` are the draft's, so a Repair's system message
 * is byte-identical to the draft call's.
 */
export interface RepairScope {
  ctx: StepContext;
  /** The step whose `step.progress` announces each Repair round. */
  step: WorkflowStep.GENERATE | WorkflowStep.RENDER_PDF;
  definition: DesignSystemDefinition;
  fragment: string;
  includeTitle: boolean;
  /** `artifact {id} v{version}`, for failure messages. */
  label: string;
}

/** A Candidate Source and the Repair turns spent reaching it. */
export interface RepairedCandidate {
  candidate: string;
  repairsSpent: number;
}

/**
 * Per-turn, so a repair turn is billed like any other and the SSE stream's
 * credit count climbs while the run is still in flight. The run record
 * tallies the turn's tokens and time too.
 */
export const meteredHooks = (ctx: StepContext): AgentHooks => ({
  onUsage: (usage) => {
    ctx.meter.record({
      kind: USAGE_KINDS.LLM,
      amount: usage.cost,
      detail: { model: usage.model, totalTokens: usage.totalTokens },
    });
    ctx.run.recordModelCall(usage);
    ctx.diagnostics.recordModelTurn(usage);
  },
});

/**
 * Records one check of a Candidate Source: its codes and counts in the run's
 * diagnostics, then its full violation list on the run. In that order, so a
 * failed write still leaves the outcome in the diagnostics.
 */
export async function recordCheck(
  ctx: StepContext,
  phase: DocumentCheck['phase'],
  candidate: string,
  violations: Violation[],
): Promise<void> {
  ctx.diagnostics.recordCheck(phase, candidate, violations);
  await ctx.run.recordDocumentCheck({
    phase,
    candidateSha256: sha256Hex(candidate),
    violations,
    checkedAt: new Date(),
  });
}

/**
 * Static-checks the Candidate Source and repairs it until it is clean or the
 * shared budget is spent. A source over the size cap is `document.truncated`
 * and spends nothing: a Repair cannot make it shorter.
 */
export async function repairStatically(
  scope: RepairScope,
  { candidate, repairsSpent }: RepairedCandidate,
): Promise<RepairedCandidate> {
  let current = { candidate, repairsSpent };
  let violations = await checkStatically(scope, current.candidate);

  while (violations.length > 0) {
    if (violations.some(({ code }) => code === TRUNCATED_CODE)) {
      throw terminal(
        `The Candidate Source for ${scope.label} is over the size cap`,
        undefined,
        FailureCode.DOCUMENT_TRUNCATED,
      );
    }
    current = await repair(scope, current, violations, 'static');
    violations = await checkStatically(scope, current.candidate);
  }
  return current;
}

/**
 * One Repair turn on `violations`, or `document.repair_exhausted` when the
 * budget is spent. The re-emitted Candidate Source is still unchecked.
 */
export async function repair(
  scope: RepairScope,
  { candidate, repairsSpent }: RepairedCandidate,
  violations: Violation[],
  kind: 'static' | 'render',
): Promise<RepairedCandidate> {
  const { ctx, step, fragment, includeTitle, label } = scope;
  if (repairsSpent >= DOCUMENT_REPAIR_BUDGET) {
    throw terminal(
      `The Candidate Source for ${label} still has ${violations.length} ${kind} violation(s) after ${repairsSpent} Repair turn(s)`,
      undefined,
      FailureCode.DOCUMENT_REPAIR_EXHAUSTED,
    );
  }

  const round = repairsSpent + 1;
  ctx.deadline.assertTimeLeft(step, `Repair round ${round} of ${label}`);
  ctx.emit({
    type: RunEventType.STEP_PROGRESS,
    data: { step, phase: 'repair', round, violations: violations.length },
  });

  const allowance = envelopeAllowance(round);
  const repaired = await callModel(allowance, label, () =>
    ctx.agent.repairDocument(
      {
        fragment,
        includeTitle,
        candidate,
        violations: boundViolations(violations),
        maxEnvelopeRepairs: allowance,
        sessionId: ctx.run.runId,
      },
      meteredHooks(ctx),
    ),
  );
  const spent = round + repaired.envelopeRepairs;
  ctx.diagnostics.recordRepairsSpent(spent);
  return { candidate: repaired.html, repairsSpent: spent };
}

/** A model call may spend at most one Zod repair turn, and only if one is left. */
export const envelopeAllowance = (repairsSpent: number): number =>
  Math.min(1, DOCUMENT_REPAIR_BUDGET - repairsSpent);

/**
 * Maps the agent's DOCUMENT errors. An invalid envelope is terminal: as
 * `document.repair_exhausted` when the budget left it no repair turn, and as
 * `internal` when its repair turn failed too (R2).
 */
export async function callModel<T>(
  allowance: number,
  label: string,
  call: () => Promise<T>,
): Promise<T> {
  try {
    return await call();
  } catch (error: unknown) {
    if (error instanceof DocumentTruncatedError) {
      throw terminal(error.message, error, FailureCode.DOCUMENT_TRUNCATED);
    }
    if (error instanceof ContentValidationError) {
      throw allowance > 0
        ? terminal(error.message, error)
        : terminal(
            `The envelope for ${label} is invalid and the Repair budget is spent: ${error.message}`,
            error,
            FailureCode.DOCUMENT_REPAIR_EXHAUSTED,
          );
    }
    throw error;
  }
}

async function checkStatically(
  { ctx, definition }: RepairScope,
  candidate: string,
): Promise<Violation[]> {
  const violations = check(definition, candidate);
  await recordCheck(ctx, 'static', candidate, violations);
  return violations;
}
