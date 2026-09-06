// Usage: pnpm semester-end
//
// Roadmap §1.12 "Semester-End Batch Actions": a single interactive command
// to review stale listings before a sell-off.
//
//   1. Prints every `available` item listed for more than 60 days — reusing
//      scripts/lib/staleItems.ts's findStaleItems(), the exact same function
//      pnpm stale-check uses, so the two commands can never disagree about
//      which items qualify.
//   2. For each stale item, prompts: mark sold / reduce price / leave as-is.
//      "Reduce price" edits the lowest-amount price tier via the same
//      comment-preserving applyFieldEdits path every other script here uses
//      (scripts/lib/reducePrice.ts).
//   3. If anything changed, runs `pnpm upload-images` (safe — a content
//      sync, not a git operation) and prints a suggested commit message.
//
// Deliberately does NOT run `git commit` / `git push` itself: publishing is
// the one seller-triggered action (`pnpm push` — see .claude/CLAUDE.md and
// docs/SCRIPTS.md), never something a script does silently on the seller's
// behalf.

import fs from "fs/promises";
import path from "path";
import { execFileSync } from "child_process";
import { loadAllItemsRaw } from "@/lib/content/loader";
import { resolvePriceByStrategy } from "@/lib/utils/pricing";
import { findStaleItems, DEFAULT_STALE_DAYS } from "./lib/staleItems";
import { applyMarkSold } from "./lib/markSold";
import { applyReducePrice, parseReduceAmount } from "./lib/reducePrice";
import { createPrompt } from "./lib/cliPrompt";

const SUGGESTED_COMMIT_MESSAGE = "chore: end-of-semester listing cleanup";

function itemJsonPath(categorySlug: string, itemSlug: string): string {
  return path.join(process.cwd(), "content", "items", categorySlug, itemSlug, "item.json");
}

async function main() {
  const { ask, closeInput } = createPrompt();

  const items = await loadAllItemsRaw();
  const stale = findStaleItems(items, DEFAULT_STALE_DAYS);

  if (stale.length === 0) {
    console.log(`No available items listed for more than ${DEFAULT_STALE_DAYS} days. Nothing to do.`);
    closeInput();
    return;
  }

  console.log(
    `${stale.length} available item(s) listed for more than ${DEFAULT_STALE_DAYS} days:\n`,
  );

  let soldCount = 0;
  let reducedCount = 0;

  for (const { item, days } of stale) {
    const slug = `${item.categorySlug}/${item.itemSlug}`;
    const resolved = resolvePriceByStrategy(item.price.tiers, "lowest");
    const priceLabel = resolved !== null ? `$${resolved.amount}` : "— (no price tiers)";

    console.log(`\n${slug}  (${item.name})`);
    console.log(`  Listed ${days} days ago  ·  current lowest price: ${priceLabel}`);

    const choice = (
      await ask("  Action — [s]old / [r]educe price / [l]eave as-is [l]: ")
    )
      .trim()
      .toLowerCase();

    if (choice === "s" || choice === "sold") {
      const jsonPath = itemJsonPath(item.categorySlug, item.itemSlug);
      const text = await fs.readFile(jsonPath, "utf-8");
      const today = new Date().toISOString().slice(0, 10);
      const next = applyMarkSold(text, today);
      if (next === null) {
        console.log("  Already marked sold — no change.");
        continue;
      }
      await fs.writeFile(jsonPath, next);
      soldCount++;
      console.log(`  ✓ Marked sold (sold_date: ${today})`);
      continue;
    }

    if (choice === "r" || choice === "reduce" || choice === "reduce price") {
      const amountRaw = await ask("  New lowest-tier price amount: ");
      const amount = parseReduceAmount(amountRaw);
      if (amount === null) {
        console.log(`  Invalid amount "${amountRaw.trim()}" — leaving price as-is.`);
        continue;
      }

      const jsonPath = itemJsonPath(item.categorySlug, item.itemSlug);
      const text = await fs.readFile(jsonPath, "utf-8");
      const next = applyReducePrice(text, amount);
      if (next === null) {
        console.log("  This item has no price tiers to reduce — leaving as-is.");
        continue;
      }
      await fs.writeFile(jsonPath, next);
      reducedCount++;
      console.log(`  ✓ Lowest price tier reduced to ${amount}`);
      continue;
    }

    console.log("  Leaving as-is.");
  }

  closeInput();

  const totalChanged = soldCount + reducedCount;
  console.log(
    `\nDone reviewing. ${soldCount} marked sold, ${reducedCount} price(s) reduced, ${
      stale.length - totalChanged
    } left as-is.`,
  );

  if (totalChanged === 0) {
    console.log("\nNo changes were made — nothing to sync or publish.");
    return;
  }

  console.log("\nSyncing photos to the CDN (pnpm upload-images)…");
  try {
    execFileSync("pnpm", ["upload-images"], { stdio: "inherit" });
  } catch (err: unknown) {
    console.error(
      `\n⚠️  pnpm upload-images failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    console.error("   Fix the issue above and re-run \`pnpm upload-images\` before publishing.");
  }

  console.log(
    `\nReview the changes above (git status / git diff), then publish when you're happy:\n\n` +
      `  Suggested commit message: "${SUGGESTED_COMMIT_MESSAGE}"\n\n` +
      `  Either run the default publish command:\n` +
      `    pnpm push                    (commits with the default "chore: update listings" message)\n\n` +
      `  …or, to use the suggested message above instead:\n` +
      `    git add content lib/generated/image-manifest.json\n` +
      `    git commit -m "${SUGGESTED_COMMIT_MESSAGE}"\n` +
      `    git push\n`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
