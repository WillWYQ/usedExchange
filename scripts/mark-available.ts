// Usage: pnpm mark-available <category>/<item>
// Resets status to "available" and clears sold_date on the given item.json.
// Mirrors scripts/mark-sold.ts exactly, with applyMarkAvailable in place of
// applyMarkSold — see scripts/lib/markAvailable.ts for the sold_date/status
// design notes.

import fs from "fs/promises";
import path from "path";
import { isValidSlug } from "@/lib/utils/slug";
import { applyMarkAvailable } from "./lib/markAvailable";

// FIX Sec 3: only allow lowercase kebab-case slugs (letters, digits, hyphens).
// Prevents path-traversal payloads such as "../../etc/passwd" from reaching
// any filesystem operation, and keeps folder names URL-safe for static export
// (see lib/utils/slug.ts — shared with generateStaticParams' own check).
// The check runs before any fs.access / fs.readFile call so the error surfaces immediately.
function assertSafeSlug(value: string, label: string): void {
  if (!isValidSlug(value)) {
    console.error(
      `Error: ${label} must be kebab-case (lowercase letters, digits, and hyphens only).\n` +
        `  Got: "${value}"`,
    );
    process.exit(1);
  }
}

async function main() {
  const arg = process.argv[2];

  if (!arg || !arg.includes("/")) {
    console.error("Usage: pnpm mark-available <category>/<item>");
    console.error("Example: pnpm mark-available electronics/iphone-14-pro");
    process.exit(1);
  }

  const slashIdx = arg.indexOf("/");
  const category = arg.slice(0, slashIdx);
  const item = arg.slice(slashIdx + 1);

  if (!category || !item) {
    console.error("Error: both <category> and <item> must be non-empty.");
    process.exit(1);
  }

  // FIX Sec 3: validate slugs before constructing any filesystem paths.
  assertSafeSlug(category, "category");
  assertSafeSlug(item, "item name");

  const jsonPath = path.join(
    process.cwd(),
    "content",
    "items",
    category,
    item,
    "item.json",
  );

  try {
    await fs.access(jsonPath);
  } catch {
    console.error(`Error: item not found at ${jsonPath}`);
    process.exit(1);
  }

  const text = await fs.readFile(jsonPath, "utf-8");

  const next = applyMarkAvailable(text);
  if (next === null) {
    console.log(`[mark-available] ${arg} is already available.`);
    process.exit(0);
  }

  await fs.writeFile(jsonPath, next);

  console.log(`✓ Marked ${arg} as available  (sold_date cleared)`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
