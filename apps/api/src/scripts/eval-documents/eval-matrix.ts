import { EVAL_BRIEFS, EVAL_REFINE_FEEDBACK, type EvalBrief } from './briefs';

export interface InitialEvalEntry {
  kind: 'INITIAL';
  /** Stable name for the run in reports: `<system>/<pages>p`. */
  key: string;
  designSystemId: string;
  pages: number;
  prompt: string;
}

/**
 * A REFINE run. Its source is decided once the INITIAL runs have ended, since
 * only a `READY` run can be refined.
 */
export interface RefineEvalEntry {
  kind: 'REFINE';
  key: 'refine/carry-pin' | 'refine/switch-system';
  /** `carry` keeps the source's pin; `switch` names another system. */
  mode: 'carry' | 'switch';
  feedback: string;
}

export type EvalEntry = InitialEvalEntry | RefineEvalEntry;

export interface EvalMatrix {
  initial: InitialEvalEntry[];
  refine: RefineEvalEntry[];
}

/**
 * The fixed matrix of the pre-rollout eval (spec §11.3): every listed system
 * against every brief, then one Refinement that carries the pin and one that
 * switches system. The order is deterministic: systems in the order given,
 * briefs from shortest to longest.
 */
export function buildEvalMatrix(
  designSystemIds: readonly string[],
  briefs: readonly EvalBrief[] = EVAL_BRIEFS,
): EvalMatrix {
  const initial = designSystemIds.flatMap((designSystemId) =>
    briefs.map(
      (brief): InitialEvalEntry => ({
        kind: 'INITIAL',
        key: `${designSystemId}/${brief.pages}p`,
        designSystemId,
        pages: brief.pages,
        prompt: brief.prompt,
      }),
    ),
  );
  const refine: RefineEvalEntry[] = [
    {
      kind: 'REFINE',
      key: 'refine/carry-pin',
      mode: 'carry',
      feedback: EVAL_REFINE_FEEDBACK,
    },
    {
      kind: 'REFINE',
      key: 'refine/switch-system',
      mode: 'switch',
      feedback: EVAL_REFINE_FEEDBACK,
    },
  ];
  return { initial, refine };
}

/**
 * The system a switching Refinement moves to: the first one, in matrix order,
 * that is not the source's own.
 */
export function switchTarget(
  designSystemIds: readonly string[],
  sourceDesignSystemId: string,
): string | undefined {
  return designSystemIds.find((id) => id !== sourceDesignSystemId);
}
