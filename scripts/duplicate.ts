// Usage: pnpm duplicate <category>/<item> <category>/<new-item>
// Copies a source item's folder (item.json + all photo files) into a new
// item folder, resetting listing-lifecycle fields on the copy so it starts
// life as a fresh draft — see scripts/lib/duplicateItem.ts for exactly which
// fields change and why.

import fs from "fs/promises";
import path from "path";
import { isValidSlug } from "@/lib/utils/slug";
import { applyDuplicateEdits } from "./lib/duplicateItem";

// FIX Sec 3 (shared pattern — see mark-sold.ts / create-item.ts): only allow
// lowercase kebab-case slugs before any filesystem access, so a path-
// traversal payload like "../../etc" is rejected before it ever reaches fs.
function assertSafeSlug(value: string, label: string): void {
  if (!isValidSlug(value)) {
    console.error(
      `Error: ${label} must be kebab-case (lowercase letters, digits, and hyphens only).\n` +
        `  Got: "${value}"`,
    );
    process.exit(1);
  }
}

function splitSlug(arg: string, label: string): { category: string; item: string } {
  if (!arg.includes("/")) {
    console.error(`Error: ${label} must be in <category>/<item> form. Got: "${arg}"`);
    process.exit(1);
  }
  const idx = arg.indexOf("/");
  const category = arg.slice(0, idx);
  const item = arg.slice(idx + 1);
  if (!category || !item) {
    console.error(`Error: both parts of ${label} must be non-empty. Got: "${arg}"`);
    process.exit(1);
  }
  return { category, item };
}

async function main() {
  const [srcArg, destArg] = process.argv.slice(2);

  if (!srcArg || !destArg) {
    console.error("Usage: pnpm duplicate <category>/<item> <category>/<new-item>");
    console.error("Example: pnpm duplicate houseware/ikea-lamp houseware/ikea-lamp-2");
    process.exit(1);
  }

  const src = splitSlug(srcArg, "<category>/<item>");
  const dest = splitSlug(destArg, "<category>/<new-item>");

  assertSafeSlug(src.category, "source category");
  assertSafeSlug(src.item, "source item name");
  assertSafeSlug(dest.category, "destination category");
  assertSafeSlug(dest.item, "destination item name");

  const itemsRoot = path.join(process.cwd(), "content", "items");
  const srcDir = path.join(itemsRoot, src.category, src.item);
  const destCatDir = path.join(itemsRoot, dest.category);
  const destDir = path.join(itemsRoot, dest.category, dest.item);

  const srcJsonPath = path.join(srcDir, "item.json");
  try {
    await fs.access(srcJsonPath);
  } catch {
    console.error(`Error: source item not found at ${srcJsonPath}`);
    process.exit(1);
  }

  try {
    const stat = await fs.stat(destCatDir);
    if (!stat.isDirectory()) throw new Error("not a directory");
  } catch {
    console.error(
      `Error: destination category '${dest.category}' not found at ${destCatDir}\n` +
        `Create the category folder first or use an existing category.`,
    );
    process.exit(1);
  }

  // Refuse if the destination already exists — never silently overwrite an
  // existing listing (mirrors create-item.ts's own "item already exists" guard).
  try {
    await fs.access(destDir);
    console.error(`Error: destination '${destArg}' already exists at ${destDir}`);
    process.exit(1);
  } catch {
    // Good — destination doesn't exist yet.
  }

  // Copy the whole source folder (item.json + every photo file) in one shot,
  // then rewrite only item.json's lifecycle fields in place.
  await fs.cp(srcDir, destDir, { recursive: true });

  const destJsonPath = path.join(destDir, "item.json");
  const text = await fs.readFile(destJsonPath, "utf-8");
  const today = new Date().toISOString().slice(0, 10);
  const next = applyDuplicateEdits(text, today);
  await fs.writeFile(destJsonPath, next);

  console.log(`✓ Duplicated ${srcArg} → ${destArg}`);
  console.log(
    `  status: draft · listed_date: ${today} · sold_date/price_reduced/previous_lowest_price/min_acceptable_offer reset\n` +
      `  Edit ${destJsonPath}, then set status to "available" when ready.`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
