# Design: Seller-contact accessibility for the catalog PDF export

**Date:** 2026-08-17
**Branch:** `feat/studio-pdf-contact-accessibility` (off `develop`)
**Scope:** Add seller-contact affordances to the existing "Export catalog PDF" feature — per-item quick-contact actions and a QR-code contact collection — sourced from `content/config.ts`'s `contact.platforms`.
**Out of scope:** Any change to the export dialog, its options (`PdfExportOptions`), the Studio HTTP routes, the config-write path, or public-visitor PDF generation.
**Doc convention:** English-only (this is a `docs/superpowers/specs/*` file, not one of the bilingual top-level `docs/*.md` files governed by CLAUDE.md Rule 2).

> **Authoring note.** This design was produced in an unattended run with no user available. Wherever the standard process would pause to ask the seller a question, the decision was made here with explicit reasoning and flagged for human sanity-check (see §9). No `content/config.ts` values were changed; the seller's existing config is read, never written.

---

## 1. Background — the pipeline as it exists on `develop`

The PDF pipeline (PR #11 + the merged "export improvements" track, PR #13):

- `scripts/lib/pdfCatalog/template.ts` — synchronous HTML/CSS string builders: `buildCoverHtml`, `buildTocHtml`, `buildCategorySectionHtml`, `buildItemHtml`, `buildFlyerHtml`, `buildFullCatalogHtml`, plus `escapeHtml` and `buildPriceHtml`.
- `scripts/lib/pdfCatalog/generate.ts` — Playwright/Chromium render orchestration: `generateCatalogPdf(options)` and `generateFlyerPdf(itemId)`, sharing `renderHtmlToPdf()`. Remote item images are prefetched to a temp dir (`prefetchImages()`), the HTML is loaded via a `file://` URL, and Chromium prints it to PDF. No `next dev` server is involved.
- `scripts/lib/studioApi.ts` — `POST /api/export-pdf` (catalog) and `POST /api/export-pdf/flyer` handlers. They validate options and call the two `generate*` functions. **This feature does not touch these.**

Current document structure (catalog): `cover → TOC → (category divider → item pages…)…`. Each is a discrete full page separated by CSS `page-break-*`. A Chromium `footerTemplate` renders a thin "SiteName · Page N of M" band in the bottom margin.

The live storefront already resolves each contact platform to a URL in `components/contact/PlatformButton.tsx`'s `buildUrl()`. That function is the ground truth this feature mirrors (see §4).

### Contact data model (re-verified against `lib/config/types.ts`)

`SiteConfig.contact` is `{ reveal_behavior: "click" | "always"; platforms: Platform[] }`. **`reveal_behavior` is a single value for the whole block, not per-platform** (the originating brief described it as per-platform; that was inaccurate — the code is authoritative). `reveal_behavior` is a live-site UX concern (click-to-reveal) and has **no meaning in a static PDF**, so this feature ignores it entirely.

`Platform` is a discriminated union:
- **handle/link shape** — `{ type: string; value: string; qr_image?: never; label?: string }` (email, instagram, discord, …).
- **pre-made-image shape** — `{ type: string; value?: string; qr_image: string; label: string }` (wechat), where `qr_image` is a path like `/contact/wechat-qr.png`.

`qr_image` files live in `content/contact/` (git-tracked, seller-owned; PNG only) and are copied to `public/contact/` by `scripts/sync-images.ts` for the live site. **The current repo's `content/contact/` holds only `.gitkeep`** (wechat is commented out in `content/config.ts`), so the `qr_image` path is exercised only when a seller configures it — missing-file handling must be graceful.

---

## 2. Goals

1. **Per-item quick contact** — on every item page (catalog *and* flyer), a `mailto:` action pre-filled with a subject and body referencing that item by name and its live URL, plus a Discord quick-link when a discord platform is configured.
2. **Contact QR collection** — one scannable QR per configured platform: generated offline for URL/handle platforms (email → `mailto:` QR, instagram → profile-URL QR, discord → user-link QR, etc.), and the seller's pre-made image embedded directly for `qr_image` platforms (wechat).

Both are **automatic**: they appear whenever `contact.platforms` is non-empty. No new export option, no new Studio UI, no new `SiteConfig` field (see §8).

---

## 3. Brainstorming — open questions, answered

A real brainstorming session would raise these. Each is resolved here with reasoning.

### Q1. Where does the QR collection live — a footer on every page, or a dedicated page?

**Decision: a dedicated "Contact the Seller" page**, placed immediately after the cover and before the TOC in the catalog; and a compact contact strip at the bottom of the single-item flyer.

Reasoning:
- **Architecture fit.** The catalog is already a sequence of discrete full-page sections (`cover`, `toc`, `category-divider`, `item-page`) joined by `page-break-*`. A dedicated contact page is the same idiom; a per-page footer is not. The only per-page footer that exists is Chromium's `footerTemplate`, which runs in an isolated context with no access to `CATALOG_CSS`, cannot load external/relative resources, and gives a ~16 mm strip — a hostile place for QR images and multi-platform layout.
- **File size & clutter.** QR SVGs (or a wechat PNG data URI) repeated in every page footer would bloat the PDF linearly with page count and crowd every page. One page carries each QR exactly once.
- **Scannability.** A phone camera needs a QR of reasonable physical size. One large QR per platform on a dedicated page scans reliably; thumbnail QRs tiled into a footer often do not.
- **Discoverability.** Placing it right after the cover makes it page 2 — the first thing after the title — so a buyer who just wants to reach the seller finds it without paging past the catalog. "Near the cover" was the task's own suggested location.
- **Cover-vs-after-TOC.** After the cover (before the TOC) beats after the TOC: contact info is front-matter peer to the cover, and a buyer shouldn't have to scroll the whole item index to find how to reach the seller. TOC anchor links (`#item-…`) are position-independent, so inserting a page ahead of the TOC breaks nothing.
- **Flyer.** A flyer is a standalone one-sheet poster (think a bulletin-board tear-off). A compact contact strip beneath the item makes it self-sufficient — someone who sees only the flyer can still reach the seller. It reuses the same per-platform rendering, sized down.

Rejected alternatives: (a) *QR in every-page footer* — rejected for the four reasons above; (b) *contact page at the very end (back cover)* — less discoverable for a print-first artifact and the task nudged toward "near the cover"; (c) *no dedicated page, only per-item links* — fails Goal 2 (the QR collection) and omits image-only platforms like wechat that have no per-item link form.

**Deliberate non-goal:** no new TOC entry linking to the contact page. `buildTocHtml` is left untouched to keep this change surgical and free of conflict with the in-flight layout/pagination track; page-2 placement already gives high discoverability.

### Q2. What URL should a Discord quick-link resolve to?

**Decision: `https://discord.com/users/<value>`** — a user-profile deep link — mirroring the live site exactly (`PlatformButton.tsx:147-148`: `return \`https://discord.com/users/${encodeURIComponent(value)}\``).

Reasoning: `content/config.ts` ships a discord `value` of `"123456789012345678"` — a raw snowflake, i.e. a **user ID**, not an invite code or username. The live storefront already treats that exact value as a user ID and builds the user-profile link. Making the PDF resolve it any other way (a guild invite would need a separate field the config doesn't have; a username link uses a different path) would make the PDF disagree with the seller's own site for the same data. The least-surprising, most-consistent choice is to reproduce the site's behavior byte-for-byte. **`content/config.ts` is seller-owned and cannot be interrogated, so this is an inference, not a stated fact — flagged in §9 for human sanity-check.**

### Q3. Which platforms get a QR, and how?

- **Handle/link platforms with a resolvable URL** (email, instagram, discord, facebook, whatsapp, twitter, tiktok, linkedin, youtube, snapchat, venmo): generate a QR **offline** encoding the same URL the live site's `buildUrl()` produces. Email encodes a plain `mailto:<addr>` (no item context — the contact page is catalog-level).
- **`qr_image` platforms** (wechat, or any platform carrying `qr_image`): **embed the seller's existing PNG** read from `content/contact/<basename>` as a base64 data URI. Do **not** re-encode it — it may encode a WeChat "add me" payload that isn't a URL we can reconstruct.
- **Handle platforms with no URL pattern and no image** (e.g. a zelle handle — `buildUrl` returns `"#"` for it): render the handle as **plain text**, no QR (nothing scannable exists). This is a graceful fallback, not an error.

### Q4. What does the per-item mailto contain?

Subject: `Inquiry: <item name>` (matches the live site). Body: `Hi, I'm interested in your <item name> (<live URL>). Is it still available?` — the live URL is included per the task requirement that the per-item action reference "name + live URL". Both subject and body are `encodeURIComponent`-encoded; the address is sanitized (first whitespace/`?`-delimited token) exactly as `buildUrl` does, so a typo'd config value cannot inject extra `mailto` headers. If no email platform is configured, the per-item mailto action is simply omitted (the Discord quick-link, if present, still renders).

### Q5. Which QR library, and SVG or raster?

**Decision: `qrcode` (node-qrcode), inline SVG output**, added to `devDependencies` with `@types/qrcode`.

Reasoning: it is pure-JS on the SVG path (no `node-canvas`, no native build, fully offline), satisfying the DESIGN.md v1 constraint that generation makes no network call beyond CDN item images. `QRCode.toString(text, { type: "svg", margin: 1 })` returns a self-contained `<svg>` string. Inline SVG is chosen over a PNG data URI because (a) it is vector — crisp at any PDF scale — and (b) it sidesteps `generate.ts`'s `prefetchImages()` `<img src>` scan entirely (an inline `<svg>` has no `src`). It is dev/tooling-only (the whole `scripts/` pipeline runs under `tsx`) and never enters the Next.js client bundle. Alternatives (`qrcode-generator`, `qrcode-svg`) are also pure-JS but have clunkier APIs / GIF-only or SVG-only output with weaker ecosystems; `qrcode` is the most ergonomic and widely used.

### Q6. Should any of this be gated by a new config field or export toggle?

**Decision: no.** The task asks to *add accessibility features*, not to make them optional. Gating on `contact.platforms` presence already means a seller with no contacts gets nothing. Adding a toggle would mean a new `SiteConfig` field (Iron Rule 8 machinery: optional type, consumer default, `configDefaults.ts`, migrate-config) and likely a new dialog control — surface area the task explicitly scopes out. A future opt-out, if wanted, would follow Rule 8; noted as a non-goal.

### Q7. Offline `qr_image` embedding — read from disk or fetch a URL?

**Decision: read `content/contact/<basename>` from disk** and inline as a data URI. The alternative — making it an absolute `${baseUrl}/contact/…` URL and letting `prefetchImages` fetch it — adds a network dependency the v1 design forbids and fails if the seller hasn't deployed yet. Disk read is offline and authoritative (`content/contact/` is the source `sync-images.ts` copies from). If the file is missing or unreadable, that platform degrades to a text label (Q3 fallback) rather than a broken image.

---

## 4. Reusing the live site's URL logic

`PlatformButton.tsx`'s `buildUrl()` is a `"use client"` React module and cannot be imported by a Node script. Rather than import it, this feature **re-implements the same URL formats** in a new pure module so both stay in sync by shared shape (and a test asserts parity for the platforms in scope). The formats reproduced verbatim:

| type | resolved URL |
|---|---|
| email (no item) | `mailto:<sanitized-addr>` |
| email (per item) | `mailto:<addr>?subject=Inquiry:%20<name>&body=<…live URL…>` |
| instagram | `https://instagram.com/<enc(value)>` |
| discord | `https://discord.com/users/<enc(value)>` |
| facebook | `https://facebook.com/<normalizeProfilePath(value)>` |
| whatsapp | `https://wa.me/<enc(digits)>` |
| twitter | `https://x.com/<enc(value)>` |
| tiktok | `https://tiktok.com/<enc(value)>` |
| linkedin | `https://linkedin.com/<in/…normalized>` |
| youtube | `https://youtube.com/<enc(value)>` |
| snapchat | `https://snapchat.com/add/<enc(value)>` |
| venmo | `https://venmo.com/u/<enc(value)>` |
| (anything else, no `qr_image`) | none → text fallback |

The `normalizeProfilePath` helper (facebook/linkedin) is small; it is reproduced too so pasted-URL and bare-handle values both resolve correctly, matching the live site.

---

## 5. Module & data-flow design

Two new pure, unit-testable modules plus additive edits to the two existing files.

### 5.1 `scripts/lib/pdfCatalog/contactLinks.ts` (new, pure)

```ts
export type ContactActionSeed = {
  email?: string;       // sanitized address, or undefined if no email platform
  discordUrl?: string;  // fully-resolved discord user URL, or undefined
};

export type ContactTarget =
  | { kind: "url"; url: string }        // a scannable/clickable URL
  | { kind: "image"; qrImagePath: string } // a qr_image config path (/contact/…)
  | { kind: "text" };                   // no scannable form; show value as text

export type ResolvedPlatform = {
  type: string;
  label: string;        // platform.label ?? PLATFORM_LABELS[type] ?? type
  displayValue: string; // human-readable: the address, @handle, etc. ("" if none)
  target: ContactTarget;
};

export function resolvePlatform(platform: Platform): ResolvedPlatform;
export function resolveContactActionSeed(platforms: Platform[]): ContactActionSeed;
export function buildItemMailto(email: string, itemName: string, liveUrl: string): string;
export function sanitizeEmail(value: string): string; // shared with buildItemMailto
```

- `resolvePlatform` maps a `Platform` to `{ url } | { image } | { text }` using the §4 table; `qr_image` platforms → `{ kind: "image", qrImagePath: platform.qr_image }`.
- `resolveContactActionSeed` scans platforms once for the first email and first discord and returns the per-item seed.
- `buildItemMailto` builds the pre-filled per-item mailto (Q4).
- No React, no I/O — 100% testable offline.

### 5.2 `scripts/lib/pdfCatalog/qr.ts` (new, thin async wrapper)

```ts
export async function renderQrSvg(text: string): Promise<string>; // QRCode.toString({type:"svg", margin:1})
```

Isolated so the `qrcode` import lives in one place and the wrapper is unit-tested for "produces an `<svg>` containing path data, offline, deterministic for a given input."

### 5.3 `scripts/lib/pdfCatalog/template.ts` (additive)

- **`buildItemHtml(item, baseUrl, strategy, t, contact?)`** — new optional `contact: ContactActionSeed` param (optional ⇒ backward-compatible with existing call sites and tests). When present and non-empty, append a "Contact seller about this item" block after the live-link paragraph: a `mailto:` `<a>` (built from `contact.email` + this item's `name`/`liveUrl`) and/or a Discord `<a>` (`contact.discordUrl`). Omitted entirely when the seed is empty.
- **`buildContactPageHtml(entries, t)`** — new. Renders the dedicated catalog contact page (`page-break-after: always`). `entries` is a pre-rendered list (QR SVGs already generated / images already inlined by `generate.ts`, since the template stays synchronous). Each entry: platform label, the QR (inline SVG) or embedded image (data URI) or a text handle, and the human-readable target beneath.
- **`buildFlyerContactStripHtml(entries, t)`** — new. Compact horizontal variant of the contact block for the flyer footer.
- **`buildFlyerHtml(item, branding, strategy, t, contact?, contactEntries?)`** — thread the per-item seed and (optionally) the compact contact strip.
- **`buildFullCatalogHtml(branding, groups, generatedAt, t, strategy, contact?, contactEntries?)`** — insert `buildContactPageHtml(contactEntries, t)` between cover and TOC when entries exist, and pass `contact` down to each `buildItemHtml`.
- **CSS** — append contact-page / contact-strip / per-item-contact rules to `CATALOG_CSS` (grid of QR cards, monospace target text, print-safe colors). QR SVGs are given a fixed render width (e.g. 128 px card / 96 px flyer).

The pre-rendered entry type the template consumes:

```ts
export type ContactPdfEntry =
  | { kind: "qr"; label: string; target: string; svg: string }      // generated, svg inline
  | { kind: "image"; label: string; dataUri: string }               // qr_image PNG inlined
  | { kind: "text"; label: string; value: string };                 // no scannable form
```

### 5.4 `scripts/lib/pdfCatalog/generate.ts` (additive)

A new async assembler, called by both `generateCatalogPdf` and `generateFlyerPdf`:

```ts
async function buildContactPdfData(): Promise<{
  seed: ContactActionSeed;
  entries: ContactPdfEntry[];
}>;
```

Steps (all offline):
1. `seed = resolveContactActionSeed(siteConfig.contact.platforms)`.
2. For each platform: `resolvePlatform` →
   - `url` → `renderQrSvg(url)` → `{ kind: "qr", label, target: displayValue||url, svg }`.
   - `image` → read `content/contact/<basename(qrImagePath)>` from disk; on success base64 → `{ kind: "image", label, dataUri }`; on failure → `{ kind: "text", label, value: label }`.
   - `text` → `{ kind: "text", label, value: displayValue }`.
3. Return `{ seed, entries }`.

`generateCatalogPdf` awaits it and passes `seed` + `entries` into `buildFullCatalogHtml`. `generateFlyerPdf` awaits it and passes `seed` + `entries` into `buildFlyerHtml`. Disk reads are constrained to `content/contact/` and use `path.basename()` on the config value to prevent traversal.

**Interaction with `prefetchImages()`:** generated QRs are inline `<svg>` (no `src`) and the wechat image is a `data:` URI; `prefetchImages`'s regex only rewrites `src="http…"`, so neither is touched. Confirmed against `generate.ts:159-163`.

---

## 6. i18n

New PDF-chrome strings follow the existing `pdf*` `UIStrings` convention (DESIGN.md §929: new `UIStrings` keys are **required** `string` fields; downstream configs missing them still type-check because `translations` is `Partial<UIStrings>`, and `EN_FALLBACK` supplies the value at runtime).

New keys (English defaults):
- `pdfContactHeading` — "Contact the Seller"
- `pdfContactIntro` — "Scan a code or use a link below to reach the seller."
- `pdfContactScanHint` — "Scan to connect"
- `pdfItemContactHeading` — "Contact seller about this item"
- `pdfEmailAboutItem` — "Email about this item"
- `pdfMessageOnDiscord` — "Message on Discord"

Each is added in three places (plus the migrate path):
1. `lib/config/types.ts` — `UIStrings` (required `string`).
2. `lib/i18n/translations.ts` — `EN_FALLBACK` (the runtime backward-compat source).
3. `content/config.ts` — the `en` translations block (documentation parity with the other `pdf*` keys; safe plain strings).
4. `scripts/lib/configDefaults.ts` — appended to the existing PDF-chrome entry so `pnpm update-site` / `pnpm migrate-config` splice them into older downstream configs, exactly as the current `pdf*` keys are handled.

The mailto subject/body sentence is composed in `contactLinks.ts` from these strings is **not** localized beyond English in v1 — consistent with the existing `formatPrice`/`fmt` limitation noted in `template.ts` (fixed English word order for composed sentences). The subject "Inquiry:" mirrors the live site's own hardcoded English subject in `PlatformButton.buildUrl`. Recorded as a known limitation, not a regression.

---

## 7. Testing strategy (TDD)

- `contactLinks.test.ts` — `resolvePlatform` for every type (URL formats match the §4 table incl. facebook/linkedin normalization and email sanitization); `resolveContactActionSeed` picks first email/discord and omits when absent; `buildItemMailto` encodes subject/body and embeds the live URL; discord resolves to `discord.com/users/<id>`; unknown handle-only platform (zelle) → text; `qr_image` platform → image target.
- `qr.test.ts` — `renderQrSvg` returns a `<svg>` with path content, is deterministic per input, and runs with no network.
- `template.test.ts` (extend) — `buildContactPageHtml` contains each entry's label/QR/text and a `page-break`; `buildItemHtml` with a seed renders the mailto (with encoded subject and the live URL in the body) and the discord link, and renders **nothing extra** when the seed is empty (guards backward-compat); `buildFullCatalogHtml` inserts the contact page between cover and TOC; flyer strip renders.
- `generate.test.ts` (extend, no Playwright) — `buildContactPdfData` returns a seed + entries for a stub config; missing `qr_image` file degrades to text; traversal in a `qr_image` path is stripped to a basename.
- **Manual/scripted smoke:** render a real catalog PDF and a real flyer in the sandbox (Chromium is preinstalled) and confirm the contact page and per-item links are present (see §10 verification).

All existing tests must continue to pass unchanged (the new template params are optional).

---

## 8. Iron-Rule compliance

- **Rule 1 (`content/` only for sellers):** app-code edits (`scripts/`, `lib/`, `template.ts`, `generate.ts`) are explicitly in scope for this requested feature (Rule 3). The one `content/` edit is adding the six English `pdf*` strings to `content/config.ts`'s `en` block — the same content-file the existing `pdf*` keys already live in.
- **Rule 3 (app code is live):** new files are created under `scripts/lib/pdfCatalog/` for an explicitly requested feature — permitted.
- **Rule 4 (never render `reserved_for`):** not read anywhere here; `Item`/`ItemPdfView` don't carry it.
- **Rule 8 (backward-compatible config):** **no new `SiteConfig`/`UIConfig` field is added** (Q6), so the object-config checklist is vacuously satisfied. The new `UIStrings` keys follow the established `pdf*` backward-compat path (required type + `EN_FALLBACK` + `configDefaults.ts`), so downstream sites that never touch their config still type-check and render correct English.

---

## 8a. Post-implementation review findings (self-review, 2026-08-17)

A self-directed adversarial code review (standing in for the absent human reviewer) confirmed the injection, mailto-header, path-traversal, offline-guarantee and union-threading analyses above, and surfaced three defects, all fixed in commit `fix(pdf): isolate contact-entry failures and skip blank platform values`:

1. **(Medium) Unguarded QR/URL encoding could fail the whole export.** `QRCode.toString` throws when the encoded text exceeds QR capacity (~2953 bytes), and `encodeURIComponent` throws `URIError` on a lone surrogate. Inside `Promise.all` either rejection propagated out of `buildContactPdfData` and turned a single malformed platform into an opaque 500 for the entire catalog/flyer. Fixed by wrapping each platform's resolve+render in a try/catch that degrades to a text entry — matching the graceful fallback the missing-image and prefetch paths already use. Regression-tested with a 5000-char value and a lone surrogate.
2. **(Low) Blank platform values poisoned the per-item seed.** An empty first email/discord platform was captured and then suppressed a later valid one; for discord it produced a truthy-but-dead `https://discord.com/users/` link that still rendered as a button. Fixed by skipping blank values.
3. **(Low) Inaccurate `configDefaults.ts` anchor comment.** The claim that `condition:` is globally unique is false — a commented locale example contains it too. First-match behaviour makes the standard layout correct, but the comment now documents the real behaviour, the two edge cases where the splice is skipped, and the `EN_FALLBACK` safety net that keeps the PDF rendering correctly regardless.

## 9. Sanity-check list for the human before this ships

1. **Discord link meaning (inferred, not stated).** The PDF resolves the discord `value` to `https://discord.com/users/<value>`, treating it as a user ID — because the live site does. If the seller intended `value` to be an invite code or username, both the site and this PDF are already wrong for the same reason; confirm the value is a Discord **user ID** (snowflake), or add a dedicated invite field to the contact model.
2. **QR placement.** Confirm the dedicated "Contact the Seller" page (page 2, after the cover) is preferred over an every-page footer. Reasoning in Q1.
3. **English-only composed sentences.** The mailto subject/body and "Inquiry:" are English regardless of the export's selected locale, matching the live site's existing limitation. Confirm that's acceptable for non-English catalogs, or file a follow-up to localize composed contact sentences.
4. **Which platforms deserve a QR.** All URL-resolvable platforms get one (not just email/instagram/discord). Confirm that's desirable (e.g. a whatsapp or venmo QR on the contact page).

---

## 10. Files touched

New:
- `scripts/lib/pdfCatalog/contactLinks.ts` (+ `.test.ts`)
- `scripts/lib/pdfCatalog/qr.ts` (+ `.test.ts`)
- `docs/superpowers/specs/2026-08-17-studio-pdf-contact-accessibility-design.md` (this file)
- `docs/superpowers/plans/2026-08-17-studio-pdf-contact-accessibility.md`

Edited:
- `scripts/lib/pdfCatalog/template.ts` — contact page, per-item block, flyer strip, CSS.
- `scripts/lib/pdfCatalog/generate.ts` — `buildContactPdfData`, thread into both generators.
- `scripts/lib/pdfCatalog/template.test.ts`, `generate.test.ts` — extended.
- `lib/config/types.ts` — new `UIStrings` keys.
- `lib/i18n/translations.ts` — new `EN_FALLBACK` values.
- `content/config.ts` — new `en` strings.
- `scripts/lib/configDefaults.ts` — register new keys for migrate-config.
- `package.json` — `qrcode` + `@types/qrcode` in `devDependencies`.

Explicitly **not** touched: `studio/**` (no dialog/route/client change), the config-write path (`configEdit.ts`, `contactPlatforms.ts`), top-level bilingual `docs/*.md`.
