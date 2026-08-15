# Seller Studio: PDF Export — Language, Price Strategy & Category/Status Filters

**Date:** 2026-08-15
**Status:** Approved design, pending implementation plan
**Approach:** Thread a new `PdfExportOptions` object end-to-end (dialog → POST body → `generateCatalogPdf()`), reusing the site's existing i18n system for localization and extracting `pnpm fb-export`'s price-strategy logic into a shared utility.
**Builds on:** `docs/superpowers/specs/2026-08-13-studio-catalog-pdf-export-design.md` (PR #11, merged to `develop`) — that spec covers the base PDF pipeline (`scripts/lib/pdfCatalog/{template,generate}.ts`, `studio/src/panes/ExportPdfDialog.tsx`, `POST /api/export-pdf`) and is not re-litigated here except where this feature changes it.

## 1. Problem

The shipped PDF export always renders in English, always uses a fixed fallback price-tier rule (open-ended tier, else highest amount), and always includes exactly `{available, pending, reserved}` items across every category. Sellers with a bilingual audience, a preferred "headline" price, or a wish to hand out a partial catalog (one category, or including sold items for an archive) have no way to express that. `pnpm fb-export` already solved price-strategy selection and category/item selection interactively for its own CSV output — this feature brings equivalent choices to the PDF dialog and DRYs the price-strategy logic so both tools share one implementation.

Key findings from exploration (see also the base spec's §1):

- The site has **two separate, non-overlapping i18n systems**. The site's own (`lib/i18n/getTranslations.ts`, `components/i18n/useT.ts`, `UIStrings` in `lib/config/types.ts`, `content/config.ts`'s `i18n.translations`) governs page/PDF *content* language. Seller Studio's own (`studio/src/i18n/{strings.en,strings.zh,resolve,StudioI18n}.ts`, `useStudioT()`, dot-namespaced `StudioKey`s) governs only Studio's *own UI chrome* (buttons, dialog labels). This feature touches both, for different things — the dialog's own controls (language dropdown, price-strategy select, checkboxes) use Studio's i18n; the *generated PDF's* content and chrome (TOC heading, footer, "View Live Listing", price labels) use the site's i18n. They must not be conflated.
- `getTranslations()` (`lib/i18n/getTranslations.ts:12`) takes no arguments and always resolves `siteConfig.i18n.defaultLocale` — appropriate for Server Components (which render once, before the visitor's locale is known) but wrong for this feature, where the seller explicitly picks a locale per PDF generation. `useT()` (`components/i18n/useT.ts:8`) has the right merge logic (`{...EN_FALLBACK, ...defaultDict, ...activeDict}`) but is a React hook reading `useLocale()` context, unusable from a Node script.
- Item content localization already exists and only covers two fields: `Item.nameZh`/`Item.descriptionZh` (`lib/content/types.ts:102-104`), resolved via `getLocalizedField(item, field, locale)` (`lib/utils/i18n.ts:36`), which is driven by a static `LOCALE_FIELD_MAP` (`lib/utils/i18n.ts:21`) — currently only `{ zh: { name: "nameZh", description: "descriptionZh" } }`. There is no generic per-locale field system; adding a third locale's item-content translation would require both a new `Item.name<Locale>` field and a new `LOCALE_FIELD_MAP` entry — out of scope here.
- `siteConfig.i18n.availableLocales` (`content/config.ts`) is the seller-configured list of enabled locales and is already computed server-side and sent to the Studio client (`scripts/lib/studioApi.ts:1355`, and used to build each `StudioItem.localizedNames` at `scripts/lib/studioApi.ts:202`). This feature's language dropdown reads this list directly — no new hardcoded locale list, and no scope decision about "which locales to support": whatever the seller has already configured is what's offered.
- `UIStrings` (`lib/config/types.ts:148`) is a flat, fully-required interface — "every key must have a value in the default locale's translations entry" (comment at line 145). The backward-compatibility mechanism for *this* config type is not `scripts/lib/configDefaults.ts` injection (used for other `SiteConfig`/`UIConfig` fields per Iron Rule 8) — it's the `{...EN_FALLBACK, ...siteDict}` merge itself: `EN_FALLBACK` (`lib/i18n/translations.ts`) ships with the framework code and always has every key, so a downstream site's `content/config.ts` missing a newly-added key still works correctly after `pnpm update-site`, with no migration step required.
- `pnpm fb-export`'s price-strategy logic (`scripts/export-facebook.ts:71-92`) is a private, unexported `PriceStrategy` type and `resolvePrice()` function returning `number | null`. `lib/utils/pricing.ts`'s `resolveItemPrice()` is the site's parallel "which tier applies" logic (distance-based, not strategy-based) and already has the right shape for this: no `"use client"`, importable from both server and client code (Iron Rule 6), returns a `PriceTier`.
- `scripts/lib/pdfCatalog/template.ts`'s `buildPriceHtml()` currently hardcodes the "which row is highlighted" rule to `resolveItemPrice(price, { source: "fallback" })` and duplicates several strings that already exist in `UIStrings` (`CONDITION_LABELS`, "Contact for price", "OBO", the tier-table column headers) under different English wording.
- `Item` never carries `reserved_for` at all — Zod strips it at parse time (`lib/content/schema.ts:183`), and `lib/content/types.ts:40` documents this explicitly. Widening which statuses are included changes *which items* appear, never what fields are available on them — Iron Rule 4 is satisfied structurally, not by new filtering logic in this feature.

## 2. Scope

### In scope

1. **Language** — a locale selector in the dialog. Both the exported item content (name/description) and the PDF's own chrome text (TOC heading, footer, "View Live Listing", price labels, status/condition badges, specs-table labels) follow the selected locale.
2. **Price strategy** — a selector with 5 options: `lowest`, `highest`, `pickup`, `shipping` (from `pnpm fb-export`, now shared) plus a new `average` strategy ((lowest + highest) ÷ 2, a literal computed number — see §3.2 for how this interacts with the full tier table). The choice changes which price is the item's *highlighted default*; items with `show_tiers: true` still render their full tier table unchanged (v1 behavior, `buildPriceHtml`'s table branch).
3. **Category + status filters** — checkboxes for which categories and which of all 5 statuses (`available`, `pending`, `reserved`, `sold`, `draft` — not just the 3 currently hardcoded) to include.
4. DRY extraction of price-strategy resolution into `lib/utils/pricing.ts`, shared by `scripts/export-facebook.ts` and `scripts/lib/pdfCatalog/`.
5. A new `average` option added to `pnpm fb-export`'s own interactive CLI menu (Step 2), using the same shared resolver, so both tools offer identical strategies. `fb-export`'s own default selection is unchanged (`lowest`, still `[1]`, still the recommended default in its CLI).

### Out of scope (YAGNI)

- A generic N-locale item-content translation system. This feature uses whatever locales `LOCALE_FIELD_MAP` + `siteConfig.i18n.availableLocales` already support (today: `en`, `zh`). Adding a third locale's item-content fields (e.g. `nameJa`) is unrelated future work, not gated by anything built here.
- A shared `{}`-interpolation module for `UIStrings`. Only two new chrome strings need parameter substitution (`pdfCoverMeta`, `pdfGeneratedOn`, `pdfAveragePriceLabel`); a private helper local to `template.ts` covers it. Nothing else in the codebase needs general-purpose `UIStrings` interpolation yet.
- Per-locale PDF chrome word-order/pluralization correctness beyond simple `{token}` substitution. Composed sentences (footer "Page N of M", cover "N items across M categories") use fixed English word order with substituted numbers — the same limitation every other composed `UIStrings` sentence in this codebase already has (no ICU message format exists anywhere in the repo).
- Changing `fb-export`'s own default price strategy, or restructuring its CLI beyond adding one new numbered option.
- Any new `SiteConfig`/`UIConfig` fields. All three new controls are per-export-request choices (POST body), not persisted seller configuration.
- Server-side persistence of the seller's last-used export options. Each dialog open starts from the documented defaults (§3.4).
- **Category `displayName`/`description` localization.** `Category` (`lib/content/types.ts:111`) has no `displayNameZh`/`descriptionZh` fields — categories are English/single-locale everywhere in the codebase today, not just in the PDF pipeline. A `zh`-language export therefore still shows English category names in the TOC group headers and category-divider pages; only item name/description and all PDF chrome follow the selected locale. Adding per-locale category fields is a separate, unrelated feature.

## 3. Semantics

### 3.1 Options shape

```ts
// lib/utils/pricing.ts
export type PriceStrategy = "lowest" | "highest" | "pickup" | "shipping" | "average";

// scripts/lib/pdfCatalog/generate.ts
export type PdfExportOptions = {
  locale: string;
  priceStrategy: PriceStrategy;
  categories: string[];   // category slugs to include
  statuses: Status[];     // statuses to include
};
```

The dialog always sends its full, explicit checkbox state — there is no "empty array means all" sentinel on either `categories` or `statuses`. If a seller unchecks every status (or every category), the request legitimately matches zero items and falls into the existing `{ error: "No public-visible items to export." }` path (`generate.ts:91-93`) — no special-casing required.

### 3.2 Price strategy resolution

```ts
// lib/utils/pricing.ts — new, alongside resolveItemPrice
export type ResolvedStrategyPrice = { amount: number; tier: PriceTier | null };

export function resolvePriceByStrategy(
  tiers: PriceTier[],
  strategy: PriceStrategy,
): ResolvedStrategyPrice | null
```

- `lowest`: tier with the minimum `amount`.
- `highest`: tier with the maximum `amount`.
- `pickup`: minimum `amount` among tiers with `miles_max !== undefined`; falls back to `lowest` if none.
- `shipping`: minimum `amount` among tiers with `miles_max === undefined`; falls back to `highest` if none.
- `average`: **literal** `(min(amounts) + max(amounts)) / 2` — `tier: null`, since this generally matches no seller-authored tier. (Earlier design considered snapping to the closest real tier instead; confirmed with the user that the literal computed number is wanted even though it means no tier row corresponds to it.)

All four non-`average` strategies return `{ amount: tier.amount, tier }`. `resolvePriceByStrategy(tiers, strategy)` returns `null` only when `tiers` is empty (mirrors `resolveItemPrice`'s empty-tiers contract).

`scripts/export-facebook.ts` drops its private `PriceStrategy`/`resolvePrice`, importing `PriceStrategy` and calling `resolvePriceByStrategy(item.price.tiers, strategy)?.amount ?? null` at its one call site (`buildRow`, `export-facebook.ts:140`). Its Step 2 CLI menu (`stepPriceStrategy`, `export-facebook.ts:432`) gains a `[5] Average of lowest & highest` line; default remains `[1] lowest` on empty input.

`scripts/lib/pdfCatalog/template.ts`'s `buildPriceHtml(price, strategy)` (new `strategy` param, replacing the hardcoded `resolveItemPrice(price, { source: "fallback" })` call):

- **Headline-only** (`!price.show_tiers || tiers.length === 1`): unchanged shape — renders `resolved.amount`, with the optional `(label)` suffix from `resolved.tier?.label` (naturally absent for `average`).
- **Full tier table** (`show_tiers: true`, multiple tiers): row-highlighting (`.tier-default` class, matched by `t.label === resolved.tier.label && t.amount === resolved.tier.amount`) only applies when `resolved.tier !== null`. For `lowest`/`highest`/`pickup`/`shipping` this is identical to today's behavior (just driven by the new resolver instead of the old fallback rule). For `average`, since `resolved.tier` is `null`, **no row is highlighted** — instead, one new banner line renders above the table:
  ```html
  <p class="price-highlight">{pdfAveragePriceLabel with {amount} substituted}</p>
  ```
  This is the one new UI element `average` requires; the table itself (all rows, all columns) is otherwise byte-for-byte the v1 `buildPriceHtml` table output.

### 3.3 Localization

- **Item content**: `generate.ts`'s `toItemPdfView(item, locale)` (new `locale` param) resolves `name`/`description` via the existing `getLocalizedField(item, "name" | "description", locale)` instead of reading `item.name`/`item.description` directly.
- **PDF chrome**: one new function in `lib/i18n/getTranslations.ts`:
  ```ts
  export function getTranslationsForLocale(locale: string): UIStrings {
    const { translations, defaultLocale } = siteConfig.i18n;
    const defaultDict = translations[defaultLocale] ?? {};
    const activeDict = locale !== defaultLocale ? (translations[locale] ?? {}) : {};
    return { ...EN_FALLBACK, ...defaultDict, ...activeDict };
  }
  ```
  This is `useT()`'s exact merge logic, parameterized instead of context-driven — `getTranslations()` itself is untouched (still the zero-arg, defaultLocale-only function `app/[category]/[item]/page.tsx` uses).
- `generateCatalogPdf(options)` calls `getTranslationsForLocale(options.locale)` once and threads the resulting `UIStrings` object (`t`) down through `buildFullCatalogHtml(branding, groups, generatedAt, t, priceStrategy)` into every `build*Html` function in `template.ts`. `template.ts` gains no new import of `siteConfig` or the i18n modules — it stays a pure, dependency-injected rendering module, consistent with how it already receives `SiteBranding` rather than reading `siteConfig` itself.
- **Reused existing `UIStrings` keys** (replacing `template.ts`'s private duplicated English strings): `statusAvailable/Pending/Reserved/Sold/Draft` (status badges), `conditionNew/LikeNew/Good/Fair/ForParts` (replacing the private `CONDITION_LABELS` map), `contactForPrice`, `obo`, `pricingLabelHeader`/`pricingDistanceHeader`/`pricingPriceHeader` (tier table headers), `brand`/`model`/`age`/`color`/`dimensions`/`weight` (specs rows). Known minor side effect: PDF wording shifts slightly to match the live site's exact copy (e.g. the tier table's "Option" header becomes "Label", `contactForPrice`'s exact sentence changes from "Contact for price" to whatever `UIStrings.contactForPrice` says) — this is intentional; the whole point is one source of truth for this copy.
- **New `UIStrings` keys** (no existing equivalent): `pdfTocHeading`, `pdfCoverHeading`, `pdfCoverMeta` (`"{itemCount} items across {categoryCount} categories"`), `pdfGeneratedOn` (`"Generated {date}"`), `pdfViewLiveListing`, `pdfFooterPage`/`pdfFooterOf` (footer text is composed around Playwright's own `<span class="pageNumber">`/`<span class="totalPages">` spans, which are filled in after layout and can't go through `{}` substitution), `pdfAveragePriceLabel` (`"Highlighted price (average): {amount}"`), and `condition` (a generic specs-row label — only badge-value keys like `conditionNew` exist today, no generic "Condition" row label).
- A private `fmt(template: string, params: Record<string, string | number>): string` helper (regex `{key}` substitution) is added to `template.ts`, used only for `pdfCoverMeta`, `pdfGeneratedOn`, and `pdfAveragePriceLabel`.
- Per Iron Rule 8, none of the new `UIStrings` keys need a `scripts/lib/configDefaults.ts` entry — the `{...EN_FALLBACK, ...siteDict}` merge is this type's own backward-compat mechanism (§1). They are added to `content/config.ts`'s explicit `en` translations block and the commented-out `zh` template block, per Rule 8 checklist step 3 (upstream documentation).

### 3.4 Category + status filters, and dialog defaults

- **Categories**: checkboxes, one per unique `categorySlug` present in the dialog's `items` prop, each showing its live matching-item count. Default: **all checked**.
- **Statuses**: checkboxes for all 5 `Status` values. Default: **`available`, `pending`, `reserved` checked** (matches today's hardcoded `EXPORTABLE_STATUSES`, so an unmodified export produces the same item set as before this feature); `sold` and `draft` **unchecked** by default.
- **Language**: `<select>`, options = `siteConfig.i18n.availableLocales`. Default: `siteConfig.i18n.defaultLocale`.
- **Price strategy**: `<select>`, 5 options. Default: **`average`**.
- The dialog's "N items across M categories" summary line recomputes live as any checkbox/select changes (replacing the current fixed-`EXPORTABLE_STATUSES` computation).

### 3.5 Server-side validation

`handleExportPdf` (`scripts/lib/studioApi.ts:1336`) now reads and validates the POST body before calling `generateCatalogPdf`:

- `priceStrategy`: checked against the 5-value `PriceStrategy` union; defaults to `"lowest"` if missing/unrecognized (defensive against a stale client build sending an unknown value — not the dialog's own default, which is `average`, but a safe, unsurprising fallback for the server itself).
- `locale`: checked against `siteConfig.i18n.availableLocales`; defaults to `siteConfig.i18n.defaultLocale` if missing/invalid.
- `statuses`: filtered to the 5-value `Status` union, dropping any unrecognized string.
- `categories`: passed through unvalidated — `groupEligibleItems` only ever emits groups for categories that exist in `loadCategories()`, so an unknown/stale slug in the filter set is already a harmless no-op.

`groupEligibleItems(items, categories, statuses, categorySlugs)` (updated signature) filters on `statuses.includes(item.status) && categorySlugs.includes(item.categorySlug)` instead of the current hardcoded `EXPORTABLE_STATUSES` check.

## 4. Architecture

```
Browser (Studio SPA)                                    Server
─────────────────────                                   ──────
panes/ExportPdfDialog.tsx (modified)
  language <select>            (siteConfig.i18n.availableLocales)
  price-strategy <select>      (5 options, Studio's own i18n labels)
  category checkboxes          (derived from `items` prop)
  status checkboxes            (5 values, reuses Studio's filter.status.* keys)
api.ts
  exportCatalogPdf(options)    (was: no-arg)
        │ POST /api/export-pdf  { locale, priceStrategy, categories, statuses }
        └──────────────────────────────►  handleExportPdf(body)
                                             │ validate/clamp against real unions
                                             ▼
                                   scripts/lib/pdfCatalog/generate.ts
                                     generateCatalogPdf(options)
                                       getTranslationsForLocale(options.locale) → t
                                       loadAllItemsRaw() + loadCategories()
                                       groupEligibleItems(..., statuses, categories)
                                       toItemPdfView(item, options.locale)  [getLocalizedField]
                                       buildFullCatalogHtml(branding, groups, date, t, priceStrategy)
                                       → playwright: setContent → page.pdf()
                                       → temp file
                                             │
                                   returns FileResponse{file, contentType}  (unchanged)
        ◄────────────────────────────────────
   studio/vite.config.ts (unchanged) streams the file; client downloads as Blob.
```

No change to the base pipeline's file-serving mechanism, CSRF guard, or temp-file handling (base spec §4) — this feature only changes what flows into `generateCatalogPdf` and how `template.ts` renders from it.

## 5. Testing

- `lib/utils/pricing.test.ts`: new cases for `resolvePriceByStrategy` — all 5 strategies, `pickup`/`shipping`'s no-matching-tier fallback, `average`'s midpoint math, empty-tiers → `null`.
- `scripts/lib/pdfCatalog/template.test.ts`: updated call signatures (`t: UIStrings`, `priceStrategy` params now required); new cases per strategy for row-highlighting vs. the `average` banner; locale-switched chrome text and item content; the new generic `condition` label; reused-key wording verified against `UIStrings`, not a private duplicate.
- `scripts/lib/pdfCatalog/generate.test.ts`: updated `generateCatalogPdf(options)` / `groupEligibleItems(...)` calls; new cases for category filtering, status filtering (including `sold`/`draft` now includable), and locale-based name/description resolution via `getLocalizedField`.
- `scripts/export-facebook.ts`: existing price-strategy behavior unchanged after the shared-resolver swap (regression check); new case for the `average` CLI option producing the same number `resolvePriceByStrategy` would.

## 6. Documentation updates (Iron Rule 2 — bilingual sync)

- `docs/DESIGN.md` §22 (Seller Studio) + `docs/DESIGN_zh.md` §22 — document the 3 new export options and the `average` price-strategy banner behavior.
- `docs/TECH_REQUIREMENTS.md` §30 (Studio) + `docs/TECH_REQUIREMENTS_zh.md` §30 — document `POST /api/export-pdf`'s new request body shape and server-side validation/defaults.
- `docs/DESIGN.md` §12 (i18n) + `docs/DESIGN_zh.md` §12 — document `getTranslationsForLocale`, the new `UIStrings` keys, and that `content/config.ts`'s `i18n.translations` merge is this type's own backward-compat path (no `configDefaults.ts` entry needed for these keys).
- `docs/CURRENT_FUNCTIONALITY.md` + `docs/CURRENT_FUNCTIONALITY_zh.md` — update the PDF export feature description (language/price-strategy/filters now configurable, not fixed).
- `content/config.ts` — add the new `UIStrings` keys to the explicit `en` translations block and to the commented-out `zh` template block (Rule 8 step 3, documentation-only — no `configDefaults.ts` entry per §3.3 above).
