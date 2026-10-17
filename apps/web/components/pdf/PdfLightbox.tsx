"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import PdfPreview, { type PdfSource } from "./PdfPreview";

/** A full-screen viewer for reading a PDF's pages at the largest size the screen allows. */
export default function PdfLightbox({
  source,
  title,
  pageCountHint,
  openHref,
  onClose,
}: {
  source: PdfSource;
  title?: string;
  pageCountHint?: number;
  openHref?: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onClose]);

  return createPortal(
    <div
      className="mq-pdf-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={title ? `${title} full-screen preview` : "Full-screen PDF preview"}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="mq-pdf-lightbox-panel">
        <button ref={closeRef} type="button" className="mq-pdf-lightbox-close" onClick={onClose} aria-label="Close full-screen preview">
          <X size={18} />
        </button>
        <PdfPreview
          source={source}
          title={title}
          pageCountHint={pageCountHint}
          openHref={openHref}
          fitViewportOffset={190}
          maxPageWidth={960}
          className="mq-pdf-preview-lightbox"
        />
      </div>
    </div>,
    document.body,
  );
}
