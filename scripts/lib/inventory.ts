// Pure Markdown-table builder for pnpm inventory. No file writes — the CLI
// wrapper (scripts/inventory.ts) only prints the returned string to stdout.
import type { Item } from "@/lib/content/types";
import { resolvePriceByStrategy } from "@/lib/utils/pricing";
import { daysListed } from "./itemAge";

const HEADER = "| Name | Category | Status | Price | Days Listed |\n|---|---|---|---|---|";

// "Lowest resolved price" — same strategy pnpm fb-export defaults to (see
// scripts/export-facebook.ts's stepPriceStrategy) — so the number a seller
// sees here matches what they'd see if they exported today.
function priceLabel(item: Item): string {
  const resolved = resolvePriceByStrategy(item.price.tiers, "lowest");
  if (resolved === null) return "—";
  const currency = item.price.currency || "USD";
  return `${currency} ${Math.round(resolved.amount)}`;
}

// Markdown table cells can't contain a literal "|" or newline without
// breaking the table; both are escaped/collapsed rather than rejected, since
// seller-authored names/tags are free text with no such restriction upstream.
function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/**
 * Renders every item (all statuses — this is a read-only inventory report,
 * not a buyer-facing filter) as a Markdown table: name, category, status,
 * lowest resolved price, and days listed (raw whole-day count via
 * scripts/lib/itemAge.ts — the same day math pnpm stale-check and
 * pnpm semester-end use, so the numbers never disagree across scripts).
 * Sorted by category, then name, for stable/readable output.
 */
export function buildInventoryTable(items: Item[], now: Date = new Date()): string {
  if (items.length === 0) {
    return `${HEADER}\n| _(no items found)_ | | | | |\n`;
  }

  const sorted = [...items].sort((a, b) => {
    const catCmp = a.categorySlug.localeCompare(b.categorySlug);
    return catCmp !== 0 ? catCmp : a.name.localeCompare(b.name);
  });

  const rows = sorted.map((item) => {
    const days = daysListed(item.listedDate, now);
    return `| ${escapeCell(item.name)} | ${escapeCell(item.categorySlug)} | ${item.status} | ${priceLabel(item)} | ${days} |`;
  });

  return [HEADER, ...rows].join("\n") + "\n";
}
