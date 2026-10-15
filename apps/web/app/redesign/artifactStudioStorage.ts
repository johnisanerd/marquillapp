const artifactPromptKey = (artifactId: string) => `marquill:artifact:${artifactId}:prompt`;

export function storeArtifactPrompt(artifactId: string, prompt: string) {
  try {
    window.sessionStorage.setItem(artifactPromptKey(artifactId), prompt);
  } catch {
    // Draft continuity is optional; a storage policy or quota must not block a run.
  }
}

export function readArtifactPrompt(artifactId: string) {
  try {
    return window.sessionStorage.getItem(artifactPromptKey(artifactId));
  } catch {
    return null;
  }
}

const artifactDesignSystemKey = (artifactId: string) => `marquill:artifact:${artifactId}:design-system`;

export function storeArtifactDesignSystem(artifactId: string, designSystemId: string | undefined) {
  try {
    if (designSystemId) window.sessionStorage.setItem(artifactDesignSystemKey(artifactId), designSystemId);
    else window.sessionStorage.removeItem(artifactDesignSystemKey(artifactId));
  } catch {
    // Draft continuity is optional; a storage policy or quota must not block a run.
  }
}

export function readArtifactDesignSystem(artifactId: string) {
  try {
    return window.sessionStorage.getItem(artifactDesignSystemKey(artifactId)) ?? undefined;
  } catch {
    return undefined;
  }
}
