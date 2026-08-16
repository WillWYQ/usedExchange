# Single-Item Flyer PDF Implementation Plan

**Goal:** Add a "Download Flyer" button to the public item detail page that lazily loads jsPDF and generates a one-page PDF (name, price, description, photos, specs, live-listing link) for that item, degrading gracefully on any failure.

**Architecture:** `lib/pdf/flyerContent.ts` (pure formatting/narrowing logic) + `lib/pdf/generateItemFlyer.ts` (jsPDF + `fetch`-based image embedding, dynamically imported) + `components/item/FlyerButton.tsx` (client button, idle/generating/success/error state machine) wired into `app/[category]/[item]/page.tsx` next to `ShareButton`.

**Tech Stack:** TypeScript, jsPDF, Vitest (+ `@testing-library/react` for the button), React 19 Server/Client Components, Next.js 15 static export.

**Spec:** `docs/superpowers/specs/2026-08-16-item-flyer-pdf-design.md`

## Global Constraints

- Never modify `scripts/lib/pdfCatalog/**`, `studio/**`, or anything under the existing Seller Studio catalog PDF feature (spec §1, §6).
- Never touch `content/`.
- `jspdf` must not appear in the item page's initial JS bundle — only loaded via `await import("@/lib/pdf/generateItemFlyer")` inside the button's click handler (spec §3.2).
- New `UIStrings` keys go in `lib/config/types.ts` + `EN_FALLBACK` only, **not** `scripts/lib/i18nRequiredKeys.ts` (spec §5.5 — backward-compat precedent).
- `FlyerItemView` never carries `reserved_for` (spec §6, structural).
- No crash on library-load failure, generation failure, or missing `Blob`/`URL.createObjectURL` support (spec §3.6).

---

### Task 1: Pure flyer content logic (`lib/pdf/flyerContent.ts`)

**Files:**
- Create: `lib/pdf/flyerContent.ts`
- Test: `lib/pdf/flyerContent.test.ts`

**Interfaces:**
- Consumes: `Item`, `Price`, `PriceTier`, `Condition`, `Status`, `Dimensions`, `Weight` from `lib/content/types`; `formatDimensions`, `formatWeight` from `lib/utils/units`.
- Produces (used by Task 2 and Task 3): `type FlyerItemView`; `toFlyerItemView(item: Item): FlyerItemView`; `buildFlyerPriceLines(price, resolvedTier)`; `buildFlyerSpecs(item, unitSystem)`; `buildLiveListingUrl(baseUrl, item)`; `buildFlyerFilename(item)`.

- [ ] Step 1: Write failing tests in `lib/pdf/flyerContent.test.ts` covering: single-tier headline; multi-tier table with the resolved row flagged `isDefault`; "Contact for price" when `tiers` is empty; OBO flag when `negotiable`; specs omit blank fields but always include condition; URL/filename composition; `toFlyerItemView` never leaks a smuggled `reserved_for`.
- [ ] Step 2: Run `pnpm vitest run lib/pdf/flyerContent.test.ts` — expect FAIL (module doesn't exist).
- [ ] Step 3: Implement `lib/pdf/flyerContent.ts`.
- [ ] Step 4: Run the tests again — expect PASS.
- [ ] Step 5: Commit: `git add lib/pdf/flyerContent.ts lib/pdf/flyerContent.test.ts && git commit -m "feat(flyer): add pure flyer content formatting logic"`

### Task 2: PDF generation (`lib/pdf/generateItemFlyer.ts`)

**Files:**
- Create: `lib/pdf/generateItemFlyer.ts`
- Test: `lib/pdf/generateItemFlyer.test.ts`
- Modify: `package.json` (add `jspdf` dependency), `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `FlyerItemView`, `buildFlyerPriceLines`, `buildFlyerSpecs`, `buildLiveListingUrl` from Task 1; `jspdf`.
- Produces (used by Task 3): `generateItemFlyerPdf(params): Promise<Blob>`.

- [ ] Step 1: `pnpm add jspdf` (runtime dependency, not dev — it ships to the browser).
- [ ] Step 2: Write failing tests: zero-image fixture item → returned Blob's first bytes are `%PDF` (no network call needed); `global.fetch` mocked to reject → generation still resolves (photo dropped, not thrown).
- [ ] Step 3: Run `pnpm vitest run lib/pdf/generateItemFlyer.test.ts` — expect FAIL.
- [ ] Step 4: Implement `generateItemFlyerPdf` per spec §5.2 (`fetchImageAsDataUrl` helper with try/catch, jsPDF layout: header, price, photo grid, specs, description, footer link).
- [ ] Step 5: Run the tests again — expect PASS.
- [ ] Step 6: Commit: `git add lib/pdf/generateItemFlyer.ts lib/pdf/generateItemFlyer.test.ts package.json pnpm-lock.yaml && git commit -m "feat(flyer): generate single-item flyer PDF via jsPDF"`

### Task 3: i18n strings

**Files:**
- Modify: `lib/config/types.ts`, `lib/i18n/translations.ts`

- [ ] Step 1: Add six keys to `UIStrings` (`lib/config/types.ts`) under a new "Flyer button" comment block: `downloadFlyer`, `generatingFlyer`, `flyerDownloaded`, `flyerLoadError`, `flyerGenerateError`, `flyerUnsupported`.
- [ ] Step 2: Add matching English defaults to `EN_FALLBACK` in `lib/i18n/translations.ts`.
- [ ] Step 3: `pnpm type-check` — confirm no type errors (content/config.ts's `Partial<UIStrings>` translations dicts remain valid without these keys).
- [ ] Step 4: Commit: `git add lib/config/types.ts lib/i18n/translations.ts && git commit -m "feat(flyer): add flyer button i18n strings"`

### Task 4: `FlyerButton` component

**Files:**
- Create: `components/item/FlyerButton.tsx`
- Test: `components/item/FlyerButton.test.tsx`

**Interfaces:**
- Consumes: `FlyerItemView` (Task 1, type-only import), `generateItemFlyerPdf` (Task 2, dynamically imported inside the handler — never imported at module scope), `useDistancePricingContext` (`components/pricing/DistancePricingContext`), `resolveItemPrice` (`lib/utils/pricing`), `useT` (`components/i18n/useT`).
- Produces: `<FlyerButton item initialResolvedTier siteName baseUrl />`, wired in Task 5.

- [ ] Step 1: Write failing tests (jsdom env, mirroring `MakeOfferButton.test.tsx`'s mock-`@/content/config` pattern where needed): click → mocked dynamic import resolves with a Blob → success message shown, `URL.createObjectURL`/anchor-click/`revokeObjectURL` invoked, button returns to idle after its timeout; mocked import rejects → error message shown, button re-enabled; `URL.createObjectURL` absent → button renders `disabled` with a title.
- [ ] Step 2: Run `pnpm vitest run components/item/FlyerButton.test.tsx` — expect FAIL.
- [ ] Step 3: Implement `FlyerButton.tsx` per spec §5.3 — `await import("@/lib/pdf/generateItemFlyer")` inside the click handler only.
- [ ] Step 4: Run the tests again — expect PASS.
- [ ] Step 5: Commit: `git add components/item/FlyerButton.tsx components/item/FlyerButton.test.tsx && git commit -m "feat(flyer): add FlyerButton component"`

### Task 5: Wire into the item detail page

**Files:**
- Modify: `app/[category]/[item]/page.tsx`

- [ ] Step 1: Import `FlyerButton` and `toFlyerItemView`; render `<FlyerButton item={toFlyerItemView(itemData)} initialResolvedTier={initialResolvedTier} siteName={siteConfig.name} baseUrl={siteConfig.baseUrl} />` next to `<ShareButton title={itemData.name} />` in the existing action row (~line 331-333).
- [ ] Step 2: `pnpm type-check && pnpm lint`.
- [ ] Step 3: Commit: `git add app/[category]/[item]/page.tsx && git commit -m "feat(flyer): wire FlyerButton into the item detail page"`

### Task 6: Verification

- [ ] Step 1: `pnpm test` — full suite green.
- [ ] Step 2: `pnpm type-check` — clean.
- [ ] Step 3: `pnpm lint` — zero warnings.
- [ ] Step 4: `pnpm build` — succeeds against the real `content/` in this repo.
- [ ] Step 5: Inspect the build output to confirm `jspdf` is not present in the item route's initial/first-load JS — only in a separate on-demand chunk. Record the exact evidence (file names / grep result) for the PR description.
- [ ] Step 6: Manual smoke pass per spec §7.4 if a way to serve `out/` is available in this environment; otherwise note the gap explicitly.

### Task 7: Higher-tier code review + fixes

- [ ] Dispatch a review of the full diff via the Agent tool with `model: "opus"`.
- [ ] Apply legitimate correctness/security/simplicity findings; note any declined findings with reasoning.

### Task 8: Branch, commit, push, PR

- [ ] Create `feature/item-flyer-pdf` off `develop`, push, open a PR against `develop` (not `main`) summarizing the feature, library choice, degradation behavior, and bundle-size evidence from Task 6.
