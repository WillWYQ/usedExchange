// Single-item flyer PDF generation. This module imports `jspdf` at module
// scope on purpose — callers must never import this file eagerly. It is
// meant to be reached only via a dynamic `await import("@/lib/pdf/generateItemFlyer")`
// from a click handler (see components/item/FlyerButton.tsx), which is the
// chunk boundary that keeps jsPDF out of the main/initial JS bundle.
//
// This is a separate, new public-site feature — it must never import from or
// be imported by scripts/lib/pdfCatalog/** (the existing Seller Studio
// catalog PDF export), which is out of scope for this feature.

import { jsPDF } from "jspdf";
import type { PriceTier } from "@/lib/content/types";
import { buildFlyerPriceLines, buildFlyerSpecs, buildLiveListingUrl, type FlyerItemView } from "./flyerContent";

const PAGE_WIDTH = 215.9; // Letter, mm
const MARGIN = 18;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// Fetches a remote image and returns it as a data URL, or null on any
// failure (CORS block, network error, non-2xx). R2/CDN CORS is documented as
// optional (docs/setup_instruction.md) — a seller who hasn't enabled it must
// still get a working flyer, just without that photo. Never throws.
export async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function sniffImageFormat(dataUrl: string): "JPEG" | "PNG" | "WEBP" | "GIF" | null {
  if (dataUrl.startsWith("data:image/png")) return "PNG";
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) return "JPEG";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  if (dataUrl.startsWith("data:image/gif")) return "GIF";
  return null;
}

export type GenerateItemFlyerParams = {
  item: FlyerItemView;
  resolvedTier: PriceTier | null;
  siteName: string;
  baseUrl: string;
};

export async function generateItemFlyerPdf({
  item,
  resolvedTier,
  siteName,
  baseUrl,
}: GenerateItemFlyerParams): Promise<Blob> {
  // Cover image first, then up to 3 more, deduplicated — same precedent as
  // scripts/lib/pdfCatalog/template.ts's buildItemHtml (independent
  // reimplementation; that file is not imported here).
  const photoUrls = [item.coverImage, ...item.images.filter((src) => src !== item.coverImage)]
    .filter((src): src is string => src !== null)
    .slice(0, 4);

  // Fetched in parallel; each failure resolves to null independently so one
  // broken/CORS-blocked photo never drops the others.
  const photos = (await Promise.all(photoUrls.map((url) => fetchImageAsDataUrl(url)))).filter(
    (dataUrl): dataUrl is string => dataUrl !== null,
  );

  const doc = new jsPDF({ unit: "mm", format: "letter" });
  let y = MARGIN;

  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(siteName, MARGIN, y);
  y += 10;

  doc.setFontSize(22);
  doc.setTextColor(20);
  const nameLines = doc.splitTextToSize(item.name, CONTENT_WIDTH);
  doc.text(nameLines, MARGIN, y);
  y += nameLines.length * 9 + 2;

  const { headline, obo, tierRows } = buildFlyerPriceLines(item.price, resolvedTier);
  doc.setFontSize(18);
  doc.setTextColor(0);
  doc.text(obo ? `${headline} OBO` : headline, MARGIN, y);
  y += 10;

  if (tierRows.length > 0) {
    doc.setFontSize(10);
    for (const row of tierRows) {
      doc.setTextColor(row.isDefault ? 0 : 130);
      doc.text(`${row.label}: ${row.amount}`, MARGIN, y);
      y += 5;
    }
    doc.setTextColor(0);
    y += 3;
  }

  if (photos.length > 0) {
    const cols = 2;
    const gap = 4;
    const cellWidth = (CONTENT_WIDTH - gap * (cols - 1)) / cols;
    const cellHeight = 45;
    for (let i = 0; i < photos.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = MARGIN + col * (cellWidth + gap);
      const imgY = y + row * (cellHeight + gap);
      const format = sniffImageFormat(photos[i]!);
      if (format) {
        try {
          doc.addImage(photos[i]!, format, x, imgY, cellWidth, cellHeight, undefined, "FAST");
        } catch {
          // Corrupt/unsupported image bytes — skip this photo, keep the rest.
        }
      }
    }
    const rowCount = Math.ceil(photos.length / cols);
    y += rowCount * (cellHeight + gap) + 4;
  }

  const specs = buildFlyerSpecs(item, "metric");
  if (specs.length > 0) {
    doc.setFontSize(11);
    for (const [label, value] of specs) {
      if (y > 260) {
        doc.addPage();
        y = MARGIN;
      }
      doc.setTextColor(130);
      doc.text(`${label}`, MARGIN, y);
      doc.setTextColor(20);
      doc.text(value, MARGIN + 40, y);
      y += 6;
    }
    y += 4;
  }

  if (item.description) {
    if (y > 250) {
      doc.addPage();
      y = MARGIN;
    }
    doc.setFontSize(11);
    doc.setTextColor(20);
    const descLines = doc.splitTextToSize(item.description, CONTENT_WIDTH);
    doc.text(descLines, MARGIN, y);
    y += descLines.length * 5 + 6;
  }

  const liveUrl = buildLiveListingUrl(baseUrl, item);
  if (y > 270) {
    doc.addPage();
    y = MARGIN;
  }
  doc.setFontSize(10);
  doc.setTextColor(30, 80, 160);
  doc.textWithLink("View Live Listing", MARGIN, y, { url: liveUrl });
  y += 5;
  doc.setTextColor(130);
  doc.text(liveUrl, MARGIN, y);

  return doc.output("blob");
}
