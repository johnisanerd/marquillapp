"use client";

import { MoreHorizontal, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

/** The Artifact Studio topbar's secondary actions, kept behind one button so Delete is not one stray click away. */
export default function StudioOverflowMenu({
  onDelete,
  disabled,
}: {
  onDelete: () => void;
  disabled?: boolean;
}) {
  const menuId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className="mq-studio-overflow">
      <button
        ref={triggerRef}
        type="button"
        className="mq-studio-overflow-trigger"
        aria-label="More artifact actions"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={() => setIsOpen((current) => !current)}
      >
        <MoreHorizontal size={17} />
      </button>
      {isOpen ? (
        <div id={menuId} role="menu" className="mq-studio-overflow-menu">
          <button
            type="button"
            role="menuitem"
            className="is-danger"
            disabled={disabled}
            onClick={() => {
              setIsOpen(false);
              onDelete();
            }}
          >
            <Trash2 size={14} /> Delete artifact
          </button>
        </div>
      ) : null}
    </div>
  );
}
