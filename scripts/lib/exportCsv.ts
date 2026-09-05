// Pure row-builder for pnpm export-csv — a flat, all-statuses CSV for the
// seller's own record-keeping. NOT the Facebook Marketplace format (that's
// pnpm fb-export / scripts/export-facebook.ts, a different tool with its own
// column set, title/description truncation, and FB category mapping).
import type { Item } from "@/lib/content/types";
import { resolvePriceByStrategy } from "@/lib/utils/pricing";

// Column choices: identity + lifecycle + pricing fields a seller would want
// in a spreadsheet for their own bookkeeping (e.g. "what did I sell and for
// how much"). `price` is the lowest resolved tier (same strategy pnpm
// inventory and fb-export's default use) — a single number is far more
// useful in a spreadsheet cell than the raw tiers array. `tags` is
// semicolon-joined so a single cell holds the whole list without breaking
// the CSV's own comma delimiter.
export const EXPORT_CSV_HEADERS = [
  "name",
  "category",
  "status",
  "condition",
  "price",
  "currency",
  "negotiable",
  "brand",
  "model",
  "quantity",
  "listed_date",
  "sold_date",
  "tags",
] as const;

export function buildExportCsvRows(items: Item[]): string[][] {
  return items.map((item) => {
    const resolved = resolvePriceByStrategy(item.price.tiers, "lowest");
    return [
      item.name,
      item.categorySlug,
      item.status,
      item.condition,
      resolved !== null ? String(resolved.amount) : "",
      item.price.currency || "",
      item.price.negotiable ? "yes" : "no",
      item.brand,
      item.model,
      String(item.quantity),
      item.listedDate,
      item.soldDate ?? "",
      item.tags.join(";"),
    ];
  });
}
