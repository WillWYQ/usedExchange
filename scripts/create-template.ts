// Usage: pnpm create-template [category]
// Creates a fully-commented _template.json in:
//   content/items/<category>/_template.json  (when category is given)
//   content/items/_template.json             (when no argument)

import fs from "fs/promises";
import path from "path";
import { buildItemTemplate } from "./lib/itemTemplate";

async function main() {
  const category = process.argv[2];
  const itemsRoot = path.join(process.cwd(), "content", "items");

  let targetPath: string;

  if (category) {
    const catDir = path.join(itemsRoot, category);
    try {
      const stat = await fs.stat(catDir);
      if (!stat.isDirectory()) throw new Error("not a directory");
    } catch {
      console.error(`Error: category '${category}' not found at ${catDir}`);
      process.exit(1);
    }
    targetPath = path.join(catDir, "_template.json");
  } else {
    targetPath = path.join(itemsRoot, "_template.json");
  }

  const today = new Date().toISOString().slice(0, 10);

  const template = {
    ...buildItemTemplate("Item Name Here", today),
    description: "Item description (GitHub-flavoured Markdown supported).",
  };

  await fs.writeFile(targetPath, JSON.stringify(template, null, 2) + "\n");

  console.log(`✓ Template created at ${targetPath}`);
  console.log(
    "  Copy this file into your item folder, rename it to item.json, and fill in the fields.",
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
