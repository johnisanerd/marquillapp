/**
 * How an eval run ended, as the script saw it. `COMPLETED` and `FAILED` are
 * the run record's own terminal statuses; the rest are runs that never got one.
 */
export type EvalRunState =
  | 'COMPLETED'
  | 'FAILED'
  | 'TIMED_OUT'
  | 'LAUNCH_FAILED'
  | 'NOT_RUN';

/** One matrix entry and what became of it. */
export interface EvalRunRecord {
  key: string;
  kind: 'INITIAL' | 'REFINE';
  /** The Design System the entry asked for; none for a Refinement that carries the pin. */
  requestedDesignSystemId?: string;
  /** The page count the entry's brief asks for. */
  requestedPages: number;
  /** For a Refinement, the key of the run whose result it refines. */
  sourceKey?: string;
  artifactId?: string;
  runId?: string;
  /** The Document Version the run produced or attempted. */
  version?: number;
  state: EvalRunState;
  /** Why the run did not start or did not end, when the script knows. */
  error?: string;
}
