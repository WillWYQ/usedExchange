// Prebuild step: builds the fuse.js search index and writes it to public/search-index.json.
// Called via: tsx scripts/build-search-index.ts  (in the `prebuild` npm script)

import fs from "fs/promises";
import path from "path";
import { buildSearchIndex } from "@/lib/search/index";

const OUTPUT_PATH = path.join(process.cwd(), "public", "search-index.json");

async function main() {
  const entries = await buildSearchIndex();
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(entries));
  console.log(
    `[build-search-index] wrote ${entries.length} entries → public/search-index.json`,
  );
}

main().catch((err: unknown) => {
  console.error("[build-search-index] fatal error:", err);
  process.exit(1);
});
