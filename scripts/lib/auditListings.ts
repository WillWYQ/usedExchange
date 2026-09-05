// Pure "which items are missing recommended fields" logic for pnpm
// audit-listings. No file writes — the CLI wrapper only prints the report.
//
// ── Audit criteria (documented here so it's easy to find and adjust) ────────
// Every field checked below is schema-OPTIONAL (lib/content/schema.ts) —
// this is not a validity check, it's a "you could make this listing better"
// check. An item is flagged when:
//
//   1. It has zero photos at all (item.images.length === 0). Not "no
//      dedicated cover.* file" — lib/utils/coverImage.ts's pickCoverFilename
//      always falls back to the first alphabetical image, so a cover.*
//      convention violation is invisible to buyers; having NO photos is the
//      real problem worth flagging.
//   2. `description` is empty/whitespace-only.
//   3. `tags` is empty — hurts search (fuse.js indexes tags) and the /tags
//      cross-category browsing feature.
//   4. The item has an open-ended ("ships anywhere") price tier — a tier
//      with no `miles_max` — but is missing `weight` and/or `dimensions`.
//      DESIGN.md §21's ShippingEstimator needs both to quote a live carrier
//      rate; without them a buyer who would ship this item sees no estimate
//      at all.
//   5. `price.tiers` is empty — the item detail page falls back to "Contact
//      for price" with nothing else to go on.
//
// Sold items are skipped: a completed sale has no further use for any of
// these fixes.
import type { Item } from "@/lib/content/types";

export type AuditResult = {
  slug: string; // "<category>/<item>"
  name: string;
  issues: string[];
};

function hasOpenEndedShippingTier(item: Item): boolean {
  return item.price.tiers.some((t) => t.miles_max === undefined);
}

/** The recommended-field issues found on a single item, criteria #1-5 above. */
export function auditItem(item: Item): string[] {
  const issues: string[] = [];

  if (item.images.length === 0) issues.push("no photos");
  if (!item.description.trim()) issues.push("empty description");
  if (item.tags.length === 0) issues.push("no tags");
  if (hasOpenEndedShippingTier(item) && (!item.weight || !item.dimensions)) {
    issues.push("has a shipping tier but missing weight/dimensions");
  }
  if (item.price.tiers.length === 0) issues.push("no price tiers set");

  return issues;
}

/** Every non-sold item with at least one issue, sorted by "<category>/<item>". */
export function auditListings(items: Item[]): AuditResult[] {
  return items
    .filter((item) => item.status !== "sold")
    .map((item) => ({
      slug: `${item.categorySlug}/${item.itemSlug}`,
      name: item.name,
      issues: auditItem(item),
    }))
    .filter((result) => result.issues.length > 0)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Renders auditListings' output as human-readable text for stdout. */
export function formatAuditReport(results: AuditResult[]): string {
  if (results.length === 0) {
    return "✓ No issues found — every non-sold listing has all recommended fields.\n";
  }

  const lines: string[] = [
    `${results.length} listing${results.length === 1 ? "" : "s"} with recommended-field gaps:\n`,
  ];
  for (const result of results) {
    lines.push(`${result.slug}  (${result.name})`);
    for (const issue of result.issues) lines.push(`  - ${issue}`);
  }
  return lines.join("\n") + "\n";
}
