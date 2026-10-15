"use client";

import { Check, ChevronDown, Palette } from "lucide-react";
import type { DesignSystemSummary } from "./designSystems";

/** Sentinel for the "keep the current design" choice, which sends no `designSystemId`. */
export const KEEP_DESIGN_SYSTEM = "";

export function DesignSystemTrigger({
  label,
  isOpen,
  onToggle,
  disabled,
  controlsId,
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  disabled?: boolean;
  controlsId: string;
}) {
  return (
    <button
      type="button"
      className="mq-design-trigger"
      aria-expanded={isOpen}
      aria-controls={controlsId}
      onClick={onToggle}
      disabled={disabled}
      title="Choose a design"
    >
      <Palette size={14} aria-hidden="true" />
      <span>{label}</span>
      <ChevronDown size={13} aria-hidden="true" />
    </button>
  );
}

/**
 * Radio cards that show each Design System by name, summary and sample pages.
 * `keepLabel` adds a leading choice for "no change" (value `KEEP_DESIGN_SYSTEM`).
 */
export default function DesignSystemPicker({
  id,
  systems,
  value,
  onChange,
  keepLabel,
  disabled,
}: {
  id: string;
  systems: DesignSystemSummary[];
  value: string;
  onChange: (designSystemId: string) => void;
  keepLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div
      id={id}
      className="mq-design-picker"
      role="radiogroup"
      aria-label="Design"
    >
      {keepLabel ? (
        <label className={`mq-design-card is-keep${value === KEEP_DESIGN_SYSTEM ? " is-selected" : ""}`}>
          <input
            type="radio"
            name={id}
            value={KEEP_DESIGN_SYSTEM}
            checked={value === KEEP_DESIGN_SYSTEM}
            onChange={() => onChange(KEEP_DESIGN_SYSTEM)}
            disabled={disabled}
          />
          <span className="mq-design-card-head">
            <strong>{keepLabel}</strong>
            {value === KEEP_DESIGN_SYSTEM ? <Check size={14} aria-hidden="true" /> : null}
          </span>
          <small>Refine without changing how the document looks.</small>
        </label>
      ) : null}
      {systems.map((system) => (
        <label
          key={system.id}
          className={`mq-design-card${value === system.id ? " is-selected" : ""}`}
        >
          <input
            type="radio"
            name={id}
            value={system.id}
            checked={value === system.id}
            onChange={() => onChange(system.id)}
            disabled={disabled}
          />
          <span className="mq-design-card-head">
            <strong>{system.name}</strong>
            {value === system.id ? <Check size={14} aria-hidden="true" /> : null}
          </span>
          {system.summary ? <small>{system.summary}</small> : null}
          {system.previews.length ? (
            <span className="mq-design-previews">
              {system.previews.map((path, index) => (
                // Same-origin paths from the API, served through the /api/v1 rewrite.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={path}
                  src={path}
                  alt={`${system.name} sample page ${index + 1}`}
                  loading="lazy"
                  width={540}
                  height={675}
                />
              ))}
            </span>
          ) : null}
        </label>
      ))}
    </div>
  );
}
