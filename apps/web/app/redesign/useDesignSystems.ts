import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDesignSystems, type DesignSystemSummary } from "./designSystems";

export type DesignSystemsState =
  | { status: "idle" | "loading" | "failed" }
  | { status: "ready"; systems: DesignSystemSummary[] };

/**
 * Loads the selectable Design Systems once `enabled` turns true. A failed or empty
 * list is not fatal: callers fall back to sending no `designSystemId`.
 */
export default function useDesignSystems(enabled: boolean) {
  const [state, setState] = useState<DesignSystemsState>({ status: "idle" });
  const started = useRef(false);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      setState({ status: "ready", systems: await fetchDesignSystems() });
    } catch {
      setState({ status: "failed" });
    }
  }, []);

  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    void load();
  }, [enabled, load]);

  const systems = state.status === "ready" ? state.systems : [];
  return { state, systems, reload: load };
}
