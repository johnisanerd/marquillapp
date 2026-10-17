"use client";

import dynamic from "next/dynamic";
import { FileText } from "lucide-react";

const PdfThumbnailRenderer = dynamic(() => import("./PdfThumbnailRenderer"), {
  ssr: false,
  loading: () => <span className="mq-pdf-thumbnail-fallback"><FileText size={18} /></span>,
});

/** The first page of a PDF at thumbnail size, so a carousel can be recognised at a glance. */
export default function PdfThumbnail({
  source,
  width = 64,
  label,
}: {
  source: string;
  width?: number;
  label: string;
}) {
  return (
    <span className="mq-pdf-thumbnail" style={{ width }} role="img" aria-label={label}>
      <PdfThumbnailRenderer source={source} width={width} />
    </span>
  );
}
