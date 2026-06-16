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
import { existsSync, mkdirSync } from "fs";
import path from "path";
import * as readline from "readline";
import { loadAllItemsRaw } from "@/lib/content/loader";
import type { Item, PriceTier } from "@/lib/content/types";
import { mapToFBCategory } from "./lib/fbCategoryMap";
import {
  loadHistory,
  appendRun,
  allExportedSlugs,
  lastRun,
  formatRunDate,
  type ExportRun,
} from "./lib/exportHistory";

// ── Constants ─────────────────────────────────────────────────────────────────

const EXPORTS_DIR = path.join(process.cwd(), "exports");
const FB_BATCH_LIMIT = 50;
const FB_TITLE_MAX = 150;
const FB_DESC_MAX = 5000;

/** Statuses eligible for FB export (excludes sold / draft). */
const EXPORTABLE_STATUSES = new Set(["available", "pending", "reserved"]);

const CSV_HEADERS = [
  "TITLE",
  "PRICE",
  "CONDITION",
  "DESCRIPTION",
  "CATEGORY",
  "SHIPPING WEIGHT",
  "OFFER FREE SHIPPING",
  "OFFER SHIPPING",
];

const CONDITION_MAP: Record<string, string> = {
  new: "New",
  "like-new": "Used - Like New",
  good: "Used - Good",
  fair: "Used - Fair",
  "for-parts": "Used - Fair", // FB has no "For Parts" option
};

// ── Price strategy ─────────────────────────────────────────────────────────────

type PriceStrategy = "lowest" | "highest" | { label: string };

function resolvePrice(tiers: PriceTier[], strategy: PriceStrategy): number | null {
  if (!tiers.length) return null;
  if (strategy === "lowest") return Math.min(...tiers.map((t) => t.amount));
  if (strategy === "highest") return Math.max(...tiers.map((t) => t.amount));
  const match = tiers.find(
    (t) => t.label.toLowerCase() === strategy.label.toLowerCase(),
  );
  return match ? match.amount : Math.min(...tiers.map((t) => t.amount));
}

function priceStrategyLabel(strategy: PriceStrategy): string {
  if (strategy === "lowest") return "lowest";
  if (strategy === "highest") return "highest";
  return `label:${strategy.label}`;
}

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

function buildRow(item: Item, strategy: PriceStrategy): string[] {
  const price = resolvePrice(item.price.tiers, strategy);

  let shippingWeight = "";
  if (item.weight && hasShippingTier(item)) {
    const lbs =
      item.weight.unit === "kg"
        ? (item.weight.value * 2.20462).toFixed(2)
        : item.weight.value.toFixed(2);
    shippingWeight = lbs;
  }

  return [
    buildTitle(item),
    price !== null ? String(Math.round(price)) : "",
    CONDITION_MAP[item.condition] ?? "Used - Good",
    buildDescription(item),
    mapToFBCategory(item),
    shippingWeight,
    hasShippingTier(item) && shippingIsFree(item) ? "Yes" : "No",
    hasShippingTier(item) ? "Yes" : "No",
  ];
}

// ── Item slug ─────────────────────────────────────────────────────────────────

function itemSlug(item: Item): string {
  return `${item.categorySlug}/${item.itemSlug}`;
}

// ── CSV serialisation ──────────────────────────────────────────────────────────

function csvCell(value: string): string {
  const s = String(value).replace(/"/g, '""');
  return /[,"\n\r]/.test(s) ? `"${s}"` : s;
}

function toCsvString(rows: string[][]): string {
  return [
    CSV_HEADERS.map(csvCell).join(","),
    ...rows.map((r) => r.map(csvCell).join(",")),
  ].join("\r\n");
}

async function writeBatch(rows: string[][], suffix?: number): Promise<string> {
  if (!existsSync(EXPORTS_DIR)) mkdirSync(EXPORTS_DIR, { recursive: true });
  const name =
    suffix !== undefined
      ? `facebook-marketplace-${suffix}.csv`
      : "facebook-marketplace.csv";
  const filepath = path.join(EXPORTS_DIR, name);
  await fs.writeFile(filepath, toCsvString(rows), "utf-8");
  return filepath;
}

// ── Terminal UI helpers ────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, (a) => resolve(a.trim())));
}

function section(title: string): void {
  const pad = Math.max(0, 46 - title.length);
  console.log(`\n── ${title} ${"─".repeat(pad)}`);
}

function parseSelection(input: string, max: number): number[] {
  const result = new Set<number>();
  for (const part of input.split(",")) {
    const range = part.trim().match(/^(\d+)-(\d+)$/);
    if (range) {
      for (let i = parseInt(range[1], 10); i <= parseInt(range[2], 10); i++) {
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
      const run = history.runs[r];
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
    const count = byCategory.get(slug)!.length;
    console.log(
      `  [${i + 1}]  ${slug.padEnd(20)} (${count} item${count !== 1 ? "s" : ""})`,
    );
  });
  console.log(`  [m]  Pick individual items`);

  const choice = await ask("\nYour choice: ");

  if (choice.toLowerCase() === "a") return items;

  const catIdx = parseInt(choice, 10);
  if (!isNaN(catIdx) && catIdx >= 1 && catIdx <= cats.length) {
    return byCategory.get(cats[catIdx - 1])!;
  }

  if (choice.toLowerCase() === "m") {
    const flat: Item[] = [];
    console.log();
    for (const [slug, catItems] of byCategory) {
      console.log(`  ${slug.toUpperCase()}`);
      for (const item of catItems) {
        flat.push(item);
        const price = resolvePrice(item.price.tiers, "lowest");
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
    return indices.map((i) => flat[i - 1]);
  }

  console.log("  Unrecognised choice — exporting all items.");
  return items;
}

// ── Step 2 — Price tier ───────────────────────────────────────────────────────

async function stepPriceStrategy(items: Item[]): Promise<PriceStrategy> {
  const labels = [...new Set(items.flatMap((i) => i.price.tiers.map((t) => t.label)))];

  section("Step 2 · Price tier");
  console.log("  [1]  Lowest price  (pickup / cheapest tier)   ← recommended");
  console.log("  [2]  Highest price  (shipping / most expensive tier)");
  if (labels.length) console.log("  [3]  Choose by tier label");

  const choice = await ask("\nYour choice [1]: ");

  if (choice === "2") return "highest";

  if (choice === "3" && labels.length) {
    console.log("\n  Available labels:");
    labels.forEach((l, i) => console.log(`    [${i + 1}]  ${l}`));
    const raw = await ask("  Pick number: ");
    const idx = parseInt(raw, 10);
    if (!isNaN(idx) && idx >= 1 && idx <= labels.length) {
      return { label: labels[idx - 1] };
    }
    console.log("  Invalid — falling back to lowest.");
  }

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
    rl.close();
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
    rl.close();
    return;
  }

  // Step 1: item selection (operates only on the filtered candidate pool)
  const selected = await stepSelectItems(candidates);

  if (!selected.length) {
    console.log("\nNo items selected. Exiting.");
    rl.close();
    return;
  }

  // Step 2: price tier
  const priceStrategy = await stepPriceStrategy(selected);
  rl.close();

  // Build CSV rows with inline preview
  section("Generating");
  const rows: string[][] = [];
  for (const item of selected) {
    const row = buildRow(item, priceStrategy);
    const cat = row[4] ? row[4].split("//")[0] : "(FB auto-detect)";
    const priceLabel = row[1] ? `$${row[1]}` : "—";
    console.log(
      `  ✓ ${item.name.slice(0, 40).padEnd(41)} ${cat.slice(0, 22).padEnd(23)} ${priceLabel}`,
    );
    rows.push(row);
  }

  // Write CSV — split into 50-item batches if needed
  console.log();
  const writtenFiles: string[] = [];
  if (rows.length <= FB_BATCH_LIMIT) {
    const fp = await writeBatch(rows);
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
      const fp = await writeBatch(batch, b + 1);
      const rel = path.relative(process.cwd(), fp);
      writtenFiles.push(rel);
      console.log(`  ✅ ${rel}  (${batch.length} items)`);
    }
    console.log();
  }

  // Persist this run to history
  const run: ExportRun = {
    exportedAt: new Date().toISOString(),
    priceStrategy: priceStrategyLabel(priceStrategy),
    itemCount: selected.length,
    files: writtenFiles,
    items: selected.map((item) => ({
      slug: itemSlug(item),
      name: item.name,
      price: resolvePrice(item.price.tiers, priceStrategy),
    })),
  };
  await appendRun(run);

  console.log("  Export history updated  (exports/.export-history.json)");
  console.log("  Upload the CSV at: facebook.com/marketplace/create/bulk\n");
}

main().catch((err: unknown) => {
  console.error(err);
  rl.close();
  process.exit(1);
});
