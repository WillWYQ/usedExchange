# Seller Studio PDF Export Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add language, price-strategy, and category/status filter controls to Seller Studio's "Export catalog PDF" dialog, threading them through `generateCatalogPdf()` as a new `PdfExportOptions` parameter.

**Architecture:** A `PdfExportOptions` object flows dialog → `POST /api/export-pdf` body → `generateCatalogPdf(options)`. Localization reuses the site's existing i18n system (a new `getTranslationsForLocale()` alongside `getTranslations()`/`useT()`, plus the existing `getLocalizedField()` for item content) — `template.ts` becomes dependency-injected with a `UIStrings` object instead of hardcoding English strings. Price-strategy resolution is extracted from `pnpm fb-export` into `lib/utils/pricing.ts` as `resolvePriceByStrategy()`, shared by both tools, with a new "average" strategy added to both.

**Tech Stack:** TypeScript, Next.js 15 (site), Vite + React (Studio SPA), Zod (Studio API body validation), Vitest (+ `@testing-library/react` for Studio components), Playwright (PDF rendering, unchanged).

**Spec:** `docs/superpowers/specs/2026-08-15-studio-pdf-export-options-design.md` — read it alongside this plan; the plan does not repeat its rationale, only the resulting shapes and code.

## Global Constraints

- **Iron Rule 1** — every file this plan touches lives in `lib/`, `scripts/`, `studio/`, or `docs/`, never `content/`. No task writes to `content/` except editing the seller-owned `content/config.ts` template block (documentation, not seller data).
- **Iron Rule 4** — `reserved_for` must never render. No task reads or threads that field; `Item` never carries it (enforced upstream, unchanged by this plan).
- **Iron Rule 6** — `lib/utils/pricing.ts` must not gain a `"use client"` directive.
- **Iron Rule 8** — the new `UIStrings` keys are added to `content/config.ts`'s explicit `en` block, the commented `zh` template block, and `scripts/lib/configDefaults.ts` (so `pnpm update-site`/`pnpm migrate-config` auto-splice them into downstream sites) — but are **not** added to `scripts/lib/i18nRequiredKeys.ts`'s `REQUIRED_UI_STRING_KEYS`, or `pnpm build`'s `check-config` step would hard-fail for any downstream site with a second locale enabled whose config predates this feature.
- **Bilingual doc sync (Rule 2)** — every `docs/DESIGN.md`/`docs/TECH_REQUIREMENTS.md`/`docs/CURRENT_FUNCTIONALITY.md` edit in this plan has a matching `_zh` edit in the same task.
- Server-side input validation follows this codebase's established convention exactly: `parseJsonBody(req.body, zodSchema)` with strict `z.enum(...)` that **rejects** bad input with a `400`, never silently substitutes a default (see `bulkStatusBodySchema`, `scripts/lib/studioApi.ts:413-416`, and its own comment explaining why).
- `scripts/lib/**/*.ts` (Node-only, loaded by `studio/vite.config.ts`) use **relative** imports (`../../../lib/...`); files under `lib/`, `app/`, and `*.test.ts` use the `@/` alias, matching each file's existing convention. Never introduce a top-level `@/` import into a file that `studio/vite.config.ts` loads directly.

---

### Task 1: Shared price-strategy resolver in `lib/utils/pricing.ts`

**Files:**
- Modify: `lib/utils/pricing.ts`
- Test: `lib/utils/pricing.test.ts`

**Interfaces:**
- Produces: `export type PriceStrategy = "lowest" | "highest" | "pickup" | "shipping" | "average";`, `export type ResolvedStrategyPrice = { amount: number; tier: PriceTier | null };`, `export function resolvePriceByStrategy(tiers: PriceTier[], strategy: PriceStrategy): ResolvedStrategyPrice | null`

- [ ] **Step 1: Write the failing tests**

Append to `lib/utils/pricing.test.ts` (after the existing `resolveItemPrice` describe block, same file — it already imports `tier`/`price` helpers you can reuse):

```ts
import { resolvePriceByStrategy } from "./pricing";

describe("resolvePriceByStrategy", () => {
  it("returns null for empty tiers", () => {
    expect(resolvePriceByStrategy([], "lowest")).toBeNull();
    expect(resolvePriceByStrategy([], "average")).toBeNull();
  });

  it("lowest picks the minimum amount tier", () => {
    const tiers = [tier("Pickup", 35), tier("Shipping", 20)];
    expect(resolvePriceByStrategy(tiers, "lowest")).toEqual({ amount: 20, tier: tiers[1] });
  });

  it("highest picks the maximum amount tier", () => {
    const tiers = [tier("Pickup", 35), tier("Shipping", 20)];
    expect(resolvePriceByStrategy(tiers, "highest")).toEqual({ amount: 35, tier: tiers[0] });
  });

  it("pickup picks the lowest tier that has a miles_max, falling back to lowest overall", () => {
    const withPickup = [tier("Pickup", 15, undefined, 10), tier("Shipping", 35)];
    expect(resolvePriceByStrategy(withPickup, "pickup")).toEqual({ amount: 15, tier: withPickup[0] });

    const noPickup = [tier("Shipping A", 20), tier("Shipping B", 35)];
    expect(resolvePriceByStrategy(noPickup, "pickup")).toEqual({ amount: 20, tier: noPickup[0] });
  });

  it("shipping picks the lowest open-ended tier, falling back to highest overall", () => {
    const withShipping = [tier("Pickup", 15, undefined, 10), tier("Shipping", 35)];
    expect(resolvePriceByStrategy(withShipping, "shipping")).toEqual({ amount: 35, tier: withShipping[1] });

    const noShipping = [tier("A", 15, undefined, 5), tier("B", 25, undefined, 10)];
    expect(resolvePriceByStrategy(noShipping, "shipping")).toEqual({ amount: 25, tier: noShipping[1] });
  });

  it("average is the literal midpoint of the lowest and highest amounts, with no matching tier", () => {
    const tiers = [tier("Pickup", 20), tier("Shipping", 40)];
    expect(resolvePriceByStrategy(tiers, "average")).toEqual({ amount: 30, tier: null });
  });

  it("average can be fractional and still has no matching tier", () => {
    const tiers = [tier("Pickup", 15), tier("Shipping", 40)];
    expect(resolvePriceByStrategy(tiers, "average")).toEqual({ amount: 27.5, tier: null });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run lib/utils/pricing.test.ts`
Expected: FAIL — `resolvePriceByStrategy is not a function` (or similar import error).

- [ ] **Step 3: Implement `resolvePriceByStrategy`**

Add to `lib/utils/pricing.ts`, after the existing `resolveItemPrice`/`openEndedOrHighest` code:

```ts
export type PriceStrategy = "lowest" | "highest" | "pickup" | "shipping" | "average";
export type ResolvedStrategyPrice = { amount: number; tier: PriceTier | null };

// Shared by pnpm fb-export (scripts/export-facebook.ts) and Seller Studio's
// PDF exporter (scripts/lib/pdfCatalog/) so "lowest"/"highest"/"pickup"/
// "shipping" can never disagree between the two tools. "average" is the odd
// one out: unlike the other four, it is a literal (min+max)/2 computed
// number that generally matches no tier the seller actually authored — so it
// returns `tier: null` rather than a real PriceTier.
export function resolvePriceByStrategy(
  tiers: PriceTier[],
  strategy: PriceStrategy,
): ResolvedStrategyPrice | null {
  if (!tiers.length) return null;

  if (strategy === "average") {
    const amounts = tiers.map((t) => t.amount);
    const amount = (Math.min(...amounts) + Math.max(...amounts)) / 2;
    return { amount, tier: null };
  }

  const resolvedTier = resolveTierByStrategy(tiers, strategy);
  return resolvedTier ? { amount: resolvedTier.amount, tier: resolvedTier } : null;
}

function resolveTierByStrategy(
  tiers: PriceTier[],
  strategy: "lowest" | "highest" | "pickup" | "shipping",
): PriceTier | null {
  if (strategy === "lowest") return minByAmount(tiers);
  if (strategy === "highest") return maxByAmount(tiers);
  if (strategy === "pickup") {
    const pickupTiers = tiers.filter((t) => t.miles_max !== undefined);
    return minByAmount(pickupTiers.length ? pickupTiers : tiers);
  }
  // "shipping"
  const shippingTiers = tiers.filter((t) => t.miles_max === undefined);
  return shippingTiers.length ? minByAmount(shippingTiers) : maxByAmount(tiers);
}

function minByAmount(tiers: PriceTier[]): PriceTier | null {
  let best: PriceTier | null = null;
  for (const t of tiers) {
    if (!best || t.amount < best.amount) best = t;
  }
  return best;
}

function maxByAmount(tiers: PriceTier[]): PriceTier | null {
  let best: PriceTier | null = null;
  for (const t of tiers) {
    if (!best || t.amount > best.amount) best = t;
  }
  return best;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run lib/utils/pricing.test.ts`
Expected: PASS (all `resolveItemPrice` tests still pass unchanged, plus the new `resolvePriceByStrategy` tests).

- [ ] **Step 5: Commit**

```bash
git add lib/utils/pricing.ts lib/utils/pricing.test.ts
git commit -m "feat(pricing): add shared resolvePriceByStrategy with a new average strategy"
```

---

### Task 2: Refactor `pnpm fb-export` to use the shared resolver, add the "average" option

**Files:**
- Modify: `scripts/export-facebook.ts`

**Interfaces:**
- Consumes: `resolvePriceByStrategy`, `PriceStrategy` from Task 1 (`@/lib/utils/pricing`)
- Produces: nothing new consumed elsewhere — this script has no importers.

There is no existing test file for `scripts/export-facebook.ts` (confirmed: no `export-facebook*.test.ts` anywhere in the repo) — this task does not introduce one, matching the codebase's existing lack of coverage for this interactive CLI script. Correctness is verified by type-check plus the manual step below.

- [ ] **Step 1: Remove the private strategy type/function, import the shared one**

In `scripts/export-facebook.ts`, replace:

```ts
import { loadAllItemsRaw } from "@/lib/content/loader";
import type { Item, PriceTier } from "@/lib/content/types";
```

with:

```ts
import { loadAllItemsRaw } from "@/lib/content/loader";
import type { Item } from "@/lib/content/types";
import { resolvePriceByStrategy, type PriceStrategy } from "@/lib/utils/pricing";
```

(`PriceTier` is no longer referenced directly in this file once `resolvePrice` is removed below — dropping the import avoids an unused-import lint error.)

Delete this whole block (originally lines 62-92):

```ts
// ── Price strategy ─────────────────────────────────────────────────────────────

/**
 * Strategies:
 *   "lowest"   — cheapest tier across all tiers (good default, reflects pickup price)
 *   "highest"  — most expensive tier (reflects shipping price)
 *   "pickup"   — lowest-amount tier that has a miles_max (local-only tier); falls back to lowest
 *   "shipping" — lowest-amount tier that has NO miles_max (open-ended tier); falls back to highest
 */
type PriceStrategy = "lowest" | "highest" | "pickup" | "shipping";

function resolvePrice(tiers: PriceTier[], strategy: PriceStrategy): number | null {
  if (!tiers.length) return null;
  if (strategy === "lowest") return Math.min(...tiers.map((t) => t.amount));
  if (strategy === "highest") return Math.max(...tiers.map((t) => t.amount));
  if (strategy === "pickup") {
    const pickupTiers = tiers.filter((t) => t.miles_max !== undefined);
    return pickupTiers.length
      ? Math.min(...pickupTiers.map((t) => t.amount))
      : Math.min(...tiers.map((t) => t.amount));
  }
  // "shipping"
  const shippingTiers = tiers.filter((t) => t.miles_max === undefined);
  return shippingTiers.length
    ? Math.min(...shippingTiers.map((t) => t.amount))
    : Math.max(...tiers.map((t) => t.amount));
}

function priceStrategyLabel(strategy: PriceStrategy): string {
  return strategy;
}
```

Leave the `// ── Shipping helpers ──…` section right after it untouched.

- [ ] **Step 2: Update the two call sites that used `resolvePrice`**

In `buildRow` (originally `export-facebook.ts:139-140`), change:

```ts
function buildRow(item: Item, strategy: PriceStrategy, photoCount: number): string[] {
  const price = resolvePrice(item.price.tiers, strategy);
```

to:

```ts
function buildRow(item: Item, strategy: PriceStrategy, photoCount: number): string[] {
  const price = resolvePriceByStrategy(item.price.tiers, strategy)?.amount ?? null;
```

In `stepSelectItems`'s preview line (originally `export-facebook.ts:396`), change:

```ts
        const price = resolvePrice(item.price.tiers, "lowest");
```

to:

```ts
        const price = resolvePriceByStrategy(item.price.tiers, "lowest")?.amount ?? null;
```

- [ ] **Step 3: Add the "average" option to the Step 2 CLI menu**

Replace `stepPriceStrategy` (originally `export-facebook.ts:432-450`):

```ts
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
```

- [ ] **Step 4: Update the one remaining `priceStrategyLabel` call site**

In `main()`, find:

```ts
  const run: ExportRun = {
    exportedAt: new Date().toISOString(),
    priceStrategy: priceStrategyLabel(priceStrategy),
```

Change to:

```ts
  const run: ExportRun = {
    exportedAt: new Date().toISOString(),
    priceStrategy,
```

And update the two remaining direct `resolvePrice` references inside `main()`'s preview loop and the `run.items` mapping — search the file for any other `resolvePrice(` occurrences after Step 2 (there are two: the inline preview `priceLabel` computation and `run.items: selected.map((item) => ({ ..., price: resolvePrice(item.price.tiers, priceStrategy) }))`). Replace each with `resolvePriceByStrategy(item.price.tiers, priceStrategy)?.amount ?? null`.

- [ ] **Step 5: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors in `scripts/export-facebook.ts`.

- [ ] **Step 6: Manual smoke check**

Run: `pnpm fb-export`, reach Step 2, confirm option `[5]` appears and produces a CSV `PRICE` column with a plausible midpoint value for an item with two tiers. Ctrl-C out once confirmed (no need to complete a full export).

- [ ] **Step 7: Commit**

```bash
git add scripts/export-facebook.ts
git commit -m "refactor(fb-export): use shared resolvePriceByStrategy, add average strategy"
```

---

### Task 3: New site-level `UIStrings` keys, `getTranslationsForLocale()`, and config plumbing

**Files:**
- Modify: `lib/config/types.ts`
- Modify: `lib/i18n/translations.ts`
- Modify: `lib/i18n/getTranslations.ts`
- Modify: `content/config.ts`
- Modify: `scripts/lib/configDefaults.ts`
- Modify: `docs/DESIGN.md`, `docs/DESIGN_zh.md`
- Test: `lib/i18n/getTranslations.test.ts` (new)

**Interfaces:**
- Produces: 9 new `UIStrings` keys (`pdfTocHeading`, `pdfCoverHeading`, `pdfCoverMeta`, `pdfGeneratedOn`, `pdfViewLiveListing`, `pdfFooterPage`, `pdfFooterOf`, `pdfAveragePriceLabel`, `condition`), `export function getTranslationsForLocale(locale: string): UIStrings` from `lib/i18n/getTranslations.ts`.
- Consumed by: Task 4 (`template.ts` receives a `UIStrings` value built from these keys), Task 5 (`generate.ts` calls `getTranslationsForLocale`).

- [ ] **Step 1: Add the 9 new keys to the `UIStrings` type**

In `lib/config/types.ts`, inside the `UIStrings` type, right before the closing `};` (after `newlyListedNoneInPeriod: string;`), add:

```ts

  // Catalog PDF export chrome (Seller Studio, scripts/lib/pdfCatalog/template.ts)
  pdfTocHeading: string;
  pdfCoverHeading: string;
  pdfCoverMeta: string;
  pdfGeneratedOn: string;
  pdfViewLiveListing: string;
  pdfFooterPage: string;
  pdfFooterOf: string;
  pdfAveragePriceLabel: string;
  condition: string;
```

- [ ] **Step 2: Add matching values to `EN_FALLBACK`**

In `lib/i18n/translations.ts`, right before the closing `};` (after `newlyListedNoneInPeriod: "No new items in this period.",`), add:

```ts

  pdfTocHeading: "Table of Contents",
  pdfCoverHeading: "Full Listing Catalog",
  pdfCoverMeta: "{itemCount} items across {categoryCount} categories",
  pdfGeneratedOn: "Generated {date}",
  pdfViewLiveListing: "View Live Listing",
  pdfFooterPage: "Page",
  pdfFooterOf: "of",
  pdfAveragePriceLabel: "Highlighted price (average): {amount}",
  condition: "Condition",
```

- [ ] **Step 3: Write the failing test for `getTranslationsForLocale`**

Create `lib/i18n/getTranslations.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/content/config", () => ({
  siteConfig: {
    i18n: {
      defaultLocale: "en",
      availableLocales: ["en", "zh"],
      translations: {
        en: { pdfTocHeading: "Table of Contents" },
        zh: { pdfTocHeading: "目錄" },
      },
    },
  },
}));

import { getTranslationsForLocale } from "./getTranslations";

describe("getTranslationsForLocale", () => {
  it("resolves the requested locale's override over the default locale", () => {
    const t = getTranslationsForLocale("zh");
    expect(t.pdfTocHeading).toBe("目錄");
  });

  it("falls back to the default locale's dict when the requested locale has no entry for a key", () => {
    const t = getTranslationsForLocale("zh");
    // "home" has no zh entry in this mock, only in EN_FALLBACK — must come
    // through unchanged from the real EN_FALLBACK import, not the mock.
    expect(t.home).toBe("Home");
  });

  it("resolves the default locale directly when asked for it", () => {
    const t = getTranslationsForLocale("en");
    expect(t.pdfTocHeading).toBe("Table of Contents");
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm vitest run lib/i18n/getTranslations.test.ts`
Expected: FAIL — `getTranslationsForLocale is not exported` (or similar).

- [ ] **Step 5: Implement `getTranslationsForLocale`**

In `lib/i18n/getTranslations.ts`, add below the existing `getTranslations` function:

```ts

// Same merge order as useT() (components/i18n/useT.ts), parameterized by an
// explicit locale instead of React context — for callers that know exactly
// which locale they want (e.g. a batch PDF export) rather than rendering for
// "whichever locale this visitor has selected."
export function getTranslationsForLocale(locale: string): UIStrings {
  const { defaultLocale, translations } = siteConfig.i18n;
  const defaultDict = translations[defaultLocale] ?? {};
  const activeDict = locale !== defaultLocale ? (translations[locale] ?? {}) : {};
  return { ...EN_FALLBACK, ...defaultDict, ...activeDict };
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm vitest run lib/i18n/getTranslations.test.ts`
Expected: PASS.

- [ ] **Step 7: Add the keys to `content/config.ts`'s explicit `en` block and commented `zh` template**

In `content/config.ts`, inside `i18n.translations.en`, right before the closing `},` of that object (after `newlyListedNoneInPeriod: "No new items in this period.",`), add:

```ts

        // ── Catalog PDF export chrome ────────────────────────────────────────
        pdfTocHeading: "Table of Contents",
        pdfCoverHeading: "Full Listing Catalog",
        pdfCoverMeta: "{itemCount} items across {categoryCount} categories",
        pdfGeneratedOn: "Generated {date}",
        pdfViewLiveListing: "View Live Listing",
        pdfFooterPage: "Page",
        pdfFooterOf: "of",
        pdfAveragePriceLabel: "Highlighted price (average): {amount}",
        condition: "Condition",
```

In the commented-out `// zh: {` template block, right before the closing `// },`, add (matching the block's existing Traditional-Chinese, `//`-prefixed style):

```ts
      //   pdfTocHeading: "目錄",
      //   pdfCoverHeading: "完整商品型錄",
      //   pdfCoverMeta: "共 {itemCount} 件商品，{categoryCount} 個分類",
      //   pdfGeneratedOn: "產生於 {date}",
      //   pdfViewLiveListing: "查看線上頁面",
      //   pdfFooterPage: "第",
      //   pdfFooterOf: "/ 共",
      //   pdfAveragePriceLabel: "最高顯示價格（平均）：{amount}",
      //   condition: "商品狀況",
```

- [ ] **Step 8: Add a `configDefaults.ts` entry so downstream sites auto-splice these keys**

In `scripts/lib/configDefaults.ts`, add a new entry to the `CONFIG_DEFAULTS` array, after the existing `filterPriceBucketAll` entry (keeping the file's stated ordering convention — "in the order they appear in content/config.ts"):

```ts
  {
    key: "pdfTocHeading",
    afterKey: "newlyListedNoneInPeriod:",
    lines: [
      "",
      "        // ── Catalog PDF export chrome ────────────────────────────────────────",
      '        pdfTocHeading: "Table of Contents",',
      '        pdfCoverHeading: "Full Listing Catalog",',
      '        pdfCoverMeta: "{itemCount} items across {categoryCount} categories",',
      '        pdfGeneratedOn: "Generated {date}",',
      '        pdfViewLiveListing: "View Live Listing",',
      '        pdfFooterPage: "Page",',
      '        pdfFooterOf: "of",',
      '        pdfAveragePriceLabel: "Highlighted price (average): {amount}",',
      '        condition: "Condition",',
    ],
  },
```

- [ ] **Step 9: Update `docs/DESIGN.md` §12 (i18n) and `docs/DESIGN_zh.md`**

In `docs/DESIGN.md`, after the paragraph ending `See TECH_REQUIREMENTS.md §22.8.` (originally line 927), add a new paragraph:

```markdown

- **Batch/offline rendering uses `getTranslationsForLocale(locale)`.** `lib/i18n/getTranslations.ts` exports a second function alongside `getTranslations()`: `getTranslationsForLocale(locale)` takes an explicit locale instead of always resolving `defaultLocale`, for callers that know exactly which locale they want up front (e.g. Seller Studio's catalog PDF export, §22) rather than rendering for "whichever locale this visitor has selected." It uses the same `{...EN_FALLBACK, ...defaultDict, ...activeDict}` merge order as `useT()`. New `UIStrings` keys are added to the type as plain required `string` fields (not `?`) — the type itself is never partial — but `siteConfig.i18n.translations` is `Record<string, Partial<UIStrings>>` (line 127), so a downstream site's `content/config.ts` missing a newly-added key still type-checks; at runtime `EN_FALLBACK` fills the gap. Separately, `pnpm build`'s `check-config` step enforces a *curated* subset of keys (`REQUIRED_UI_STRING_KEYS`, `scripts/lib/i18nRequiredKeys.ts`) per non-default locale — a new key must **not** be added to that list unless it's user-visible on every page, or downstream sites with a second locale enabled would fail the build after upgrading.
```

Mirror the same addition in `docs/DESIGN_zh.md` at the matching location (find the paragraph ending in `詳見 TECH_REQUIREMENTS.md §22.8。` or equivalent — search for the Chinese sentence corresponding to the English one just edited), translated:

```markdown

- **批次／離線渲染使用 `getTranslationsForLocale(locale)`。** `lib/i18n/getTranslations.ts` 除了 `getTranslations()` 外，還匯出第二個函式：`getTranslationsForLocale(locale)` 接受明確指定的語系，而非總是解析 `defaultLocale`，適用於呼叫端已知道要哪個語系的情境（例如賣家 Studio 的型錄 PDF 匯出，見 §22），而非「依訪客目前選擇的語系渲染」。其合併順序與 `useT()` 相同：`{...EN_FALLBACK, ...defaultDict, ...activeDict}`。新增的 `UIStrings` 欄位仍是必填的 `string`（型別本身從不使用 `?`），但 `siteConfig.i18n.translations` 的型別是 `Record<string, Partial<UIStrings>>`（第 127 行），因此下游站台的 `content/config.ts` 即使缺少新欄位仍可通過型別檢查；執行期則由 `EN_FALLBACK` 補上缺口。另外，`pnpm build` 的 `check-config` 步驟會針對每個非預設語系強制檢查一份**精選過**的欄位子集（`REQUIRED_UI_STRING_KEYS`，`scripts/lib/i18nRequiredKeys.ts`）——新欄位除非是每一頁都會顯示的內容，否則不應加入該清單，否則已啟用第二語系的下游站台在升級後會建置失敗。
```

- [ ] **Step 10: Type-check and run the full i18n test suite**

Run: `pnpm tsc --noEmit && pnpm vitest run lib/i18n lib/config`
Expected: no type errors; all tests pass.

- [ ] **Step 11: Commit**

```bash
git add lib/config/types.ts lib/i18n/translations.ts lib/i18n/getTranslations.ts lib/i18n/getTranslations.test.ts content/config.ts scripts/lib/configDefaults.ts docs/DESIGN.md docs/DESIGN_zh.md
git commit -m "feat(i18n): add PDF-chrome UIStrings keys and getTranslationsForLocale"
```

---

### Task 4: Localize and re-parameterize `scripts/lib/pdfCatalog/template.ts`

**Files:**
- Modify: `scripts/lib/pdfCatalog/template.ts`
- Test: `scripts/lib/pdfCatalog/template.test.ts`

**Interfaces:**
- Consumes: `resolvePriceByStrategy`, `PriceStrategy` from Task 1 (`../../../lib/utils/pricing`); `UIStrings` type from Task 3 (`../../../lib/config/types`).
- Produces: every exported `build*Html` function now takes a `t: UIStrings` parameter (and `buildPriceHtml`/`buildItemHtml`/`buildFullCatalogHtml` also take `strategy: PriceStrategy`) — consumed by Task 5 (`generate.ts`).

- [ ] **Step 1: Update the failing tests first**

Replace `scripts/lib/pdfCatalog/template.test.ts` in full:

```ts
import { describe, expect, it } from "vitest";
import {
  buildCoverHtml,
  buildTocHtml,
  buildItemHtml,
  buildFullCatalogHtml,
  buildPriceHtml,
  type ItemPdfView,
  type CategoryGroup,
  type SiteBranding,
} from "./template";
import type { UIStrings } from "../../../lib/config/types";
import { EN_FALLBACK } from "../../../lib/i18n/translations";

const T_EN: UIStrings = EN_FALLBACK;
const T_ZH: UIStrings = {
  ...EN_FALLBACK,
  pdfTocHeading: "目錄",
  statusAvailable: "在售",
  statusSold: "已售出",
  contactForPrice: "請聯繫賣家詢問價格。",
};

function makeItem(overrides: Partial<ItemPdfView> = {}): ItemPdfView {
  return {
    categorySlug: "electronics",
    itemSlug: "desk-lamp",
    name: "Desk Lamp",
    description: "A bright desk lamp.",
    condition: "good",
    status: "available",
    price: { currency: "USD", tiers: [{ label: "Pickup", amount: 20 }], negotiable: false, show_tiers: false },
    brand: "IKEA",
    model: "",
    ageYears: 2,
    dimensions: null,
    weight: null,
    color: "black",
    tags: ["lighting"],
    images: ["https://cdn.example.com/lamp-1.jpg"],
    coverImage: "https://cdn.example.com/lamp-1.jpg",
    ...overrides,
  };
}

describe("buildPriceHtml", () => {
  it("shows a single resolved amount when show_tiers is false", () => {
    const html = buildPriceHtml(
      { currency: "USD", tiers: [{ label: "Pickup", amount: 20 }], negotiable: false, show_tiers: false },
      "lowest",
      T_EN,
    );
    expect(html).toContain("$20");
    expect(html).not.toContain("tier-table");
  });

  it("shows the full tier table when show_tiers is true with multiple tiers, highlighting the strategy's tier", () => {
    const html = buildPriceHtml(
      {
        currency: "USD",
        tiers: [
          { label: "Pickup", amount: 20, miles_max: 10 },
          { label: "Shipping", amount: 35 },
        ],
        negotiable: false,
        show_tiers: true,
      },
      "shipping",
      T_EN,
    );
    expect(html).toContain("tier-table");
    expect(html).toContain("Pickup");
    expect(html).toContain("Shipping");
    expect(html).toMatch(/tier-default[^]*Shipping|Shipping[^]*tier-default/);
    expect(html).not.toContain("price-highlight");
  });

  it("shows a price-highlight banner and no highlighted row for the average strategy", () => {
    const html = buildPriceHtml(
      {
        currency: "USD",
        tiers: [
          { label: "Pickup", amount: 20, miles_max: 10 },
          { label: "Shipping", amount: 40 },
        ],
        negotiable: false,
        show_tiers: true,
      },
      "average",
      T_EN,
    );
    expect(html).toContain("price-highlight");
    expect(html).toContain("$30");
    expect(html).not.toContain("tier-default");
  });

  it("shows the localized contact-for-price message when there are no tiers", () => {
    const html = buildPriceHtml({ currency: "USD", tiers: [], negotiable: false, show_tiers: false }, "lowest", T_ZH);
    expect(html).toContain("請聯繫賣家詢問價格。");
  });
});

describe("buildItemHtml", () => {
  it("includes the item name, anchor id, and live link", () => {
    const html = buildItemHtml(makeItem(), "https://example.com", "lowest", T_EN);
    expect(html).toContain('id="item-electronics-desk-lamp"');
    expect(html).toContain("Desk Lamp");
    expect(html).toContain("https://example.com/electronics/desk-lamp");
  });

  it("never renders a reserved_for value even if smuggled onto the object", () => {
    const poisoned = { ...makeItem(), reserved_for: "Jane Buyer" } as unknown as ItemPdfView;
    const html = buildItemHtml(poisoned, "https://example.com", "lowest", T_EN);
    expect(html).not.toContain("Jane Buyer");
  });

  it("omits the image grid when there are no images", () => {
    const html = buildItemHtml(makeItem({ images: [], coverImage: null }), "https://example.com", "lowest", T_EN);
    expect(html).not.toContain("item-images");
  });

  it("localizes the status badge and the generic Condition specs label", () => {
    const html = buildItemHtml(makeItem({ status: "sold" }), "https://example.com", "lowest", T_ZH);
    expect(html).toContain("已售出");
    const enHtml = buildItemHtml(makeItem(), "https://example.com", "lowest", T_EN);
    expect(enHtml).toContain(">Condition<");
  });
});

describe("buildTocHtml", () => {
  it("links each entry to its matching item anchor and localizes the heading", () => {
    const groups: CategoryGroup[] = [
      { slug: "electronics", displayName: "Electronics", description: "", items: [makeItem()] },
    ];
    const toc = buildTocHtml(groups, T_ZH);
    expect(toc).toContain('href="#item-electronics-desk-lamp"');
    expect(toc).toContain("目錄");
  });
});

describe("buildCoverHtml", () => {
  it("shows item and category counts, the site name, and localized chrome", () => {
    const branding: SiteBranding = { name: "UsedExchange", tagline: "Quality stuff.", logo: "", baseUrl: "https://example.com" };
    const html = buildCoverHtml(branding, 12, 3, "2026-08-13", T_EN);
    expect(html).toContain("UsedExchange");
    expect(html).toContain("12 items across 3 categories");
    expect(html).toContain("Generated 2026-08-13");
  });
});

describe("buildFullCatalogHtml", () => {
  it("assembles cover, toc, category divider, and item sections in order", () => {
    const branding: SiteBranding = { name: "UsedExchange", tagline: "", logo: "", baseUrl: "https://example.com" };
    const groups: CategoryGroup[] = [
      { slug: "electronics", displayName: "Electronics", description: "", items: [makeItem()] },
    ];
    const html = buildFullCatalogHtml(branding, groups, "2026-08-13", T_EN, "lowest");
    const coverIdx = html.indexOf("Full Listing Catalog");
    const tocIdx = html.indexOf("Table of Contents");
    const dividerIdx = html.indexOf('class="category-divider"');
    const itemIdx = html.indexOf('id="item-electronics-desk-lamp"');
    expect(coverIdx).toBeGreaterThanOrEqual(0);
    expect(coverIdx).toBeLessThan(tocIdx);
    expect(tocIdx).toBeLessThan(dividerIdx);
    expect(dividerIdx).toBeLessThan(itemIdx);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run scripts/lib/pdfCatalog/template.test.ts`
Expected: FAIL — signature mismatches (too few arguments) on every `build*Html` call.

- [ ] **Step 3: Rewrite `template.ts`**

Replace `scripts/lib/pdfCatalog/template.ts` in full:

```ts
import type { Condition, Price, Status } from "../../../lib/content/types";
import type { UIStrings } from "../../../lib/config/types";
import { resolvePriceByStrategy, type PriceStrategy } from "../../../lib/utils/pricing";

export type ItemPdfView = {
  categorySlug: string;
  itemSlug: string;
  name: string;
  description: string;
  condition: Condition;
  status: Status;
  price: Price;
  brand: string;
  model: string;
  ageYears: number | null;
  dimensions: { length: number; width: number; height: number; unit: "cm" | "in" } | null;
  weight: { value: number; unit: "kg" | "lb" } | null;
  color: string;
  tags: string[];
  images: string[];
  coverImage: string | null;
};

export type CategoryGroup = {
  slug: string;
  displayName: string;
  description: string;
  items: ItemPdfView[];
};

export type SiteBranding = {
  name: string;
  tagline: string;
  /** Already an absolute URL (or "" for none) — callers resolve it against baseUrl before passing it in. */
  logo: string;
  baseUrl: string;
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Minimal `{key}` substitution for the handful of UIStrings entries this
// template composes with numbers/dates — not a general i18n mechanism (the
// rest of the site has no such need yet), and deliberately does not attempt
// locale-aware word order or pluralization: every composed PDF chrome
// sentence uses fixed English word order with substituted values, same
// limitation every other composed UIStrings sentence in this codebase has.
function fmt(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? ""));
}

function conditionLabel(condition: Condition, t: UIStrings): string {
  const map: Record<Condition, string> = {
    new: t.conditionNew,
    "like-new": t.conditionLikeNew,
    good: t.conditionGood,
    fair: t.conditionFair,
    "for-parts": t.conditionForParts,
  };
  return map[condition];
}

function statusLabel(status: Status, t: UIStrings): string {
  const map: Record<Status, string> = {
    available: t.statusAvailable,
    pending: t.statusPending,
    reserved: t.statusReserved,
    sold: t.statusSold,
    draft: t.statusDraft,
  };
  return map[status];
}

// Mirrors components/contact/PlatformButton.tsx's formatPrice and
// studio/src/itemDisplay.ts's formatPrice: currency is seller-authored
// (item.json's price.currency, free-form and not ISO-validated), so
// Intl.NumberFormat can throw a RangeError on it — caught and replaced with a
// plain "$" fallback that never re-embeds the raw currency string, so this
// stays safe to interpolate into the page HTML without an explicit
// escapeHtml call.
function formatAmount(currency: string, amount: number): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${amount.toLocaleString()}`;
  }
}

export function buildPriceHtml(price: Price, strategy: PriceStrategy, t: UIStrings): string {
  if (price.tiers.length === 0) {
    return `<p class="price price-contact">${escapeHtml(t.contactForPrice)}</p>`;
  }
  const resolved = resolvePriceByStrategy(price.tiers, strategy);
  const negotiable = price.negotiable ? `<span class="price-obo">${escapeHtml(t.obo)}</span>` : "";

  if (!price.show_tiers || price.tiers.length === 1) {
    if (resolved === null) {
      return `<p class="price price-contact">${escapeHtml(t.contactForPrice)}</p>`;
    }
    const label = resolved.tier?.label
      ? `<span class="price-label">(${escapeHtml(resolved.tier.label)})</span>`
      : "";
    return `<p class="price"><span class="price-amount">${formatAmount(price.currency, resolved.amount)}</span>${negotiable}${label}</p>`;
  }

  // "average" resolves to no real tier — no row can be marked default, so a
  // banner line carries the computed price instead. Every other strategy
  // resolves to a real tier and needs no banner; the row highlight alone
  // communicates the default, exactly as v1 did.
  const highlightBanner =
    resolved !== null && resolved.tier === null
      ? `<p class="price-highlight">${escapeHtml(fmt(t.pdfAveragePriceLabel, { amount: formatAmount(price.currency, resolved.amount) }))}</p>`
      : "";

  const rows = price.tiers
    .map((tier) => {
      const isResolved =
        resolved !== null &&
        resolved.tier !== null &&
        tier.label === resolved.tier.label &&
        tier.amount === resolved.tier.amount;
      const range =
        tier.miles_max === undefined
          ? `${tier.miles_min ?? 0}+ ${escapeHtml(t.distanceUnit)}`
          : `${tier.miles_min ?? 0}–${tier.miles_max} ${escapeHtml(t.distanceUnit)}`;
      return `<tr class="${isResolved ? "tier-default" : ""}"><td>${escapeHtml(tier.label)}</td><td>${range}</td><td>${formatAmount(price.currency, tier.amount)}</td></tr>`;
    })
    .join("");
  return `<div class="price">${negotiable}${highlightBanner}<table class="tier-table"><thead><tr><th>${escapeHtml(t.pricingLabelHeader)}</th><th>${escapeHtml(t.pricingDistanceHeader)}</th><th>${escapeHtml(t.pricingPriceHeader)}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function buildSpecsHtml(item: ItemPdfView, t: UIStrings): string {
  const rows: Array<[string, string]> = [];
  if (item.brand) rows.push([t.brand, item.brand]);
  if (item.model) rows.push([t.model, item.model]);
  if (item.color) rows.push([t.color, item.color]);
  if (item.ageYears !== null) rows.push([t.age, `${item.ageYears} yr${item.ageYears === 1 ? "" : "s"}`]);
  if (item.dimensions) {
    const d = item.dimensions;
    rows.push([t.dimensions, `${d.length} × ${d.width} × ${d.height} ${d.unit}`]);
  }
  if (item.weight) {
    rows.push([t.weight, `${item.weight.value} ${item.weight.unit}`]);
  }
  rows.push([t.condition, conditionLabel(item.condition, t)]);
  const trs = rows
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join("");
  return `<table class="specs">${trs}</table>`;
}

export function buildCoverHtml(
  branding: SiteBranding,
  itemCount: number,
  categoryCount: number,
  generatedAt: string,
  t: UIStrings,
): string {
  const logoHtml = branding.logo
    ? `<img class="cover-logo" src="${escapeHtml(branding.logo)}" alt="" onerror="this.remove()" />`
    : "";
  return `
    <section class="cover">
      ${logoHtml}
      <h1>${escapeHtml(branding.name)}</h1>
      <p class="cover-tagline">${escapeHtml(branding.tagline)}</p>
      <p class="cover-heading">${escapeHtml(t.pdfCoverHeading)}</p>
      <p class="cover-meta">${escapeHtml(fmt(t.pdfCoverMeta, { itemCount, categoryCount }))}</p>
      <p class="cover-meta">${escapeHtml(fmt(t.pdfGeneratedOn, { date: generatedAt }))}</p>
    </section>`;
}

export function buildTocHtml(groups: CategoryGroup[], t: UIStrings): string {
  const sections = groups
    .map((group) => {
      const items = group.items
        .map(
          (item) =>
            `<li><a href="#item-${escapeHtml(item.categorySlug)}-${escapeHtml(item.itemSlug)}">${escapeHtml(item.name)}</a></li>`,
        )
        .join("");
      return `<div class="toc-group"><h3>${escapeHtml(group.displayName)}</h3><ul>${items}</ul></div>`;
    })
    .join("");
  return `<section class="toc"><h1>${escapeHtml(t.pdfTocHeading)}</h1>${sections}</section>`;
}

export function buildCategorySectionHtml(group: CategoryGroup): string {
  const description = group.description
    ? `<p class="category-description">${escapeHtml(group.description)}</p>`
    : "";
  return `
    <section class="category-divider">
      <h1>${escapeHtml(group.displayName)}</h1>
      ${description}
    </section>`;
}

export function buildItemHtml(
  item: ItemPdfView,
  baseUrl: string,
  strategy: PriceStrategy,
  t: UIStrings,
): string {
  const anchor = `item-${item.categorySlug}-${item.itemSlug}`;
  const liveUrl = `${baseUrl}/${item.categorySlug}/${item.itemSlug}`;
  const images = [item.coverImage, ...item.images.filter((src) => src !== item.coverImage)]
    .filter((src): src is string => src !== null)
    .slice(0, 4);
  const imageGrid =
    images.length === 0
      ? ""
      : `<div class="item-images">${images
          .map((src) => `<img src="${escapeHtml(src)}" alt="" onerror="this.remove()" />`)
          .join("")}</div>`;
  const statusBadge =
    item.status === "available"
      ? ""
      : `<span class="status-badge status-${item.status}">${escapeHtml(statusLabel(item.status, t))}</span>`;
  const tagsHtml =
    item.tags.length === 0
      ? ""
      : `<p class="item-tags">${item.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</p>`;

  return `
    <section class="item-page" id="${escapeHtml(anchor)}">
      <h2 class="item-title">${escapeHtml(item.name)} ${statusBadge}</h2>
      ${imageGrid}
      ${buildPriceHtml(item.price, strategy, t)}
      <p class="item-description">${escapeHtml(item.description)}</p>
      ${buildSpecsHtml(item, t)}
      ${tagsHtml}
      <p class="item-link">
        <a class="live-link" href="${escapeHtml(liveUrl)}">${escapeHtml(t.pdfViewLiveListing)} ↗</a>
        <br /><span class="live-url-text">${escapeHtml(liveUrl)}</span>
      </p>
    </section>`;
}

const CATALOG_CSS = `
:root { --ink: #2b2621; --paper: #faf6ef; --accent: #b5651d; --muted: #8a7f6f; --line: #ddd3c2; }
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: var(--ink); background: var(--paper); }
h1, h2, h3 { font-family: Georgia, "Times New Roman", serif; margin: 0 0 0.3em; }
.cover { height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; page-break-after: always; }
.cover-logo { max-height: 64px; margin-bottom: 16px; }
.cover h1 { font-size: 42px; }
.cover-tagline { color: var(--muted); font-size: 16px; }
.cover-heading { font-size: 22px; margin-top: 40px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); }
.cover-meta { color: var(--muted); font-size: 13px; }
.toc { page-break-after: always; padding: 24px 8px; }
.toc h1 { font-size: 26px; border-bottom: 2px solid var(--accent); padding-bottom: 8px; }
.toc-group h3 { color: var(--accent); margin-top: 20px; font-size: 16px; }
.toc-group ul { list-style: none; margin: 4px 0; padding: 0; }
.toc-group li { padding: 2px 0; }
.toc-group a { color: var(--ink); text-decoration: none; }
.category-divider { page-break-before: always; padding: 60px 8px 24px; border-bottom: 1px solid var(--line); }
.category-divider h1 { font-size: 30px; color: var(--accent); }
.category-description { color: var(--muted); }
.item-page { page-break-before: always; padding: 24px 8px; }
.item-title { font-size: 24px; display: flex; align-items: center; gap: 10px; }
.status-badge { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 8px; border-radius: 10px; background: var(--line); color: var(--ink); }
.item-images { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0; }
.item-images img { width: 100%; height: 120px; object-fit: cover; border-radius: 4px; border: 1px solid var(--line); }
.price { margin: 12px 0; }
.price-amount { font-size: 26px; font-weight: bold; }
.price-obo, .price-label { font-size: 13px; color: var(--muted); margin-left: 6px; }
.price-contact { color: var(--muted); font-style: italic; }
.price-highlight { margin: 6px 0 10px; font-size: 13px; font-weight: bold; color: var(--accent); }
.tier-table { border-collapse: collapse; width: 100%; margin-top: 8px; font-size: 13px; }
.tier-table th, .tier-table td { border: 1px solid var(--line); padding: 4px 8px; text-align: left; }
.tier-table tr.tier-default { background: #f1e6d3; font-weight: bold; }
.item-description { line-height: 1.5; white-space: pre-wrap; }
.specs { border-collapse: collapse; margin: 12px 0; font-size: 13px; }
.specs th { text-align: left; color: var(--muted); padding: 3px 12px 3px 0; font-weight: normal; }
.specs td { padding: 3px 0; }
.item-tags { margin: 8px 0; }
.tag { display: inline-block; background: var(--line); border-radius: 10px; padding: 2px 10px; font-size: 11px; margin: 0 4px 4px 0; }
.item-link { margin-top: 16px; }
.live-link { color: var(--accent); font-weight: bold; text-decoration: none; }
.live-url-text { color: var(--muted); font-size: 11px; }
`;

export function buildFullCatalogHtml(
  branding: SiteBranding,
  groups: CategoryGroup[],
  generatedAt: string,
  t: UIStrings,
  strategy: PriceStrategy,
): string {
  const itemCount = groups.reduce((sum, g) => sum + g.items.length, 0);
  const body = [
    buildCoverHtml(branding, itemCount, groups.length, generatedAt, t),
    buildTocHtml(groups, t),
    ...groups.flatMap((group) => [
      buildCategorySectionHtml(group),
      ...group.items.map((item) => buildItemHtml(item, branding.baseUrl, strategy, t)),
    ]),
  ].join("\n");
  return `<!doctype html><html><head><meta charset="utf-8" /><style>${CATALOG_CSS}</style></head><body>${body}</body></html>`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/lib/pdfCatalog/template.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/pdfCatalog/template.ts scripts/lib/pdfCatalog/template.test.ts
git commit -m "feat(pdf-catalog): localize template.ts chrome and add strategy-aware price rendering"
```

---

### Task 5: `PdfExportOptions` and localized filtering in `scripts/lib/pdfCatalog/generate.ts`

**Files:**
- Modify: `scripts/lib/pdfCatalog/generate.ts`
- Test: `scripts/lib/pdfCatalog/generate.test.ts`

**Interfaces:**
- Consumes: `getTranslationsForLocale` from Task 3 (`../../../lib/i18n/getTranslations`); `getLocalizedField` (existing, unchanged, `../../../lib/utils/i18n`); `PriceStrategy` from Task 1; `buildFullCatalogHtml`'s new signature from Task 4.
- Produces: `export type PdfExportOptions = { locale: string; priceStrategy: PriceStrategy; categories: string[]; statuses: Status[] };`, `export async function generateCatalogPdf(options: PdfExportOptions)` (was zero-arg) — consumed by Task 6 (`studioApi.ts`).

- [ ] **Step 1: Update the failing tests first**

Replace `scripts/lib/pdfCatalog/generate.test.ts` in full:

```ts
import { describe, expect, it, vi } from "vitest";
import * as loaderModule from "@/lib/content/loader";
import type { Category, Item } from "@/lib/content/types";
import { groupEligibleItems, generateCatalogPdf, type PdfExportOptions } from "./generate";

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    categorySlug: "electronics",
    itemSlug: "desk-lamp",
    name: "Desk Lamp",
    description: "A bright desk lamp.",
    condition: "good",
    status: "available",
    price: { currency: "USD", tiers: [], negotiable: false, show_tiers: false },
    noLowball: false,
    priceReduced: false,
    previousLowestPrice: null,
    minAcceptableOffer: null,
    brand: "",
    model: "",
    ageYears: null,
    dimensions: null,
    weight: null,
    color: "",
    quantity: 1,
    originalSource: "",
    originalLink: "",
    originalPrice: null,
    listedDate: "2026-01-01",
    soldDate: null,
    preferredPayment: [],
    contactNote: "",
    stripePaymentLink: "",
    venmoPaymentRequest: "",
    pickupWindows: [],
    youtubeLink: "",
    tags: [],
    categoryOverride: "",
    metaDescription: "",
    isbn: "",
    course: "",
    edition: "",
    semesterListed: "",
    nameZh: "",
    descriptionZh: "",
    images: [],
    coverImage: null,
    ...overrides,
  };
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    slug: "electronics",
    displayName: "Electronics",
    description: "Gadgets and gear.",
    icon: "",
    sortOrder: 0,
    availableItemCount: 0,
    coverImage: null,
    ...overrides,
  };
}

const ALL_STATUSES: Item["status"][] = ["available", "pending", "reserved", "sold", "draft"];

describe("groupEligibleItems", () => {
  it("filters to only the requested statuses", () => {
    const items = [
      makeItem({ itemSlug: "a", status: "available" }),
      makeItem({ itemSlug: "b", status: "sold" }),
      makeItem({ itemSlug: "c", status: "draft" }),
      makeItem({ itemSlug: "d", status: "pending" }),
      makeItem({ itemSlug: "e", status: "reserved" }),
    ];
    const groups = groupEligibleItems(items, [makeCategory()], ["available", "pending", "reserved"], ["electronics"], "en");
    const slugs = groups.flatMap((g) => g.items.map((i) => i.itemSlug));
    expect(slugs.sort()).toEqual(["a", "d", "e"]);
  });

  it("includes sold and draft items when those statuses are requested", () => {
    const items = [makeItem({ itemSlug: "a", status: "sold" }), makeItem({ itemSlug: "b", status: "draft" })];
    const groups = groupEligibleItems(items, [makeCategory()], ["sold", "draft"], ["electronics"], "en");
    const slugs = groups.flatMap((g) => g.items.map((i) => i.itemSlug));
    expect(slugs.sort()).toEqual(["a", "b"]);
  });

  it("filters to only the requested categories", () => {
    const items = [
      makeItem({ categorySlug: "books", itemSlug: "novel" }),
      makeItem({ categorySlug: "toys", itemSlug: "yo-yo" }),
    ];
    const categories = [makeCategory({ slug: "books" }), makeCategory({ slug: "toys" })];
    const groups = groupEligibleItems(items, categories, ALL_STATUSES, ["toys"], "en");
    expect(groups.map((g) => g.slug)).toEqual(["toys"]);
  });

  it("drops categories with zero eligible items and preserves the given category order otherwise", () => {
    const items = [
      makeItem({ categorySlug: "books", itemSlug: "novel" }),
      makeItem({ categorySlug: "toys", itemSlug: "yo-yo" }),
    ];
    const categories = [
      makeCategory({ slug: "electronics", displayName: "Electronics" }),
      makeCategory({ slug: "toys", displayName: "Toys" }),
      makeCategory({ slug: "books", displayName: "Books" }),
    ];
    const groups = groupEligibleItems(items, categories, ALL_STATUSES, ["electronics", "toys", "books"], "en");
    expect(groups.map((g) => g.slug)).toEqual(["toys", "books"]);
  });

  it("sorts items within a category newest-first, falling back to name", () => {
    const items = [
      makeItem({ itemSlug: "old", name: "Zeta", listedDate: "2026-01-01" }),
      makeItem({ itemSlug: "new", name: "Alpha", listedDate: "2026-06-01" }),
      makeItem({ itemSlug: "tie-b", name: "Bravo", listedDate: "2026-06-01" }),
    ];
    const groups = groupEligibleItems(items, [makeCategory()], ALL_STATUSES, ["electronics"], "en");
    expect(groups[0]?.items.map((i) => i.itemSlug)).toEqual(["new", "tie-b", "old"]);
  });

  it("resolves item name/description through the requested locale", () => {
    const items = [makeItem({ name: "Lamp", description: "English desc", nameZh: "灯", descriptionZh: "中文描述" })];
    const zhGroups = groupEligibleItems(items, [makeCategory()], ALL_STATUSES, ["electronics"], "zh");
    expect(zhGroups[0]?.items[0]?.name).toBe("灯");
    expect(zhGroups[0]?.items[0]?.description).toBe("中文描述");

    const enGroups = groupEligibleItems(items, [makeCategory()], ALL_STATUSES, ["electronics"], "en");
    expect(enGroups[0]?.items[0]?.name).toBe("Lamp");
  });
});

function baseOptions(overrides: Partial<PdfExportOptions> = {}): PdfExportOptions {
  return {
    locale: "en",
    priceStrategy: "lowest",
    categories: ["electronics"],
    statuses: ["available", "pending", "reserved"],
    ...overrides,
  };
}

describe("generateCatalogPdf", () => {
  it("returns an error when there are no eligible items", async () => {
    // Spies are captured and explicitly restored in `finally` (no global mock
    // reset is configured) so they cannot leak into a later test in this file.
    const mockLoadAllItemsRaw = vi
      .spyOn(loaderModule, "loadAllItemsRaw")
      .mockResolvedValue([makeItem({ status: "sold" })]);
    const mockLoadCategories = vi.spyOn(loaderModule, "loadCategories").mockResolvedValue([makeCategory()]);

    try {
      const result = await generateCatalogPdf(baseOptions());
      expect(result).toEqual({ error: "No public-visible items to export." });
    } finally {
      mockLoadAllItemsRaw.mockRestore();
      mockLoadCategories.mockRestore();
    }
  });

  it("returns an error when the requested categories/statuses match nothing, even with eligible items elsewhere", async () => {
    const mockLoadAllItemsRaw = vi
      .spyOn(loaderModule, "loadAllItemsRaw")
      .mockResolvedValue([makeItem({ status: "available" })]);
    const mockLoadCategories = vi.spyOn(loaderModule, "loadCategories").mockResolvedValue([makeCategory()]);

    try {
      const result = await generateCatalogPdf(baseOptions({ statuses: [] }));
      expect(result).toEqual({ error: "No public-visible items to export." });
    } finally {
      mockLoadAllItemsRaw.mockRestore();
      mockLoadCategories.mockRestore();
    }
  });

  it("renders a real PDF file for fixture items", async () => {
    const mockLoadAllItemsRaw = vi.spyOn(loaderModule, "loadAllItemsRaw").mockResolvedValue([makeItem()]);
    const mockLoadCategories = vi.spyOn(loaderModule, "loadCategories").mockResolvedValue([makeCategory()]);

    try {
      let chromiumAvailable = true;
      const { chromium } = await import("playwright");
      try {
        const browser = await chromium.launch();
        await browser.close();
      } catch {
        chromiumAvailable = false;
      }
      if (!chromiumAvailable) {
        console.warn("Skipping: Chromium not installed. Run `npx playwright install chromium`.");
        return;
      }

      const result = await generateCatalogPdf(baseOptions());
      expect("file" in result).toBe(true);
      if ("file" in result) {
        const fs = await import("fs/promises");
        const bytes = await fs.readFile(result.file);
        expect(bytes.subarray(0, 4).toString("ascii")).toBe("%PDF");
        await fs.unlink(result.file);
      }
    } finally {
      mockLoadAllItemsRaw.mockRestore();
      mockLoadCategories.mockRestore();
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run scripts/lib/pdfCatalog/generate.test.ts`
Expected: FAIL — `groupEligibleItems`/`generateCatalogPdf` called with wrong arity, `PdfExportOptions` not exported.

- [ ] **Step 3: Rewrite `generate.ts`**

Replace `scripts/lib/pdfCatalog/generate.ts` in full:

```ts
import fs from "fs/promises";
import os from "os";
import path from "path";
import { loadAllItemsRaw, loadCategories } from "../../../lib/content/loader";
import type { Category, Item, Status } from "../../../lib/content/types";
import { siteConfig } from "../../../content/config";
import { getLocalizedField } from "../../../lib/utils/i18n";
import { getTranslationsForLocale } from "../../../lib/i18n/getTranslations";
import type { PriceStrategy } from "../../../lib/utils/pricing";
import { buildFullCatalogHtml, escapeHtml, type CategoryGroup, type ItemPdfView } from "./template";

export type PdfExportOptions = {
  locale: string;
  priceStrategy: PriceStrategy;
  /** Category slugs to include. */
  categories: string[];
  /** Statuses to include. */
  statuses: Status[];
};

// page.pdf() has no `timeout` option of its own (unlike setContent(), which
// does) — Playwright's Page.pdf() type simply does not expose one in this
// version. This race is the manual equivalent, so both render steps still
// share the same generous ceiling instead of pdf() alone being able to hang
// indefinitely.
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function toItemPdfView(item: Item, locale: string): ItemPdfView {
  return {
    categorySlug: item.categorySlug,
    itemSlug: item.itemSlug,
    name: getLocalizedField(item, "name", locale),
    description: getLocalizedField(item, "description", locale),
    condition: item.condition,
    status: item.status,
    price: item.price,
    brand: item.brand,
    model: item.model,
    ageYears: item.ageYears,
    dimensions: item.dimensions,
    weight: item.weight,
    color: item.color,
    tags: item.tags,
    images: item.images,
    coverImage: item.coverImage,
  };
}

// Exported for unit testing without touching Playwright/Chromium at all.
export function groupEligibleItems(
  items: Item[],
  categories: Category[],
  statuses: Status[],
  includedCategorySlugs: string[],
  locale: string,
): CategoryGroup[] {
  const statusSet = new Set(statuses);
  const categorySet = new Set(includedCategorySlugs);
  const eligible = items.filter((i) => statusSet.has(i.status) && categorySet.has(i.categorySlug));

  const byCategory = new Map<string, Item[]>();
  for (const item of eligible) {
    const list = byCategory.get(item.categorySlug) ?? [];
    list.push(item);
    byCategory.set(item.categorySlug, list);
  }

  // categories is already in display order (sort_order asc, then alpha —
  // see lib/content/loader.ts); .filter() below preserves that order.
  return categories
    .filter((c) => byCategory.has(c.slug))
    .map((c) => {
      const catItems = [...(byCategory.get(c.slug) ?? [])].sort((a, b) => {
        if (a.listedDate !== b.listedDate) return b.listedDate.localeCompare(a.listedDate);
        return a.name.localeCompare(b.name);
      });
      return {
        slug: c.slug,
        displayName: c.displayName,
        description: c.description,
        items: catItems.map((item) => toItemPdfView(item, locale)),
      };
    });
}

// Takes only `options` — unlike the design spec's original
// `generateCatalogPdf(projectRoot: string)` sketch — because
// loadAllItemsRaw()/loadCategories() always resolve content/ from
// process.cwd(), and Studio's server process cwd and req.projectRoot
// coincide (see the "Note:" comment on listStudioItems in studioApi.ts for
// the established precedent of documenting this same fact).
export async function generateCatalogPdf(
  options: PdfExportOptions,
): Promise<{ file: string } | { error: string }> {
  const [items, categories] = await Promise.all([loadAllItemsRaw(), loadCategories()]);
  const groups = groupEligibleItems(items, categories, options.statuses, options.categories, options.locale);
  if (groups.length === 0) {
    return { error: "No public-visible items to export." };
  }

  const t = getTranslationsForLocale(options.locale);

  // Logo is a public/ path (e.g. "/logo.svg") the live site serves at its own
  // origin — page.setContent() has no origin of its own, so it must be made
  // absolute here or the <img> in the cover page would 404 silently.
  const logo = siteConfig.logo ? `${siteConfig.baseUrl}${siteConfig.logo}` : "";
  const html = buildFullCatalogHtml(
    { name: siteConfig.name, tagline: siteConfig.tagline, logo, baseUrl: siteConfig.baseUrl },
    groups,
    new Date().toISOString().slice(0, 10),
    t,
    options.priceStrategy,
  );

  // Dynamic import, not a static one: studioApi.ts imports this module at
  // module scope, so every Studio boot would otherwise load the `playwright`
  // package eagerly — including on a downstream site that ran
  // `pnpm update-site --skip-verify` (which explicitly skips `pnpm install`)
  // and never got the package installed at all. A missing *package* throws at
  // import time, before this try/catch exists to catch it, crashing the whole
  // Studio dev server with a raw "Cannot find module" error. Deferring the
  // import to here means "playwright missing" and "Chromium binary missing"
  // both land in the same catch and produce the same friendly typed error.
  let browser;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch();
  } catch {
    return { error: "PDF renderer not installed. Run: npx playwright install chromium" };
  }

  // Generous timeout, well above Playwright's 30s default: a catalog with many
  // items (up to 4 CDN photos each) waiting for `networkidle`, followed by
  // full-document PDF layout, can plausibly exceed the default. Both calls
  // below share this value.
  const RENDER_TIMEOUT_MS = 60_000;

  try {
    const page = await browser.newPage();
    let pdfBytes: Buffer;
    try {
      await page.setContent(html, { waitUntil: "networkidle", timeout: RENDER_TIMEOUT_MS });
      pdfBytes = await withTimeout(
        page.pdf({
          format: "Letter",
          printBackground: true,
          displayHeaderFooter: true,
          headerTemplate: "<div></div>",
          footerTemplate: `<div style="font-size:8px; width:100%; text-align:center; color:#888;">${escapeHtml(siteConfig.name)} · ${escapeHtml(t.pdfFooterPage)} <span class="pageNumber"></span> ${escapeHtml(t.pdfFooterOf)} <span class="totalPages"></span></div>`,
          margin: { top: "20mm", bottom: "16mm", left: "14mm", right: "14mm" },
        }),
        RENDER_TIMEOUT_MS,
        `PDF generation exceeded ${RENDER_TIMEOUT_MS}ms`,
      );
    } catch {
      // A raw Playwright error (e.g. "Timeout 60000ms exceeded") is not
      // actionable for a seller. Surface a typed error with real guidance
      // instead of letting this reject and fall through to
      // handleStudioRequest's generic catch-all, which would otherwise turn
      // it into an opaque 500.
      return {
        error:
          "PDF rendering timed out or failed — the catalog may be too large (many items or photos). Try again, or retry after trimming a few item photos.",
      };
    }

    const file = path.join(os.tmpdir(), `usedexchange-catalog-${Date.now()}.pdf`);
    await fs.writeFile(file, pdfBytes);
    return { file };
  } finally {
    try {
      await browser.close();
    } catch {
      // A close failure here must not mask whatever error caused this
      // `finally` to run in the first place (or override a successful result
      // already computed above) — swallow it.
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/lib/pdfCatalog/generate.test.ts`
Expected: PASS. (The Chromium-dependent test may skip with a warning if `npx playwright install chromium` has not been run in this environment — that is expected and not a failure.)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/pdfCatalog/generate.ts scripts/lib/pdfCatalog/generate.test.ts
git commit -m "feat(pdf-catalog): thread PdfExportOptions through generateCatalogPdf"
```

---

### Task 6: `POST /api/export-pdf` request body validation in `scripts/lib/studioApi.ts`

**Files:**
- Modify: `scripts/lib/studioApi.ts`
- Modify: `docs/TECH_REQUIREMENTS.md`, `docs/TECH_REQUIREMENTS_zh.md`

**Interfaces:**
- Consumes: `generateCatalogPdf`, `PdfExportOptions` from Task 5 (`./pdfCatalog/generate`).
- Produces: `handleExportPdf(req: StudioRequest): Promise<StudioResponse>` (was zero-arg) — the route body sent from Task 9's dialog must match `exportPdfBodySchema` below.

There is no dedicated `studioApi.test.ts` covering `handleExportPdf` specifically (Studio's server-side API is exercised through its own request/response contract in a few targeted spots, not a full route-by-route suite) — this task is verified by type-check plus the manual smoke check in Step 4.

- [ ] **Step 1: Add the request body schema and validate locale against `siteConfig.i18n.availableLocales`**

In `scripts/lib/studioApi.ts`, extend the import of `generateCatalogPdf`:

```ts
import { generateCatalogPdf, type PdfExportOptions } from "./pdfCatalog/generate";
```

Replace `handleExportPdf` (originally lines 1336-1342):

```ts
const exportPdfBodySchema = z.object({
  locale: z.string(),
  priceStrategy: z.enum(["lowest", "highest", "pickup", "shipping", "average"]),
  categories: z.array(z.string()),
  statuses: z.array(z.enum(["available", "pending", "reserved", "sold", "draft"])),
});

async function handleExportPdf(req: StudioRequest): Promise<StudioResponse> {
  const options: PdfExportOptions = parseJsonBody(req.body, exportPdfBodySchema);
  if (!siteConfig.i18n.availableLocales.includes(options.locale)) {
    throw new StudioError(400, `locale "${options.locale}" is not in siteConfig.i18n.availableLocales`);
  }
  const result = await generateCatalogPdf(options);
  if ("error" in result) {
    return { status: 400, body: { error: result.error } };
  }
  return { status: 200, file: result.file, contentType: "application/pdf" };
}
```

- [ ] **Step 2: Update the route to pass `req`**

Change (originally lines 1555-1560):

```ts
    if (pathname === "/api/export-pdf") {
      if (req.method !== "POST") {
        return { status: 405, body: { error: "POST only" } };
      }
      return await handleExportPdf();
    }
```

to:

```ts
    if (pathname === "/api/export-pdf") {
      if (req.method !== "POST") {
        return { status: 405, body: { error: "POST only" } };
      }
      return await handleExportPdf(req);
    }
```

- [ ] **Step 3: Update `docs/TECH_REQUIREMENTS.md` §30.3 and `docs/TECH_REQUIREMENTS_zh.md`**

In `docs/TECH_REQUIREMENTS.md`, change the `POST /api/export-pdf` table row (originally line 2800):

```markdown
| `POST /api/export-pdf` | Generates the combined catalog PDF via headless Chromium and streams it back as `application/pdf`. Body: `{ locale, priceStrategy, categories, statuses }` — `priceStrategy` is one of `lowest`/`highest`/`pickup`/`shipping`/`average`; `statuses` any subset of the 5 `Status` values; `categories` any list of category slugs. `400` with `{ error }` when the body fails validation (bad `priceStrategy`/`status`/unlisted `locale`), there are no eligible items after filtering, or Chromium isn't installed. |
```

In `docs/TECH_REQUIREMENTS_zh.md`, change the matching row (originally line 2494):

```markdown
| `POST /api/export-pdf` | 通过 headless Chromium 生成合并目录 PDF 并以 `application/pdf` 形式返回。请求体：`{ locale, priceStrategy, categories, statuses }` —— `priceStrategy` 为 `lowest`/`highest`/`pickup`/`shipping`/`average` 之一；`statuses` 可为 5 种 `Status` 值的任意子集；`categories` 为任意分类 slug 列表。当请求体校验失败（`priceStrategy`/`status` 非法或 `locale` 不在可用语言列表中）、过滤后没有可导出商品、或未安装 Chromium 时返回 `400` 及 `{ error }`。 |
```

- [ ] **Step 4: Type-check and manual smoke check**

Run: `pnpm tsc --noEmit`
Expected: no errors.

Run: `pnpm studio`, open the browser devtools Network tab, and (once Task 9 ships the real dialog) confirm a `POST /api/export-pdf` with a body like `{"locale":"en","priceStrategy":"average","categories":["electronics"],"statuses":["available"]}` returns `200` with a PDF, and a body with `"priceStrategy":"bogus"` returns `400`. (If run before Task 9 lands, this can be done with `curl` directly against the dev server instead — not required to pass this task, just to confirm the schema in isolation once convenient.)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/studioApi.ts docs/TECH_REQUIREMENTS.md docs/TECH_REQUIREMENTS_zh.md
git commit -m "feat(studio-api): validate and thread PdfExportOptions through POST /api/export-pdf"
```

---

### Task 7: `studio/src/api.ts` — `exportCatalogPdf(options)`

**Files:**
- Modify: `studio/src/api.ts`
- Test: `studio/src/api.test.ts`

**Interfaces:**
- Consumes: `PdfExportOptions` type from Task 5, re-exported here for browser-side consumers (type-only import — `scripts/lib/pdfCatalog/generate.ts` pulls in Node's `fs`/`path`, which must never reach the browser bundle, matching this file's existing `import type {...} from "../../scripts/lib/..."` convention).
- Produces: `export async function exportCatalogPdf(options: PdfExportOptions): Promise<Blob>` (was zero-arg) — consumed by Task 9 (`ExportPdfDialog.tsx`).

- [ ] **Step 1: Update the failing tests first**

In `studio/src/api.test.ts`, replace the `exportCatalogPdf` describe block:

```ts
describe("exportCatalogPdf", () => {
  const options = {
    locale: "en",
    priceStrategy: "average" as const,
    categories: ["electronics"],
    statuses: ["available" as const],
  };

  it("returns the response body as a Blob on success and sends the options as the JSON body", async () => {
    const fakeBlob = new Blob(["%PDF-fake"], { type: "application/pdf" });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      blob: async () => fakeBlob,
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    const result = await exportCatalogPdf(options);
    expect(result).toBe(fakeBlob);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/export-pdf",
      expect.objectContaining({ method: "POST", body: JSON.stringify(options) }),
    );
    vi.unstubAllGlobals();
  });

  it("throws the server's error message on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: async () => ({ error: "No public-visible items to export." }),
      })) as unknown as typeof fetch,
    );
    await expect(exportCatalogPdf(options)).rejects.toThrow("No public-visible items to export.");
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter studio vitest run src/api.test.ts` (or `cd studio && pnpm vitest run src/api.test.ts`, matching however this repo already invokes Studio's test suite)
Expected: FAIL — `exportCatalogPdf()` called with 0 args where 1 is required (TypeScript), or the body assertion fails against the old hardcoded `"{}"`.

- [ ] **Step 3: Update `exportCatalogPdf`**

In `studio/src/api.ts`, add to the type-only import block at the top (after the existing `import type { BulkStatusResult, ... } from "../../scripts/lib/studioApi";` line):

```ts
import type { PdfExportOptions } from "../../scripts/lib/pdfCatalog/generate";

export type { PdfExportOptions };
```

Replace `exportCatalogPdf` (originally lines 405-416):

```ts
export async function exportCatalogPdf(options: PdfExportOptions): Promise<Blob> {
  const res = await fetch("/api/export-pdf", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(options),
  });
  if (!res.ok) {
    const body = await readJsonBody(res);
    throw new Error(errorMessage(body, `PDF export failed with ${res.status} ${res.statusText}`));
  }
  return res.blob();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd studio && pnpm vitest run src/api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add studio/src/api.ts studio/src/api.test.ts
git commit -m "feat(studio-client): send PdfExportOptions in exportCatalogPdf"
```

---

### Task 8: Studio's own i18n — new dialog-control strings

**Files:**
- Modify: `studio/src/i18n/strings.en.ts`
- Modify: `studio/src/i18n/strings.zh.ts`

**Interfaces:**
- Produces: 8 new `StudioKey`s (`exportPdf.language`, `exportPdf.priceStrategy`, `exportPdf.strategy.lowest/highest/pickup/shipping/average`, `exportPdf.categories`) — consumed by Task 9's `ExportPdfDialog.tsx`. `exportPdf.statuses` label is also added; status *checkbox* labels reuse the pre-existing `filter.status.*` keys, added by neither this task nor Task 9.

This is Studio's own separate i18n system (dialog chrome, e.g. the "Language" dropdown's own label) — distinct from the site's `UIStrings`/`getTranslationsForLocale` work in Task 3, which is what actually gets baked into the generated PDF's content.

- [ ] **Step 1: Add the new keys to `strings.en.ts`**

In `studio/src/i18n/strings.en.ts`, replace the existing "Export PDF dialog" block:

```ts
  // ── Export PDF dialog ────────────────────────────────────────────
  "exportPdf.title": "Export catalog PDF",
  "exportPdf.summary": "{itemCount} items across {categoryCount} categories will be included.",
  "exportPdf.summaryEmpty": "No public-visible items to export yet.",
  "exportPdf.generate": "Generate & Download",
  "exportPdf.generating": "Generating…",
  "exportPdf.done": "Downloaded {filename}",
  "exportPdf.close": "Close",
```

with:

```ts
  // ── Export PDF dialog ────────────────────────────────────────────
  "exportPdf.title": "Export catalog PDF",
  "exportPdf.language": "Language",
  "exportPdf.priceStrategy": "Highlighted price",
  "exportPdf.strategy.lowest": "Lowest price",
  "exportPdf.strategy.highest": "Highest price",
  "exportPdf.strategy.pickup": "Local pickup price",
  "exportPdf.strategy.shipping": "Shipping price",
  "exportPdf.strategy.average": "Average of lowest & highest",
  "exportPdf.categories": "Categories",
  "exportPdf.statuses": "Statuses",
  "exportPdf.summary": "{itemCount} items across {categoryCount} categories will be included.",
  "exportPdf.summaryEmpty": "No public-visible items to export yet.",
  "exportPdf.generate": "Generate & Download",
  "exportPdf.generating": "Generating…",
  "exportPdf.done": "Downloaded {filename}",
  "exportPdf.close": "Close",
```

- [ ] **Step 2: Add the matching keys to `strings.zh.ts`**

In `studio/src/i18n/strings.zh.ts`, replace the existing Export PDF block:

```ts
  "exportPdf.title": "导出目录 PDF",
  "exportPdf.summary": "共 {itemCount} 件商品、{categoryCount} 个分类将被包含。",
  "exportPdf.summaryEmpty": "目前没有可导出的公开商品。",
  "exportPdf.generate": "生成并下载",
  "exportPdf.generating": "正在生成…",
  "exportPdf.done": "已下载 {filename}",
  "exportPdf.close": "关闭",
```

with:

```ts
  "exportPdf.title": "导出目录 PDF",
  "exportPdf.language": "语言",
  "exportPdf.priceStrategy": "高亮价格",
  "exportPdf.strategy.lowest": "最低价",
  "exportPdf.strategy.highest": "最高价",
  "exportPdf.strategy.pickup": "本地自取价",
  "exportPdf.strategy.shipping": "邮寄价",
  "exportPdf.strategy.average": "最低价与最高价平均",
  "exportPdf.categories": "分类",
  "exportPdf.statuses": "状态",
  "exportPdf.summary": "共 {itemCount} 件商品、{categoryCount} 个分类将被包含。",
  "exportPdf.summaryEmpty": "目前没有可导出的公开商品。",
  "exportPdf.generate": "生成并下载",
  "exportPdf.generating": "正在生成…",
  "exportPdf.done": "已下载 {filename}",
  "exportPdf.close": "关闭",
```

- [ ] **Step 3: Run the existing Studio i18n test suite (no new tests needed — these are additive dictionary entries, not new resolution logic)**

Run: `cd studio && pnpm vitest run src/i18n`
Expected: PASS — `resolve.test.ts` and `StudioI18n.test.tsx` exercise the merge mechanism generically and don't enumerate every key, so they need no changes for this purely additive edit.

- [ ] **Step 4: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors (confirms `StudioKey = keyof typeof EN` picked up the new keys and `strings.zh.ts`'s `Partial<StudioStrings>` values type-check against them).

- [ ] **Step 5: Commit**

```bash
git add studio/src/i18n/strings.en.ts studio/src/i18n/strings.zh.ts
git commit -m "feat(studio-i18n): add export-pdf dialog control strings"
```

---

### Task 9: `ExportPdfDialog.tsx` — language, price-strategy, category, and status controls

**Files:**
- Modify: `studio/src/panes/ExportPdfDialog.tsx`
- Modify: `studio/src/App.tsx`
- Modify: `studio/src/tokens.css`
- Modify: `docs/DESIGN.md`, `docs/DESIGN_zh.md`, `docs/CURRENT_FUNCTIONALITY.md`, `docs/CURRENT_FUNCTIONALITY_zh.md`
- Test: `studio/src/panes/ExportPdfDialog.test.tsx`

**Interfaces:**
- Consumes: `exportCatalogPdf`, `PdfExportOptions` from Task 7 (`../api`); `filter.status.*` and `exportPdf.*` `StudioKey`s from Task 8.
- Produces: `ExportPdfDialog({ items, categorySlugs, availableLocales, defaultLocale, onClose })` (was `{ items, onClose }`) — this is the plan's terminal, user-facing task.

- [ ] **Step 1: Update the failing tests first**

Replace `studio/src/panes/ExportPdfDialog.test.tsx` in full:

```tsx
// studio/src/panes/ExportPdfDialog.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithStudioI18n } from "../i18n/StudioI18n";
import { ExportPdfDialog } from "./ExportPdfDialog";
import type { StudioItem } from "../api";
import * as api from "../api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeItem(overrides: Partial<StudioItem> = {}): StudioItem {
  return {
    id: "electronics/desk-lamp",
    categorySlug: "electronics",
    itemSlug: "desk-lamp",
    name: "Desk Lamp",
    status: "available",
    currency: "USD",
    lowestTierAmount: 20,
    imageCount: 1,
    coverImage: null,
    localizedNames: { en: "Desk Lamp" },
    tags: [],
    listedDate: "2026-01-01",
    ...overrides,
  };
}

const DEFAULT_PROPS = {
  categorySlugs: ["electronics", "books"],
  availableLocales: ["en", "zh"],
  defaultLocale: "en",
};

function renderDialog(
  items: StudioItem[],
  overrides: Partial<typeof DEFAULT_PROPS> = {},
  onClose = vi.fn(),
) {
  return renderWithStudioI18n(
    <ExportPdfDialog items={items} onClose={onClose} {...DEFAULT_PROPS} {...overrides} />,
  );
}

describe("ExportPdfDialog", () => {
  it("shows the eligible item and category count with the default status selection", () => {
    renderDialog([
      makeItem({ id: "a", categorySlug: "electronics", status: "available" }),
      makeItem({ id: "b", categorySlug: "books", status: "sold" }),
    ]);
    // "sold" is unchecked by default, so only the electronics item counts.
    expect(screen.getByText(/1 items across 1 categories/)).toBeTruthy();
  });

  it("recomputes the summary when a status checkbox is toggled", async () => {
    renderDialog([
      makeItem({ id: "a", categorySlug: "electronics", status: "available" }),
      makeItem({ id: "b", categorySlug: "books", status: "sold" }),
    ]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: /Sold/ }));
    expect(screen.getByText(/2 items across 2 categories/)).toBeTruthy();
  });

  it("recomputes the summary when a category checkbox is unchecked", async () => {
    renderDialog([
      makeItem({ id: "a", categorySlug: "electronics", status: "available" }),
      makeItem({ id: "b", categorySlug: "books", status: "available" }),
    ]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: "books" }));
    expect(screen.getByText(/1 items across 1 categories/)).toBeTruthy();
  });

  it("defaults the language select to defaultLocale and the price strategy to average", () => {
    renderDialog([makeItem()]);
    expect((screen.getByLabelText("Language") as HTMLSelectElement).value).toBe("en");
    expect((screen.getByLabelText("Highlighted price") as HTMLSelectElement).value).toBe("average");
  });

  it("sends the selected options as the request body", async () => {
    const blob = new Blob(["%PDF"], { type: "application/pdf" });
    const spy = vi.spyOn(api, "exportCatalogPdf").mockResolvedValue(blob);
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:fake"), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    renderDialog([makeItem({ categorySlug: "electronics", status: "available" })]);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Language"), "zh");
    await user.selectOptions(screen.getByLabelText("Highlighted price"), "lowest");
    await user.click(screen.getByRole("button", { name: /Generate & Download/ }));

    expect(spy).toHaveBeenCalledWith({
      locale: "zh",
      priceStrategy: "lowest",
      categories: ["electronics", "books"],
      statuses: ["available", "pending", "reserved"],
    });
  });

  it("disables the generate button while busy and re-enables after success", async () => {
    const blob = new Blob(["%PDF"], { type: "application/pdf" });
    vi.spyOn(api, "exportCatalogPdf").mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(blob), 10)),
    );
    // jsdom has no real download machinery; createObjectURL/revokeObjectURL are stubbed
    // so the click-triggered download path does not throw. jsdom also logs a
    // "Not implemented: navigation" error when an <a> with an unrecognized
    // blob: href is clicked, so the click itself is stubbed too — the
    // component's use of it is still exercised, just not jsdom's navigation.
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:fake"), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    renderDialog([makeItem()]);
    const user = userEvent.setup();
    const button = screen.getByRole("button", { name: /Generate & Download/ });
    await user.click(button);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await screen.findByText(/Downloaded/);
  });

  it("shows the server's error message on failure", async () => {
    vi.spyOn(api, "exportCatalogPdf").mockRejectedValue(new Error("No public-visible items to export."));
    renderDialog([makeItem()]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Generate & Download/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("No public-visible items to export.");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd studio && pnpm vitest run src/panes/ExportPdfDialog.test.tsx`
Expected: FAIL — missing required props (`categorySlugs`, `availableLocales`, `defaultLocale`), missing form controls.

- [ ] **Step 3: Rewrite `ExportPdfDialog.tsx`**

Replace `studio/src/panes/ExportPdfDialog.tsx` in full:

```tsx
// studio/src/panes/ExportPdfDialog.tsx
import { useMemo, useState } from "react";
import { exportCatalogPdf, type PdfExportOptions, type StudioItem } from "../api";
import { Button } from "../components/Button";
import { useDialogBehavior } from "../components/useDialogBehavior";
import { useStudioT } from "../i18n/StudioI18n";
import type { StudioKey } from "../i18n/types";

type PriceStrategyValue = PdfExportOptions["priceStrategy"];
type StatusValue = PdfExportOptions["statuses"][number];

const STATUS_OPTIONS: Array<{ value: StatusValue; labelKey: StudioKey }> = [
  { value: "available", labelKey: "filter.status.available" },
  { value: "pending", labelKey: "filter.status.pending" },
  { value: "reserved", labelKey: "filter.status.reserved" },
  { value: "sold", labelKey: "filter.status.sold" },
  { value: "draft", labelKey: "filter.status.draft" },
];
const DEFAULT_STATUSES: StatusValue[] = ["available", "pending", "reserved"];

const PRICE_STRATEGY_OPTIONS: Array<{ value: PriceStrategyValue; labelKey: StudioKey }> = [
  { value: "average", labelKey: "exportPdf.strategy.average" },
  { value: "lowest", labelKey: "exportPdf.strategy.lowest" },
  { value: "highest", labelKey: "exportPdf.strategy.highest" },
  { value: "pickup", labelKey: "exportPdf.strategy.pickup" },
  { value: "shipping", labelKey: "exportPdf.strategy.shipping" },
];

export function ExportPdfDialog({
  items,
  categorySlugs,
  availableLocales,
  defaultLocale,
  onClose,
}: {
  items: StudioItem[];
  categorySlugs: string[];
  availableLocales: string[];
  defaultLocale: string;
  onClose: () => void;
}) {
  const { t } = useStudioT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadedFilename, setDownloadedFilename] = useState<string | null>(null);

  const [locale, setLocale] = useState(defaultLocale);
  const [priceStrategy, setPriceStrategy] = useState<PriceStrategyValue>("average");
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    () => new Set(categorySlugs),
  );
  const [selectedStatuses, setSelectedStatuses] = useState<Set<StatusValue>>(
    () => new Set(DEFAULT_STATUSES),
  );

  const dialogRef = useDialogBehavior(onClose);

  const eligible = useMemo(
    () =>
      items.filter(
        (i) =>
          selectedStatuses.has(i.status as StatusValue) && selectedCategories.has(i.categorySlug),
      ),
    [items, selectedStatuses, selectedCategories],
  );
  const categoryCount = new Set(eligible.map((i) => i.categorySlug)).size;

  function toggleCategory(slug: string, checked: boolean) {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (checked) next.add(slug);
      else next.delete(slug);
      return next;
    });
  }

  function toggleStatus(status: StatusValue, checked: boolean) {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (checked) next.add(status);
      else next.delete(status);
      return next;
    });
  }

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const options: PdfExportOptions = {
        locale,
        priceStrategy,
        categories: categorySlugs.filter((slug) => selectedCategories.has(slug)),
        statuses: STATUS_OPTIONS.map((s) => s.value).filter((status) => selectedStatuses.has(status)),
      };
      const blob = await exportCatalogPdf(options);
      const filename = `usedexchange-catalog-${new Date().toISOString().slice(0, 10)}.pdf`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      setDownloadedFilename(filename);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("exportPdf.title")}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{t("exportPdf.title")}</h2>
        {error !== null && (
          <p role="alert" className="alert-error">
            {error}
          </p>
        )}

        <label className="field">
          <span className="field-label">{t("exportPdf.language")}</span>
          <select value={locale} disabled={busy} onChange={(e) => setLocale(e.target.value)}>
            {availableLocales.map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">{t("exportPdf.priceStrategy")}</span>
          <select
            value={priceStrategy}
            disabled={busy}
            onChange={(e) => setPriceStrategy(e.target.value as PriceStrategyValue)}
          >
            {PRICE_STRATEGY_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {t(s.labelKey)}
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <span className="field-label">{t("exportPdf.categories")}</span>
          <div className="checkbox-group">
            {categorySlugs.map((slug) => (
              <label key={slug} className="checkbox-group-item">
                <input
                  type="checkbox"
                  checked={selectedCategories.has(slug)}
                  disabled={busy}
                  onChange={(e) => toggleCategory(slug, e.target.checked)}
                />
                {slug}
              </label>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">{t("exportPdf.statuses")}</span>
          <div className="checkbox-group">
            {STATUS_OPTIONS.map((s) => (
              <label key={s.value} className="checkbox-group-item">
                <input
                  type="checkbox"
                  checked={selectedStatuses.has(s.value)}
                  disabled={busy}
                  onChange={(e) => toggleStatus(s.value, e.target.checked)}
                />
                {t(s.labelKey)}
              </label>
            ))}
          </div>
        </div>

        <p>
          {eligible.length === 0
            ? t("exportPdf.summaryEmpty")
            : t("exportPdf.summary", { itemCount: eligible.length, categoryCount })}
        </p>
        {downloadedFilename !== null && <p>{t("exportPdf.done", { filename: downloadedFilename })}</p>}
        <div className="dialog-actions">
          <Button
            variant="primary"
            disabled={busy || eligible.length === 0}
            onClick={() => void generate()}
          >
            {busy ? t("exportPdf.generating") : t("exportPdf.generate")}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t("exportPdf.close")}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Thread the new props through `App.tsx`**

In `studio/src/App.tsx`, add a new state variable alongside `availableLocales` (originally line 42):

```tsx
  const [availableLocales, setAvailableLocales] = useState<string[]>(["en"]);
  const [siteDefaultLocale, setSiteDefaultLocale] = useState<string>("en");
```

In `refresh` (originally lines 70-75), set it from the fetched `defaultLocale`:

```tsx
    const [{ items, defaultLocale, availableLocales: al, studioTranslations: st }, categories] =
      await Promise.all([fetchItems(), fetchCategories().catch(() => null)]);
    setItems(items);
    setAvailableLocales(al);
    setSiteDefaultLocale(defaultLocale);
    setStudioTranslations(st);
    setDisplayLocale((prev) => (al.includes(prev) ? prev : defaultLocale));
```

Pass it down to `StudioChrome` (originally lines 101-114):

```tsx
  return (
    <StudioI18nProvider locale={displayLocale} overrides={studioTranslations}>
      <StudioChrome
        items={items}
        error={error}
        setError={setError}
        availableLocales={availableLocales}
        siteDefaultLocale={siteDefaultLocale}
        displayLocale={displayLocale}
        setDisplayLocale={setDisplayLocale}
        refresh={refresh}
        categorySlugs={categorySlugs}
      />
    </StudioI18nProvider>
  );
```

Add it to `StudioChrome`'s props (originally lines 117-135):

```tsx
function StudioChrome({
  items,
  error,
  setError,
  availableLocales,
  siteDefaultLocale,
  displayLocale,
  setDisplayLocale,
  refresh,
  categorySlugs,
}: {
  items: StudioItem[];
  error: string | null;
  setError: (error: string | null) => void;
  availableLocales: string[];
  siteDefaultLocale: string;
  displayLocale: string;
  setDisplayLocale: (locale: string) => void;
  refresh: () => Promise<void>;
  categorySlugs: string[];
}) {
```

Pass the new props to `ExportPdfDialog` (originally line 448):

```tsx
      {showExportPdf && (
        <ExportPdfDialog
          items={items}
          categorySlugs={categorySlugs}
          availableLocales={availableLocales}
          defaultLocale={siteDefaultLocale}
          onClose={() => setShowExportPdf(false)}
        />
      )}
```

- [ ] **Step 5: Add checkbox-group CSS**

In `studio/src/tokens.css`, add after the existing `.field-hint` block (originally lines 732-735):

```css
.checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1rem;
}

.checkbox-group-item {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: var(--step-0);
  color: var(--ink);
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd studio && pnpm vitest run src/panes/ExportPdfDialog.test.tsx src/App.test.tsx`
Expected: PASS. (If `App.test.tsx` does not exist or does not cover `ExportPdfDialog` wiring, this is fine — the dialog's own tests are the ones that matter here; do not create a new `App.test.tsx` file for this, out of scope.)

- [ ] **Step 7: Update `docs/DESIGN.md` §22 and `docs/DESIGN_zh.md`**

In `docs/DESIGN.md`, replace the "Catalog PDF export" paragraph (originally line 2397):

```markdown
The header's **Export PDF** button opens a dialog that generates a single combined PDF catalog of the selected public-visible items: a cover page, a clickable table of contents grouped by category, a divider per category, and one page per item with its resolved price, photos, specs, and a link back to its live page. Rendered via headless Chromium (Playwright) from a standalone print template — no `next dev` server required. Table-of-contents entries are clickable in-PDF jump links; they do not show literal page numbers next to each title (Chromium's print-to-PDF does not support CSS `target-counter()`), though every page's footer does show a real "Page N of M". Requires a one-time `npx playwright install chromium`. Three controls precede generation: **Language** (any of `siteConfig.i18n.availableLocales`) drives both the item name/description (via `getLocalizedField`) and all of the PDF's own chrome text (via `getTranslationsForLocale`, TECH_REQUIREMENTS.md §22.8) — category `displayName`/`description` are not locale-suffixed anywhere in this codebase and stay in whatever language the seller wrote them in, regardless of the PDF's language. **Highlighted price** (`lowest`/`highest`/`pickup`/`shipping`, shared with `pnpm fb-export`, or a new `average` — the literal midpoint of an item's lowest and highest tier amounts) selects which price is the item's default; items with `show_tiers: true` still render the full tier table (v1 behavior) — for every strategy except `average` the matching row is highlighted, and for `average` (which matches no real tier) a small banner above the table shows the computed midpoint instead. **Categories** and **Statuses** (all 5 — `available`/`pending`/`reserved`/`sold`/`draft`, not just the 3 public-visible ones) are seller-checked filters; `reserved_for` is never read regardless of which statuses are included (Iron Rule 4 is enforced upstream — `Item` never carries the field at all).
```

In `docs/DESIGN_zh.md`, replace the matching paragraph (originally line 2163):

```markdown
顶部的 **导出 PDF** 按钮会打开一个对话框，生成一份合并的 PDF 目录，涵盖所选的公开可见商品：封面页、按分类分组的可点击目录、每个分类的分隔页，以及每件商品单独一页（含已解析价格、照片、规格，以及指向该商品在线页面的链接）。通过 Headless Chromium（Playwright）基于独立的打印模板渲染，无需运行 `next dev` 服务器。目录中的条目是可点击的 PDF 内部跳转链接，条目旁不会显示具体页码（Chromium 的打印为 PDF 功能不支持 CSS 的 `target-counter()`），但每页页脚都会显示真实的"第 N 页，共 M 页"。首次使用需要执行一次 `npx playwright install chromium`。生成前有三项设置：**语言**（`siteConfig.i18n.availableLocales` 中的任一语言）同时驱动商品名称/描述（通过 `getLocalizedField`）以及整份 PDF 自身的界面文字（通过 `getTranslationsForLocale`，见 TECH_REQUIREMENTS.md §22.8）——分类的 `displayName`/`description` 在整个代码库中都没有对应语系字段，因此无论 PDF 语言为何，分类名称都会维持卖家原本填写的语言。**高亮价格**（`lowest`/`highest`/`pickup`/`shipping`，与 `pnpm fb-export` 共用，或新增的 `average` —— 该商品最低与最高价档位的字面中位数）决定哪个价格作为该商品的默认价格；`show_tiers: true` 的商品仍会显示完整价格档位表（v1 行为）——除 `average` 外的每种策略都会高亮对应的那一行，而 `average`（因为不对应任何真实档位）会在表格上方以一行横幅显示计算出的中位数。**分类**与**状态**（全部 5 种——`available`/`pending`/`reserved`/`sold`/`draft`，不再只是原本公开可见的 3 种）皆为卖家勾选的筛选条件；无论勾选哪些状态，`reserved_for` 都不会被读取（Iron Rule 4 在上游即已强制执行——`Item` 型别从未携带该欄位）。
```

- [ ] **Step 8: Update `docs/CURRENT_FUNCTIONALITY.md` and `docs/CURRENT_FUNCTIONALITY_zh.md`**

In `docs/CURRENT_FUNCTIONALITY.md`, replace the "Catalog PDF export" table row (originally line 382):

```markdown
| Catalog PDF export | Generate and download a combined PDF catalog directly from Studio (cover page, table of contents, per-category sections, one page per item with a live link), with seller-chosen language, highlighted-price strategy (lowest/highest/pickup/shipping/average), and category/status filters (all 5 statuses selectable, not just the 3 public-visible ones) |
```

In `docs/CURRENT_FUNCTIONALITY_zh.md`, replace the matching row (originally line 382):

```markdown
| 目录 PDF 导出 | 直接在 Studio 中生成并下载一份合并的 PDF 目录（封面页、目录、按分类分节、每件商品一页并附带在线链接），可由卖家选择语言、高亮价格策略（最低价/最高价/自取价/邮寄价/平均价），以及分类与状态筛选（全部 5 种状态皆可勾选，不再只是原本公开可见的 3 种） |
```

- [ ] **Step 9: Full local verification**

Run: `pnpm tsc --noEmit && pnpm vitest run && cd studio && pnpm tsc --noEmit && pnpm vitest run`
Expected: all type-checks and test suites pass across both the site and Studio.

Then run: `pnpm studio`, click "Export PDF", confirm the dialog shows Language/Highlighted price selects and Categories/Statuses checkboxes, toggle a status checkbox and confirm the item count updates, click "Generate & Download" and confirm a PDF downloads. Open the PDF and confirm the footer shows "Page N of M" and, for an item with `show_tiers: true` and the "average" strategy selected, confirm the price-highlight banner appears above the tier table.

- [ ] **Step 10: Commit**

```bash
git add studio/src/panes/ExportPdfDialog.tsx studio/src/panes/ExportPdfDialog.test.tsx studio/src/App.tsx studio/src/tokens.css docs/DESIGN.md docs/DESIGN_zh.md docs/CURRENT_FUNCTIONALITY.md docs/CURRENT_FUNCTIONALITY_zh.md
git commit -m "feat(studio): add language, price-strategy, and category/status controls to PDF export dialog"
```

---

## Plan Self-Review Notes

**Spec coverage:** §3.1 (options shape) → Tasks 5, 6, 7, 9. §3.2 (price strategy, incl. the `average` banner) → Tasks 1, 2, 4. §3.3 (localization, incl. the check-config/configDefaults correction) → Tasks 3, 4, 5. §3.4 (filters + dialog defaults) → Task 9. §3.5 (server validation) → Task 6. §4 (architecture) → Tasks 5-9 collectively. §5 (testing) → a test step in every task. §6 (docs) → Tasks 3 (DESIGN §12), 6 (TECH_REQUIREMENTS §30.3), 9 (DESIGN §22, CURRENT_FUNCTIONALITY). Out-of-scope items (no category-name localization, no persisted last-used options, unchanged fb-export default) are respected by construction — no task attempts them.

**Placeholder scan:** every step above contains literal code, exact file text, or a runnable command — no "TBD"/"handle appropriately"/"similar to Task N" placeholders.

**Type consistency check:** `PriceStrategy` (Task 1) flows unchanged into `template.ts` (Task 4), `generate.ts`'s `PdfExportOptions.priceStrategy` (Task 5), `studioApi.ts`'s `exportPdfBodySchema` (Task 6, same 5 literals), `api.ts`'s re-exported `PdfExportOptions` (Task 7), and `ExportPdfDialog.tsx`'s derived `PriceStrategyValue = PdfExportOptions["priceStrategy"]` (Task 9) — never re-declared as an independent, driftable union past Task 1. Same check for `Status`/`StatusValue`. `resolvePriceByStrategy`'s `ResolvedStrategyPrice` shape (`{ amount, tier }`) is consumed identically in `buildPriceHtml` (Task 4) and matches the test assertions written in Task 1. `groupEligibleItems`'s 5-argument signature (Task 5) matches every call site rewritten in that same task's test file — no stale 2-argument calls remain.
