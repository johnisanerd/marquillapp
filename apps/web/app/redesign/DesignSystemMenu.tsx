"use client";

import { Check, ChevronDown, Palette, Plus } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { DesignSystemSummary } from "./designSystems";

/** Sentinel for the "keep the current design" choice, which sends no `designSystemId`. */
export const KEEP_DESIGN_SYSTEM = "";

type PreviewSide = "left" | "right" | "above";

// Keep in step with `.mq-design-preview` in globals.css.
const PREVIEW_WIDTH = 440;
const PREVIEW_GAP = 10;
const VIEWPORT_MARGIN = 12;
const KEEP_KEY = "keep";

/** The first preview page, cropped round, stands in for a colour the API does not give. */
function Swatch({ system }: { system?: DesignSystemSummary }) {
  const source = system?.previews[0];
  return (
    <span className="mq-design-swatch" aria-hidden="true">
      {source ? (
        // Same-origin path from the API, served through the /api/v1 rewrite.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={source} alt="" width={22} height={22} loading="lazy" />
      ) : (
        <Palette size={12} />
      )}
    </span>
  );
}

function PreviewCard({
  id,
  system,
  side,
}: {
  id: string;
  system: DesignSystemSummary;
  side: PreviewSide;
}) {
  return (
    <div id={id} role="tooltip" className={`mq-design-preview is-${side}`}>
      {system.previews.length ? (
        <div className="mq-design-preview-pages">
          {system.previews.map((path, index) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={path}
              src={path}
              alt={`${system.name} sample page ${index + 1}`}
              width={540}
              height={675}
            />
          ))}
        </div>
      ) : null}
      <strong>{system.name}</strong>
      {system.summary ? <p>{system.summary}</p> : null}
    </div>
  );
}

/**
 * A compact swatch pill that opens a menu of Design Systems; hovering or arrowing to
 * a row floats a larger card with that system's sample pages beside the menu.
 *
 * `createOwn` adds the disabled "Create your own design system" action, and `keepLabel`
 * a leading "no change" choice (value `KEEP_DESIGN_SYSTEM`). The menu opens upward and
 * `align` names the trigger edge it lines up with.
 */
export default function DesignSystemMenu({
  systems,
  value,
  onChange,
  triggerLabel,
  triggerAriaLabel,
  keepLabel,
  createOwn,
  align = "start",
  required,
  disabled,
}: {
  systems: DesignSystemSummary[];
  value: string;
  onChange: (designSystemId: string) => void;
  /** Visible text on the trigger. */
  triggerLabel: string;
  /** Accessible name for the trigger; defaults to the visible text. */
  triggerAriaLabel?: string;
  keepLabel?: string;
  createOwn?: boolean;
  align?: "start" | "end";
  /** Marks the trigger as needing a choice before the form can proceed. */
  required?: boolean;
  disabled?: boolean;
}) {
  const menuId = useId();
  const previewId = `${menuId}-preview`;
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [previewSide, setPreviewSide] = useState<PreviewSide>("right");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const focusOnOpen = useRef(false);

  const selected = systems.find((system) => system.id === value);
  const activeKey = hoveredKey ?? focusedKey;
  const activeSystem = systems.find((system) => system.id === activeKey);

  const items = useCallback(
    () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>("[data-design-item]") ?? []),
    [],
  );

  const close = useCallback((restoreFocus: boolean) => {
    setIsOpen(false);
    setHoveredKey(null);
    setFocusedKey(null);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  // Pick the side of the menu with room for the preview card, else float it above.
  useLayoutEffect(() => {
    if (!isOpen) return;
    function place() {
      const panel = panelRef.current?.getBoundingClientRect();
      if (!panel) return;
      const needed = PREVIEW_WIDTH + PREVIEW_GAP + VIEWPORT_MARGIN;
      const room = { left: panel.left, right: window.innerWidth - panel.right };
      const order: ("left" | "right")[] = align === "end" ? ["left", "right"] : ["right", "left"];
      setPreviewSide(order.find((side) => room[side] >= needed) ?? "above");
    }
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [isOpen, align]);

  // A keyboard open lands on the chosen row; a pointer open leaves focus on the trigger.
  useEffect(() => {
    if (!isOpen || !focusOnOpen.current) return;
    focusOnOpen.current = false;
    const all = items();
    (all.find((item) => item.getAttribute("aria-checked") === "true") ?? all[0])?.focus();
  }, [isOpen, items]);

  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      const hadFocus = rootRef.current?.contains(document.activeElement) ?? false;
      close(false);
      // Clicking a non-focusable area drops focus to <body>; give it back to the trigger.
      if (hadFocus) {
        setTimeout(() => {
          if (!document.activeElement || document.activeElement === document.body) {
            triggerRef.current?.focus();
          }
        }, 0);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        close(true);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, close]);

  function open(withFocus: boolean) {
    focusOnOpen.current = withFocus;
    setIsOpen(true);
  }

  function moveFocus(step: 1 | -1 | "first" | "last") {
    const all = items();
    if (!all.length) return;
    const current = all.indexOf(document.activeElement as HTMLElement);
    const next = step === "first"
      ? 0
      : step === "last"
        ? all.length - 1
        : (current + step + all.length) % all.length;
    all[next]?.focus();
  }

  function onTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    if (!isOpen) open(true);
    else moveFocus(event.key === "ArrowDown" ? "first" : "last");
  }

  function onPanelKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const steps: Record<string, 1 | -1 | "first" | "last"> = {
      ArrowDown: 1,
      ArrowUp: -1,
      Home: "first",
      End: "last",
    };
    if (event.key === "Tab") {
      close(false);
      return;
    }
    const step = steps[event.key];
    if (step === undefined) return;
    event.preventDefault();
    moveFocus(step);
  }

  function choose(designSystemId: string) {
    onChange(designSystemId);
    close(true);
  }

  function rowProps(key: string) {
    return {
      "data-design-item": "",
      "data-active": activeKey === key ? "" : undefined,
      onMouseEnter: () => setHoveredKey(key),
      onFocus: () => setFocusedKey(key),
      onBlur: () => setFocusedKey((current) => (current === key ? null : current)),
    };
  }

  return (
    <div ref={rootRef} className={`mq-design-menu-root is-align-${align}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`mq-design-trigger${required ? " is-required" : ""}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        aria-label={triggerAriaLabel}
        onClick={(event) => (isOpen ? close(false) : open(event.detail === 0))}
        onKeyDown={onTriggerKeyDown}
        disabled={disabled}
        title="Choose a design"
      >
        {selected ? <Swatch system={selected} /> : <Palette size={14} aria-hidden="true" />}
        <span className="mq-design-trigger-name">{triggerLabel}</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>

      {isOpen ? (
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          aria-label="Design"
          className="mq-design-menu"
          onKeyDown={onPanelKeyDown}
          onMouseLeave={() => setHoveredKey(null)}
        >
          {createOwn ? (
            <div role="menuitem" aria-disabled="true" className="mq-design-row is-action is-disabled">
              <Plus size={16} aria-hidden="true" />
              <span>Create your own design system</span>
              <em>Coming soon</em>
            </div>
          ) : null}
          {keepLabel ? (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={value === KEEP_DESIGN_SYSTEM}
              className={`mq-design-row${value === KEEP_DESIGN_SYSTEM ? " is-selected" : ""}`}
              onClick={() => choose(KEEP_DESIGN_SYSTEM)}
              {...rowProps(KEEP_KEY)}
            >
              <Palette size={16} aria-hidden="true" />
              <span>{keepLabel}</span>
              {value === KEEP_DESIGN_SYSTEM ? <Check size={14} aria-hidden="true" /> : null}
            </button>
          ) : null}
          <div className="mq-design-section" id={`${menuId}-heading`}>Marquill designs</div>
          <div role="group" aria-labelledby={`${menuId}-heading`} className="mq-design-list">
            {systems.map((system) => (
              <button
                key={system.id}
                type="button"
                role="menuitemradio"
                aria-checked={value === system.id}
                aria-describedby={activeKey === system.id ? previewId : undefined}
                className={`mq-design-row${value === system.id ? " is-selected" : ""}`}
                onClick={() => choose(system.id)}
                {...rowProps(system.id)}
              >
                <Swatch system={system} />
                <span>{system.name}</span>
              </button>
            ))}
          </div>
          {activeSystem ? (
            <PreviewCard id={previewId} system={activeSystem} side={previewSide} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
