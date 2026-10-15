import { API_BASE, ApiRequestError, readApi } from "./api";
import type { ArtifactType } from "./artifactTypes";

/** One selectable Design System, as `GET /design-systems` lists it. */
export type DesignSystemSummary = {
  id: string;
  version: number;
  name: string;
  summary: string;
  /** Paths on the web origin, in page order; used exactly as returned. */
  previews: string[];
};

export const DESIGN_SYSTEM_UNAVAILABLE = "design_system.unavailable";

/** The list is a bare array, not the `ApiResponse` envelope; anything else is treated as empty. */
export function parseDesignSystems(payload: unknown): DesignSystemSummary[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((entry): DesignSystemSummary[] => {
    if (!entry || typeof entry !== "object") return [];
    const { id, version, name, summary, previews } = entry as Partial<DesignSystemSummary>;
    if (typeof id !== "string" || !id || typeof name !== "string" || !name) return [];
    return [{
      id,
      version: typeof version === "number" ? version : 0,
      name,
      summary: typeof summary === "string" ? summary : "",
      previews: Array.isArray(previews)
        ? previews.filter((path): path is string => typeof path === "string" && Boolean(path))
        : [],
    }];
  });
}

export async function fetchDesignSystems() {
  return parseDesignSystems(await readApi<unknown>(`${API_BASE}/design-systems`));
}

/** The Design System a document is created with: the picked one, else the default (listed first). */
export function resolveDesignSystemId(systems: DesignSystemSummary[], picked?: string) {
  if (picked && systems.some((system) => system.id === picked)) return picked;
  return systems[0]?.id;
}

/** `designSystemId` belongs to DOCUMENT only; with no list there is no choice, which means `margin`. */
export function createDesignSystemField(type: ArtifactType, designSystemId?: string) {
  return type === "DOCUMENT" && designSystemId ? { designSystemId } : {};
}

/** A refinement keeps the Current Version's pin unless the user switched, and only a DOCUMENT has one. */
export function refineDesignSystemField(type: ArtifactType | undefined, designSystemId?: string) {
  return type === "DOCUMENT" && designSystemId ? { designSystemId } : {};
}

/** The refine `409` whose `message` is safe to show and which a `designSystemId` recovers. */
export function isDesignSystemUnavailable(reason: unknown): reason is ApiRequestError {
  return reason instanceof ApiRequestError
    && reason.status === 409
    && reason.code === DESIGN_SYSTEM_UNAVAILABLE;
}
