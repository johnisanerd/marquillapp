"use client";

import { FileText } from "lucide-react";
import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export default function PdfThumbnailRenderer({ source, width }: { source: string; width: number }) {
  const [failed, setFailed] = useState(false);
  const placeholder = <span className="mq-pdf-thumbnail-fallback"><FileText size={18} /></span>;

  if (failed) return placeholder;
  return (
    <Document file={source} loading={placeholder} error={placeholder} onLoadError={() => setFailed(true)}>
      <Page
        pageNumber={1}
        width={width}
        renderTextLayer={false}
        renderAnnotationLayer={false}
        loading={placeholder}
        onRenderError={() => setFailed(true)}
      />
    </Document>
  );
}
