import {
  briefsForSystem,
  EVAL_BRIEFS,
  EVAL_REFINE_FEEDBACK,
  type EvalBrief,
} from './briefs';

export interface InitialEvalEntry {
  kind: 'INITIAL';
  /** Stable name for the run in reports: `<system>/15p`. */
  key: string;
  designSystemId: string;
  /** The requested page count for this system's brief. */
  requestedPages: number;
  /** Alias for requestedPages. */
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

export interface EvalSystemPageLimits {
  min: number;
  max: number;
}

export interface EvalMatrixTargetSystem {
  id: string;
  definition?: {
    page?: {
      pages?: EvalSystemPageLimits;
    };
  };
  pages?: EvalSystemPageLimits;
}

export type EvalMatrixTarget = string | EvalMatrixTargetSystem;

/**
 * The fixed matrix of the pre-rollout eval (spec §11.3): every listed system
 * against every brief, then one Refinement that carries the pin and one that
 * switches system. The order is deterministic: systems in the order given,
 * briefs from shortest to longest.
 *
 * For systems with a page cap below 15 (e.g. afterglow, broadside, colophon,
 * overprint with pages.max: 12), the long brief requests min(15, pages.max).
 */
export function buildEvalMatrix(
  systems: readonly EvalMatrixTarget[],
  briefs: readonly EvalBrief[] = EVAL_BRIEFS,
): EvalMatrix {
  const initial = systems.flatMap((target): InitialEvalEntry[] => {
    const designSystemId = typeof target === 'string' ? target : target.id;
    const limits =
      typeof target === 'string'
        ? undefined
        : (target.pages ?? target.definition?.page?.pages);
    const systemBriefs = briefsForSystem(limits);

    return systemBriefs.map((brief, index): InitialEvalEntry => {
      const baseBrief = briefs[index] ?? brief;
      const requestedPages = brief.pages;
      return {
        kind: 'INITIAL',
        key: `${designSystemId}/${baseBrief.pages}p`,
        designSystemId,
        requestedPages,
        pages: requestedPages,
        prompt: brief.prompt,
      };
    });
  });
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
