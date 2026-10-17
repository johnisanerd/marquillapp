import { API_BASE, ApiRequestError, readApi } from "./api";
import type { ArtifactType } from "./artifactTypes";

/** The three hexes a system's swatch shows. */
export type DesignSystemColors = {
  text: string;
  background: string;
  accent: string;
};

/** One selectable Design System, as `GET /design-systems` lists it. */
export type DesignSystemSummary = {
  id: string;
  version: number;
  name: string;
  summary: string;
  /** Absent when the API sends none or any hex is malformed. */
  colors?: DesignSystemColors;
  /** Paths on the web origin, in page order; used exactly as returned. */
  previews: string[];
};

export const DESIGN_SYSTEM_UNAVAILABLE = "design_system.unavailable";

const HEX = /^#[0-9a-fA-F]{6}$/;

function parseColors(value: unknown): DesignSystemColors | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { text, background, accent } = value as Partial<Record<keyof DesignSystemColors, unknown>>;
  const hexes = [text, background, accent];
  if (!hexes.every((hex): hex is string => typeof hex === "string" && HEX.test(hex))) return undefined;
  return { text: hexes[0], background: hexes[1], accent: hexes[2] };
}

/** The list is a bare array, not the `ApiResponse` envelope; anything else is treated as empty. */
export function parseDesignSystems(payload: unknown): DesignSystemSummary[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((entry): DesignSystemSummary[] => {
    if (!entry || typeof entry !== "object") return [];
    const { id, version, name, summary, colors, previews } = entry as Partial<DesignSystemSummary>;
    if (typeof id !== "string" || !id || typeof name !== "string" || !name) return [];
    const swatch = parseColors(colors);
    return [{
      id,
      version: typeof version === "number" ? version : 0,
      name,
      summary: typeof summary === "string" ? summary : "",
      ...(swatch ? { colors: swatch } : {}),
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

/**
 * `designSystemId` belongs to a DOCUMENT only. On create, no id means `margin`; on a
 * refine, no id keeps the Current Version's pin.
 */
export function designSystemField(type: ArtifactType | undefined, designSystemId?: string) {
  return type === "DOCUMENT" && designSystemId ? { designSystemId } : {};
}

/** The refine `409` whose `message` is safe to show and which a `designSystemId` recovers. */
export function isDesignSystemUnavailable(reason: unknown): reason is ApiRequestError {
  return reason instanceof ApiRequestError
    && reason.status === 409
    && reason.code === DESIGN_SYSTEM_UNAVAILABLE;
}
