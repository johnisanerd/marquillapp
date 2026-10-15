import type { StylePreset } from "../lib/types";
import { API_BASE, jsonRequest, readApi } from "./api";
import type {
  ArtifactType,
  CreateArtifactRequest,
  CreateArtifactResponse,
  RefineArtifactRequest,
  RefineArtifactResponse,
} from "./artifactTypes";
import { createDesignSystemField, refineDesignSystemField } from "./designSystems";

export function createArtifactBody({
  type,
  prompt,
  withResearch,
  stylePreset,
  designSystemId,
}: {
  type: ArtifactType;
  prompt: string;
  withResearch: boolean;
  stylePreset: StylePreset;
  designSystemId?: string;
}): CreateArtifactRequest {
  return {
    type,
    prompt,
    withResearch,
    ...(type === "POST" ? { stylePreset } : {}),
    ...createDesignSystemField(type, designSystemId),
  };
}

export function createArtifactRequest(body: CreateArtifactRequest) {
  return readApi<CreateArtifactResponse>(
    `${API_BASE}/artifacts`,
    jsonRequest(body, { method: "POST" }),
  );
}

export function refineArtifactBody(
  type: ArtifactType | undefined,
  feedback: string,
  designSystemId?: string,
): RefineArtifactRequest {
  return { feedback, ...refineDesignSystemField(type, designSystemId) };
}

export function refineArtifactRequest(artifactId: string, body: RefineArtifactRequest) {
  return readApi<RefineArtifactResponse>(
    `${API_BASE}/artifacts/${encodeURIComponent(artifactId)}/refine`,
    jsonRequest(body, { method: "POST" }),
  );
}
