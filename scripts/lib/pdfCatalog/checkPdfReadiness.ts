import type { StudioItem } from "../studioApi";

export type PdfReadinessFlag = "photos" | "description" | "price";

export type PdfReadinessWarning = {
  id: string;
  name: string;
  missing: PdfReadinessFlag[];
};

export function checkPdfReadiness(items: StudioItem[]): PdfReadinessWarning[] {
  const warnings: PdfReadinessWarning[] = [];
  for (const item of items) {
    const missing: PdfReadinessFlag[] = [];
    if (item.imageCount === 0) missing.push("photos");
    if (!item.description || item.description.trim() === "") missing.push("description");
    if (item.lowestTierAmount === null) missing.push("price");
    if (missing.length > 0) {
      warnings.push({ id: item.id, name: item.name, missing });
    }
  }
  return warnings;
}
