import type { Logger } from '@nestjs/common';
import type { BuildInput } from './workflow.types';

/**
 * The fixed alert tags (spec §11.5). Railway log search matches them, so a
 * new tag is a monitoring change, not just a code change.
 */
export type AlertTag =
  | 'render.egress'
  | 'design_system.unresolvable'
  | 'artifact.source_missing'
  | 'icon.inline_failed'
  | 'credit.commit_failed';

/** Which run, and which version of which Artifact, an alert is about. */
export interface AlertSubject {
  runId: string;
  artifactId: string;
  version: number;
}

/** The subject of an alert raised while running `input` as `runId`. */
export const alertSubject = (
  runId: string,
  { artifactId, version }: Pick<BuildInput, 'artifactId' | 'version'>,
): AlertSubject => ({ runId, artifactId, version });

/**
 * Identifiers and counts only. There is no free text, so an alert can never
 * carry Candidate or Document Source, prompts, briefs, research text, or
 * violation details (spec §11.6).
 */
export type AlertFields = Record<string, string | number>;

/** Logs `[ALERT <tag>] run=… artifact=… version=…`, then any `key=value` fields. */
export function alert(
  logger: Pick<Logger, 'error'>,
  tag: AlertTag,
  { runId, artifactId, version }: AlertSubject,
  fields: AlertFields = {},
): void {
  const pairs = Object.entries({
    run: runId,
    artifact: artifactId,
    version,
    ...fields,
  }).map(([key, value]) => `${key}=${value}`);
  logger.error(`[ALERT ${tag}] ${pairs.join(' ')}`);
}
