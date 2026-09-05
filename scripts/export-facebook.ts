// scripts/export-facebook.ts
// Usage: pnpm fb-export
//
// Interactive CLI that exports available items to a Facebook Marketplace
// bulk-upload CSV. Supports selecting all items, by category, or individual
// items via a numbered list. Batches output into 50-item files (FB limit).
//
// On subsequent runs, Step 0 offers to skip items already exported in a
// previous session. History is persisted in exports/.export-history.json.

import fs from "fs/promises";
import { existsSync, mkdirSync, readdirSync } from "fs";
import path from "path";
import { loadAllItemsRaw } from "@/lib/content/loader";
import type { Item } from "@/lib/content/types";
import { resolvePriceByStrategy, type PriceStrategy } from "@/lib/utils/pricing";
import { mapToFBCategory } from "./lib/fbCategoryMap";
import {
  loadHistory,
  appendRun,
  allExportedSlugs,
  lastRun,
  formatRunDate,
  type ExportRun,
} from "./lib/exportHistory";
import { createPrompt } from "./lib/cliPrompt";
import { toCsvString } from "./lib/csv";

// ── Constants ─────────────────────────────────────────────────────────────────

const EXPORTS_DIR = path.join(process.cwd(), "exports");
const FB_BATCH_LIMIT = 50;
const FB_TITLE_MAX = 150;
const FB_DESC_MAX = 5000;
const FB_PHOTO_LIMIT = 10;

/** Statuses eligible for FB export (excludes sold / draft). */
const EXPORTABLE_STATUSES = new Set(["available", "pending", "reserved"]);

const CSV_HEADERS_BASE = [
  "TITLE",
  "PRICE",
  "CONDITION",
  "DESCRIPTION",
  "CATEGORY",
  "SHIPPING WEIGHT",
  "OFFER FREE SHIPPING",
  "OFFER SHIPPING",
];

function buildCsvHeaders(photoCount: number): string[] {
  const photos = Array.from({ length: photoCount }, (_, i) => `PHOTO ${i + 1}`);
  return [...CSV_HEADERS_BASE, ...photos];
}

const CONDITION_MAP: Record<string, string> = {
  new: "New",
  "like-new": "Used - Like New",
  good: "Used - Good",
  fair: "Used - Fair",
  "for-parts": "Used - Fair", // FB has no "For Parts" option
};

// ── Shipping helpers ───────────────────────────────────────────────────────────

/** True when item has at least one open-ended tier (no miles_max → ships anywhere). */
function hasShippingTier(item: Item): boolean {
  return item.price.tiers.some((t) => t.miles_max === undefined);
}

function shippingIsFree(item: Item): boolean {
  return item.price.shipping_payer === "seller";
}

// ── Field builders ─────────────────────────────────────────────────────────────

function buildTitle(item: Item): string {
  // Avoid duplicating brand/model if they already appear in name
  const prefix =
    item.brand && item.model ? `${item.brand} ${item.model}` : item.brand || item.model;
  const title =
    prefix && !item.name.toLowerCase().includes(prefix.toLowerCase())
      ? `${prefix} – ${item.name}`
      : item.name;
  return title.slice(0, FB_TITLE_MAX);
}

function buildDescription(item: Item): string {
  const meta: string[] = [];
  if (item.brand) meta.push(`Brand: ${item.brand}`);
  if (item.model) meta.push(`Model: ${item.model}`);
  if (item.color) meta.push(`Color: ${item.color}`);
  if (item.ageYears !== null)
    meta.push(`Age: ~${item.ageYears} year${item.ageYears !== 1 ? "s" : ""}`);
  if (item.originalPrice !== null) meta.push(`Original price: $${item.originalPrice}`);
  if (item.tags.length) meta.push(`Tags: ${item.tags.join(", ")}`);
  if (item.isbn) meta.push(`ISBN: ${item.isbn}`);
  if (item.edition) meta.push(`Edition: ${item.edition}`);

  const suffix = meta.length ? `\n\n[${meta.join(" | ")}]` : "";
  return (item.description + suffix).slice(0, FB_DESC_MAX);
}

/** Returns only publicly reachable image URLs (https://…). Skips local /items/… paths. */
function publicImages(item: Item): string[] {
  return item.images.filter((u) => u.startsWith("http"));
}

function buildRow(item: Item, strategy: PriceStrategy, photoCount: number): string[] {
  const price = resolvePriceByStrategy(item.price.tiers, strategy)?.amount ?? null;

  let shippingWeight = "";
  if (item.weight && hasShippingTier(item)) {
    const lbs =
      item.weight.unit === "kg"
        ? (item.weight.value * 2.20462).toFixed(2)
        : item.weight.value.toFixed(2);
    shippingWeight = lbs;
  }

  const photos = publicImages(item).slice(0, photoCount);
  const photoCells = Array.from({ length: photoCount }, (_, i) => photos[i] ?? "");

  return [
    buildTitle(item),
    price !== null ? String(Math.round(price)) : "",
    CONDITION_MAP[item.condition] ?? "Used - Good",
    buildDescription(item),
    mapToFBCategory(item),
    shippingWeight,
    hasShippingTier(item) && shippingIsFree(item) ? "Yes" : "No",
    hasShippingTier(item) ? "Yes" : "No",
    ...photoCells,
  ];
}

// ── Item slug ─────────────────────────────────────────────────────────────────

function itemSlug(item: Item): string {
  return `${item.categorySlug}/${item.itemSlug}`;
}

// ── Local photo helpers ────────────────────────────────────────────────────────

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif|svg|bmp|tiff?)$/i;

/** Return image filenames from an item's content folder, sorted alphabetically. */
function localPhotoFiles(item: Item): string[] {
  try {
    const dir = path.join(process.cwd(), "content", "items", item.categorySlug, item.itemSlug);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => IMAGE_EXTENSIONS.test(f))
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  } catch {
    return [];
  }
}

/** Copy local photos for all selected items into exports/.
 *  Folders are named NNN_category-item (row number = CSV row order) so the
 *  order is obvious when manually uploading photos after a CSV import.
 *  Only copies files that are missing in the target directory. */
async function copyLocalPhotos(selected: Item[]): Promise<{ photoCount: number; hasPhotos: boolean }> {
  const PHOTO_FOLDER = "facebook-marketplace-photos";
  const photoDir = path.join(EXPORTS_DIR, PHOTO_FOLDER);

  const maxPhotos = Math.min(FB_PHOTO_LIMIT, Math.max(1, ...selected.map((i) => localPhotoFiles(i).length)));
  if (maxPhotos === 0) return { photoCount: 0, hasPhotos: false };

  mkdirSync(photoDir, { recursive: true });

  // Pad width so folders sort lexicographically in the same order as CSV rows.
  const pad = String(selected.length).length;

  for (let idx = 0; idx < selected.length; idx++) {
    const item = selected[idx];
    if (!item) continue;
    const files = localPhotoFiles(item);
    if (!files.length) continue;

    const rowNum = String(idx + 1).padStart(pad, "0");
    const subDir = path.join(photoDir, `${rowNum}_${item.categorySlug}-${item.itemSlug}`);
    mkdirSync(subDir, { recursive: true });

    for (const file of files.slice(0, FB_PHOTO_LIMIT)) {
      const dest = path.join(subDir, file);
      if (!existsSync(dest)) {
        await fs.copyFile(
          path.join(process.cwd(), "content", "items", item.categorySlug, item.itemSlug, file),
          dest,
        );
      }
    }
  }

  return { photoCount: maxPhotos, hasPhotos: true };
}

// ── CSV serialisation ──────────────────────────────────────────────────────────
// csvCell/toCsvString now live in ./lib/csv — shared with scripts/export-csv.ts.

async function writeBatch(headers: string[], rows: string[][], suffix?: number): Promise<string> {
  if (!existsSync(EXPORTS_DIR)) mkdirSync(EXPORTS_DIR, { recursive: true });
  const name =
    suffix !== undefined
      ? `facebook-marketplace-${suffix}.csv`
      : "facebook-marketplace.csv";
  const filepath = path.join(EXPORTS_DIR, name);
  await fs.writeFile(filepath, toCsvString(headers, rows), "utf-8");
  return filepath;
}

// ── Terminal UI helpers ────────────────────────────────────────────────────────

const { ask, closeInput } = createPrompt();

function section(title: string): void {
  const pad = Math.max(0, 46 - title.length);
  console.log(`\n── ${title} ${"─".repeat(pad)}`);
}

function parseSelection(input: string, max: number): number[] {
  const result = new Set<number>();
  for (const part of input.split(",")) {
    const range = part.trim().match(/^(\d+)-(\d+)$/);
    if (range) {
      const [, lo, hi] = range;
      for (let i = parseInt(lo ?? "0", 10); i <= parseInt(hi ?? "0", 10); i++) {
        result.add(i);
      }
    } else {
      const n = parseInt(part.trim(), 10);
      if (!isNaN(n)) result.add(n);
    }
  }
  return [...result].filter((n) => n >= 1 && n <= max).sort((a, b) => a - b);
}

// ── Step 0 — Export history ───────────────────────────────────────────────────

/**
 * When a previous export exists, asks the user whether to skip already-exported
 * items. Returns the set of slugs to exclude (empty = export everything).
 */
async function stepHistory(items: Item[]): Promise<Set<string>> {
  const history = await loadHistory();
  const last = lastRun(history);

  // No history yet — skip this step entirely
  if (!last) return new Set();

  const exportedSlugs = allExportedSlugs(history);

  // Count how many of the current exportable items were in a previous run
  const alreadyExported = items.filter((i) => exportedSlugs.has(itemSlug(i)));
  const newItems = items.filter((i) => !exportedSlugs.has(itemSlug(i)));

  section("Step 0 · Export history");
  console.log(`  Last export:  ${formatRunDate(last.exportedAt)}`);
  console.log(`  Items exported across all runs:  ${exportedSlugs.size}`);
  console.log(
    `  Of your ${items.length} exportable items:  ${alreadyExported.length} already exported · ${newItems.length} new\n`,
  );

  if (alreadyExported.length === 0) {
    console.log("  All items are new since the last export — no items to skip.\n");
    return new Set();
  }

  console.log("  [s]  Skip already-exported items  ← recommended");
  console.log("  [v]  View previously exported items, then decide");
  console.log("  [n]  Export everything  (ignore history)");

  let choice = (await ask("\nYour choice [s]: ")).toLowerCase() || "s";

  // [v] — show the previously exported list, then re-ask
  if (choice === "v") {
    console.log("\n  Previously exported items:");

    // Group by run for readability
    for (let r = history.runs.length - 1; r >= 0; r--) {
      // history.runs[r] is ExportRun | undefined under noUncheckedIndexedAccess
      const run = history.runs[r];
      if (!run) continue;
      // Only show items that still exist in the current exportable pool
      const visible = run.items.filter((ri) =>
        items.some((i) => itemSlug(i) === ri.slug),
      );
      if (!visible.length) continue;
      console.log(`\n  Run ${r + 1}  ·  ${formatRunDate(run.exportedAt)}`);
      visible.forEach((ri) => {
        const priceStr = ri.price !== null ? `$${ri.price}` : "—";
        console.log(`    • ${ri.name.slice(0, 48).padEnd(49)} ${priceStr}`);
      });
    }

    console.log();
    console.log("  [s]  Skip these items");
    console.log("  [n]  Export everything");
    choice = (await ask("\nYour choice [s]: ")).toLowerCase() || "s";
  }

  if (choice === "n") return new Set();

  // Default / [s] — return the full set of previously exported slugs
  console.log(
    `\n  Skipping ${alreadyExported.length} already-exported item${alreadyExported.length !== 1 ? "s" : ""}.`,
  );
  return exportedSlugs;
}

// ── Step 1 — Item selection ───────────────────────────────────────────────────

async function stepSelectItems(items: Item[]): Promise<Item[]> {
  const byCategory = new Map<string, Item[]>();
  for (const item of items) {
    if (!byCategory.has(item.categorySlug)) byCategory.set(item.categorySlug, []);
    byCategory.get(item.categorySlug)!.push(item);
  }
  const cats = [...byCategory.keys()];

  section("Step 1 · Select items");
  console.log(`  [a]  All items  (${items.length} total)`);
  cats.forEach((slug, i) => {
    const count = byCategory.get(slug)?.length ?? 0;
    console.log(
      `  [${i + 1}]  ${slug.padEnd(20)} (${count} item${count !== 1 ? "s" : ""})`,
    );
  });
  console.log(`  [m]  Pick individual items`);

  const choice = await ask("\nYour choice: ");

  if (choice.toLowerCase() === "a") return items;

  const catIdx = parseInt(choice, 10);
  if (!isNaN(catIdx) && catIdx >= 1 && catIdx <= cats.length) {
    // cats[catIdx - 1] is string | undefined under noUncheckedIndexedAccess
    const catSlug = cats[catIdx - 1];
    if (catSlug !== undefined) return byCategory.get(catSlug) ?? items;
  }

  if (choice.toLowerCase() === "m") {
    const flat: Item[] = [];
    console.log();
    for (const [slug, catItems] of byCategory) {
      console.log(`  ${slug.toUpperCase()}`);
      for (const item of catItems) {
        flat.push(item);
        const price = resolvePriceByStrategy(item.price.tiers, "lowest")?.amount ?? null;
        const priceStr = price !== null ? `$${price}` : "—  ";
        console.log(
          `  [${String(flat.length).padStart(2)}] ${item.name.slice(0, 44).padEnd(45)} ${priceStr}`,
        );
      }
      console.log();
    }

    const raw = await ask('Enter numbers (e.g. 1,3,5  or  1-4  or  "all"): ');
    if (raw.toLowerCase() === "all") return items;

    const indices = parseSelection(raw, flat.length);
    if (!indices.length) {
      console.log("  No valid selection — exporting all items.");
      return items;
    }
    // flat[i - 1] is Item | undefined under noUncheckedIndexedAccess; filter guards the cast
    return indices
      .map((i) => flat[i - 1])
      .filter((item): item is Item => item !== undefined);
  }

  console.log("  Unrecognised choice — exporting all items.");
  return items;
}

// ── Step 2 — Price tier ───────────────────────────────────────────────────────

function hasPickupTier(items: Item[]): boolean {
  return items.some((i) => i.price.tiers.some((t) => t.miles_max !== undefined));
}
function hasShippingTiers(items: Item[]): boolean {
  return items.some((i) => i.price.tiers.some((t) => t.miles_max === undefined));
}

async function stepPriceStrategy(items: Item[]): Promise<PriceStrategy> {
  const pickup = hasPickupTier(items);
  const shipping = hasShippingTiers(items);

  section("Step 2 · Price tier");
  console.log("  [1]  Lowest price across all tiers   ← recommended for most cases");
  console.log("  [2]  Highest price across all tiers");
  if (pickup)   console.log("  [3]  Local pickup price  (miles-limited tiers only)");
  if (shipping) console.log("  [4]  Shipping price  (open-ended tiers only)");
  console.log("  [5]  Average of lowest & highest price across all tiers");
  console.log();
  console.log("  Items with no matching tier fall back to lowest / highest respectively.");

  const choice = (await ask("\nYour choice [1]: ")).trim() || "1";

  if (choice === "2") return "highest";
  if (choice === "3" && pickup)   return "pickup";
  if (choice === "4" && shipping) return "shipping";
  if (choice === "5") return "average";
  return "lowest";
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║   Facebook Marketplace Export Tool      ║");
  console.log("╚══════════════════════════════════════════╝");

  const all = await loadAllItemsRaw();
  const exportable = all.filter((i) => EXPORTABLE_STATUSES.has(i.status));

  if (!exportable.length) {
    console.log("\nNo available items to export. Add items with `pnpm create-item`.");
    closeInput();
    return;
  }

  console.log(
    `\nFound ${exportable.length} exportable item${exportable.length !== 1 ? "s" : ""} (available / pending / reserved).`,
  );

  // Step 0: history filter (skipped silently on first run)
  const skipSlugs = await stepHistory(exportable);

  // Apply history filter to get the candidate pool for Step 1
  const candidates =
    skipSlugs.size > 0
      ? exportable.filter((i) => !skipSlugs.has(itemSlug(i)))
      : exportable;

  if (candidates.length === 0) {
    console.log(
      "\n  All exportable items have already been exported. Nothing to do.",
    );
    console.log(
      "  Re-run and choose [n] at Step 0 to export everything again.\n",
    );
    closeInput();
    return;
  }

  // Step 1: item selection (operates only on the filtered candidate pool)
  const selected = await stepSelectItems(candidates);

  if (!selected.length) {
    console.log("\nNo items selected. Exiting.");
    closeInput();
    return;
  }

  // Step 2: price tier
  const priceStrategy = await stepPriceStrategy(selected);
  closeInput();

  // Copy local photos into exports/ as a manual-upload fallback (in case CDN URLs change).
  await copyLocalPhotos(selected);

  // PHOTO columns use CDN (https://) URLs — FB fetches them automatically on CSV upload.
  // photoCount = max CDN images any item has, capped at FB's 10-photo limit.
  const photoCount = Math.min(
    FB_PHOTO_LIMIT,
    Math.max(1, ...selected.map((i) => publicImages(i).length)),
  );
  const csvHeaders = buildCsvHeaders(photoCount);

  // Build CSV rows with inline preview
  section("Generating");
  const rows: string[][] = [];
  for (const item of selected) {
    const row = buildRow(item, priceStrategy, photoCount);
    // row[N] is string | undefined under noUncheckedIndexedAccess; split()[0] likewise
    const catCol = row[4] ?? "";
    const cat = catCol ? (catCol.split("//")[0] ?? catCol) : "(FB auto-detect)";
    const priceLabel = row[1] ? `$${row[1]}` : "—";
    const cdnCount = publicImages(item).length;
    const photoLabel = cdnCount ? `📷 ${cdnCount}` : "⚠️  no CDN photos";
    console.log(
      `  ✓ ${item.name.slice(0, 36).padEnd(37)} ${cat.slice(0, 20).padEnd(21)} ${priceLabel.padEnd(7)} ${photoLabel}`,
    );
    rows.push(row);
  }

  // Warn if any items have no CDN photos (FB won't receive photos for those rows).
  const noCdnItems = selected.filter((i) => publicImages(i).length === 0);
  if (noCdnItems.length) {
    console.log(
      `\n  ⚠️  ${noCdnItems.length} item${noCdnItems.length !== 1 ? "s have" : " has"} no CDN photos — PHOTO columns will be empty for those rows.`,
    );
    console.log("     Run \`pnpm upload-images\` first to upload photos to Cloudflare R2.\n");
  }

  // Write CSV — split into 50-item batches if needed
  console.log();
  const writtenFiles: string[] = [];
  if (rows.length <= FB_BATCH_LIMIT) {
    const fp = await writeBatch(csvHeaders, rows);
    writtenFiles.push(path.relative(process.cwd(), fp));
    console.log(`  ✅ Exported ${rows.length} item${rows.length !== 1 ? "s" : ""} → ${writtenFiles[0]}`);
    console.log(`     (within Facebook's ${FB_BATCH_LIMIT}-item limit ✓)\n`);
  } else {
    const total = Math.ceil(rows.length / FB_BATCH_LIMIT);
    console.log(
      `  ⚠️  ${rows.length} items exceed Facebook's ${FB_BATCH_LIMIT}-item limit — splitting into ${total} files:\n`,
    );
    for (let b = 0; b < total; b++) {
      const batch = rows.slice(b * FB_BATCH_LIMIT, (b + 1) * FB_BATCH_LIMIT);
      const fp = await writeBatch(csvHeaders, batch, b + 1);
      const rel = path.relative(process.cwd(), fp);
      writtenFiles.push(rel);
      console.log(`  ✅ ${rel}  (${batch.length} items)`);
    }
    console.log();
  }

  // Persist this run to history
  const run: ExportRun = {
    exportedAt: new Date().toISOString(),
    priceStrategy,
    itemCount: selected.length,
    files: writtenFiles,
    items: selected.map((item) => ({
      slug: itemSlug(item),
      name: item.name,
      price: resolvePriceByStrategy(item.price.tiers, priceStrategy)?.amount ?? null,
    })),
  };
  await appendRun(run);

  console.log("  Export history updated  (exports/.export-history.json)");
  if (photoCount > 0) {
    const PHOTO_FOLDER = "facebook-marketplace-photos";
    console.log(`  Photo folder   exports/${PHOTO_FOLDER}/`);
  }
  console.log(`\n  To upload: drag the CSV file + photo folder to facebook.com/marketplace/create/bulk\n`);
}

main().catch((err: unknown) => {
  console.error(err);
  closeInput();
  process.exit(1);
});
