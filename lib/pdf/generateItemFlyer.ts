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
import type { MeasurementUnit } from "@/lib/utils/units";
import {
  buildFlyerPriceLines,
  buildFlyerSpecs,
  buildLiveListingUrl,
  normalizeForPdf,
  DEFAULT_FLYER_LABELS,
  type FlyerItemView,
  type FlyerLabels,
} from "./flyerContent";

const PAGE_WIDTH = 215.9; // Letter, mm
const PAGE_HEIGHT = 279.4; // Letter, mm
const MARGIN = 18;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const PAGE_BOTTOM = PAGE_HEIGHT - MARGIN;

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

type ImageFormat = "JPEG" | "PNG" | "WEBP" | "GIF";

function sniffImageFormat(dataUrl: string): ImageFormat | null {
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
  unitSystem?: MeasurementUnit;
  labels?: FlyerLabels;
};

// Draws `lines` (already word-wrapped via doc.splitTextToSize) one at a time
// so long text pages correctly — doc.text() does NOT paginate on its own, it
// only draws every line at increasing y, silently running off the bottom of
// the page for anything that doesn't fit.
function drawWrappedLines(doc: jsPDF, lines: string[], x: number, startY: number, lineHeight: number): number {
  let y = startY;
  for (const line of lines) {
    if (y > PAGE_BOTTOM) {
      doc.addPage();
      y = MARGIN;
    }
    doc.text(line, x, y);
    y += lineHeight;
  }
  return y;
}

// Builds the underlying jsPDF document. Exported separately from
// generateItemFlyerPdf (which just calls .output("blob") on this) so tests
// can assert on doc.getNumberOfPages() and similar without having to parse
// PDF bytes back out of a Blob.
export async function buildFlyerDocument({
  item,
  resolvedTier,
  siteName,
  baseUrl,
  unitSystem = "metric",
  labels = DEFAULT_FLYER_LABELS,
}: GenerateItemFlyerParams): Promise<jsPDF> {
  // Cover image first, then up to 3 more, deduplicated — same precedent as
  // scripts/lib/pdfCatalog/template.ts's buildItemHtml (independent
  // reimplementation; that file is not imported here).
  const photoUrls = [item.coverImage, ...item.images.filter((src) => src !== item.coverImage)]
    .filter((src): src is string => src !== null)
    .slice(0, 4);

  // Fetched in parallel; each failure resolves to null independently so one
  // broken/CORS-blocked photo never drops the others. sniffImageFormat is
  // applied up front and unrecognized formats are filtered out here too, so
  // the later grid-drawing step only ever sees photos it can actually place
  // — a dropped photo just shrinks the grid instead of leaving an empty cell
  // where a later photo "shifted into" the wrong slot.
  const photos = (await Promise.all(photoUrls.map((url) => fetchImageAsDataUrl(url))))
    .filter((dataUrl): dataUrl is string => dataUrl !== null)
    .map((dataUrl) => ({ dataUrl, format: sniffImageFormat(dataUrl) }))
    .filter((p): p is { dataUrl: string; format: ImageFormat } => p.format !== null);

  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const itemName = normalizeForPdf(item.name);
  doc.setProperties({ title: itemName });
  let y = MARGIN;

  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(normalizeForPdf(siteName), MARGIN, y);
  y += 10;

  doc.setFontSize(22);
  doc.setTextColor(20);
  const nameLines = doc.splitTextToSize(itemName, CONTENT_WIDTH);
  y = drawWrappedLines(doc, nameLines, MARGIN, y, 9) + 2;

  const { headline, obo, tierRows } = buildFlyerPriceLines(item.price, resolvedTier, labels);
  doc.setFontSize(18);
  doc.setTextColor(0);
  doc.text(obo ? `${headline} ${labels.obo}` : headline, MARGIN, y);
  y += 10;

  if (tierRows.length > 0) {
    doc.setFontSize(10);
    for (const row of tierRows) {
      if (y > PAGE_BOTTOM) {
        doc.addPage();
        y = MARGIN;
      }
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
    const rowCount = Math.ceil(photos.length / cols);
    const gridHeight = rowCount * cellHeight + (rowCount - 1) * gap;

    // Keep the whole photo grid together rather than splitting a row of
    // photos across a page break.
    if (y + gridHeight > PAGE_BOTTOM) {
      doc.addPage();
      y = MARGIN;
    }

    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i]!;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cellX = MARGIN + col * (cellWidth + gap);
      const cellY = y + row * (cellHeight + gap);

      // Contain-fit within the cell instead of stretching to fill it, so
      // portrait/landscape photos keep their aspect ratio.
      try {
        const props = doc.getImageProperties(photo.dataUrl);
        const scale = Math.min(cellWidth / props.width, cellHeight / props.height);
        const drawWidth = props.width * scale;
        const drawHeight = props.height * scale;
        const drawX = cellX + (cellWidth - drawWidth) / 2;
        const drawY = cellY + (cellHeight - drawHeight) / 2;
        doc.addImage(photo.dataUrl, photo.format, drawX, drawY, drawWidth, drawHeight, undefined, "FAST");
      } catch {
        // Corrupt/unsupported image bytes despite passing the format sniff —
        // skip this photo, keep the rest of the grid.
      }
    }
    y += gridHeight + 4;
  }

  const specs = buildFlyerSpecs(item, unitSystem, labels);
  if (specs.length > 0) {
    doc.setFontSize(11);
    for (const [label, value] of specs) {
      if (y > PAGE_BOTTOM) {
        doc.addPage();
        y = MARGIN;
      }
      doc.setTextColor(130);
      doc.text(label, MARGIN, y);
      doc.setTextColor(20);
      doc.text(value, MARGIN + 40, y);
      y += 6;
    }
    y += 4;
  }

  if (item.description) {
    doc.setFontSize(11);
    doc.setTextColor(20);
    const descLines = doc.splitTextToSize(normalizeForPdf(item.description), CONTENT_WIDTH);
    y = drawWrappedLines(doc, descLines, MARGIN, y, 5) + 6;
  }

  const liveUrl = buildLiveListingUrl(baseUrl, item);
  if (y > PAGE_BOTTOM) {
    doc.addPage();
    y = MARGIN;
  }
  doc.setFontSize(10);
  doc.setTextColor(30, 80, 160);
  doc.textWithLink(labels.viewLiveListing, MARGIN, y, { url: liveUrl });
  y += 5;
  doc.setTextColor(130);
  doc.text(liveUrl, MARGIN, y);

  return doc;
}

export async function generateItemFlyerPdf(params: GenerateItemFlyerParams): Promise<Blob> {
  const doc = await buildFlyerDocument(params);
  return doc.output("blob");
}
