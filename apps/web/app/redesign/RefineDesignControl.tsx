"use client";

import DesignSystemMenu from "./DesignSystemMenu";
import type { DesignSystemSummary } from "./designSystems";
import type { DesignSystemsState } from "./useDesignSystems";

/**
 * The design choice beside a DOCUMENT refinement. By default it keeps the Current
 * Version's look; `unavailableMessage` (a 409 `design_system.unavailable`) removes
 * that option and keeps the message in view until a system is chosen.
 */
export default function RefineDesignControl({
  state,
  systems,
  value,
  onChange,
  onReload,
  currentDesignName,
  unavailableMessage,
  disabled,
}: {
  state: DesignSystemsState;
  systems: DesignSystemSummary[];
  value: string;
  onChange: (designSystemId: string) => void;
  onReload: () => void;
  currentDesignName?: string;
  unavailableMessage: string | null;
  disabled?: boolean;
}) {
  const selected = systems.find((system) => system.id === value);
  const mustChoose = unavailableMessage !== null;
  const triggerLabel = selected
    ? selected.name
    : mustChoose
      ? "Choose a design"
      : "Design: keep current";

  return (
    <div className="mq-design-refine">
      {mustChoose && !selected ? (
        <p className="mq-studio-refine-error" role="alert">{unavailableMessage}</p>
      ) : null}
      {systems.length ? (
        <DesignSystemMenu
          systems={systems}
          value={value}
          onChange={onChange}
          triggerLabel={triggerLabel}
          keepLabel={mustChoose
            ? undefined
            : `Keep current design${currentDesignName ? ` (${currentDesignName})` : ""}`}
          required={mustChoose && !selected}
          disabled={disabled}
        />
      ) : mustChoose ? (
        <p className="mq-design-status" role="status">
          {state.status === "loading"
            ? "Loading designs…"
            : state.status === "failed"
              ? "The designs could not be loaded."
              : "No designs are available right now."}
          {state.status === "failed" ? <button type="button" onClick={onReload}>Try again</button> : null}
        </p>
      ) : null}
    </div>
  );
}
