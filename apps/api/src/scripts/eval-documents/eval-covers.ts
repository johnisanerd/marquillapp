/** The part of an Artifact the cover lookup reads. */
export interface CoverSource {
  versions: { version: number; content?: Record<string, unknown> }[];
}

/**
 * The storage key of a Document Version's cover (the PNG of page 1), or
 * `undefined` when the version is missing or its cover capture failed.
 */
export function findCoverKey(
  artifact: CoverSource | null | undefined,
  version: number,
): string | undefined {
  const document = artifact?.versions.find(
    (candidate) => candidate.version === version,
  )?.content?.document;
  if (typeof document !== 'object' || document === null) return undefined;
  const coverKey = (document as { coverKey?: unknown }).coverKey;
  return typeof coverKey === 'string' ? coverKey : undefined;
}
