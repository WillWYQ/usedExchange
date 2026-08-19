# Seller-contact accessibility for the catalog PDF — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task, and `superpowers:test-driven-development` for the new logic (QR generation, contact-link building). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-item quick-contact actions (pre-filled `mailto:` + Discord quick-link) and a QR-code contact collection (a dedicated "Contact the Seller" page in the catalog; a compact strip on the flyer) to the existing PDF export, sourced from `content/config.ts`'s `contact.platforms`. Fully offline.

**Design:** `docs/superpowers/specs/2026-08-17-studio-pdf-contact-accessibility-design.md` — read it first; it records the two standing decisions (dedicated contact page after the cover; Discord `value` resolves to `https://discord.com/users/<value>`) and their reasoning.

**Architecture:** Two new pure modules (`contactLinks.ts` — URL/mailto resolution mirroring the live site's `PlatformButton.buildUrl`; `qr.ts` — offline SVG QR generation via `qrcode`) feed data into additive, backward-compatible edits of `template.ts` (synchronous HTML builders) and `generate.ts` (async assembler that generates QRs and inlines the wechat image before calling the synchronous builders). No Studio route/dialog/config-write change.

**Tech Stack:** TypeScript, Vitest, `qrcode` (+`@types/qrcode`) as devDependencies, existing Playwright render path, `node:fs`/`node:path` for reading `content/contact/` images.

## Global Constraints

- New code files live under `scripts/lib/pdfCatalog/`; the only `content/` edit is adding six English `pdf*` strings to `content/config.ts`'s `en` block (parity with existing `pdf*` keys).
- **No new `SiteConfig`/`UIConfig` field** — the feature is automatic on `contact.platforms` presence (Iron Rule 8 vacuously satisfied). New `UIStrings` keys use the established backward-compat path: required type + `EN_FALLBACK` + `configDefaults.ts`.
- Generation stays offline: QRs are inline `<svg>` (no `src`), the wechat image is a `data:` URI read from disk — neither is touched by `prefetchImages()`, which only rewrites `src="http…"`.
- `content/contact/` reads are constrained with `path.basename()` on the config value (no traversal).
- `generate.ts` must stay importable by `studioApi.ts` without eager-loading Playwright (the `qrcode` import lives in `qr.ts`, which is pure and safe to load eagerly; Playwright stays dynamically imported as today).
- All existing tests must pass unchanged: new template parameters are optional.
- Never render `reserved_for` (not read here).

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/lib/pdfCatalog/contactLinks.ts` | New. Pure resolver: `resolvePlatform`, `resolveContactActionSeed`, `buildItemMailto`, `sanitizeEmail`. Mirrors `PlatformButton.buildUrl` URL formats. |
| `scripts/lib/pdfCatalog/contactLinks.test.ts` | New. Unit tests for all platform URL formats, email sanitization, discord user-link, mailto composition, text fallback. |
| `scripts/lib/pdfCatalog/qr.ts` | New. `renderQrSvg(text): Promise<string>` — thin `qrcode` SVG wrapper. |
| `scripts/lib/pdfCatalog/qr.test.ts` | New. Offline determinism + `<svg>` shape. |
| `scripts/lib/pdfCatalog/template.ts` | Edit. `buildContactPageHtml`, `buildFlyerContactStripHtml`, per-item contact block in `buildItemHtml`, thread contact through `buildFullCatalogHtml`/`buildFlyerHtml`, CSS. New `ContactPdfEntry` type. |
| `scripts/lib/pdfCatalog/template.test.ts` | Edit. Tests for contact page, per-item block (present with seed, absent without), flyer strip, cover→contact→TOC order. |
| `scripts/lib/pdfCatalog/generate.ts` | Edit. `buildContactPdfData()` async assembler; thread `seed`+`entries` into both generators. |
| `scripts/lib/pdfCatalog/generate.test.ts` | Edit. `buildContactPdfData` seed/entries; missing image → text; traversal stripped. |
| `lib/config/types.ts` | Edit. Six new required `UIStrings` keys. |
| `lib/i18n/translations.ts` | Edit. Six new `EN_FALLBACK` English values. |
| `content/config.ts` | Edit. Six new `en` strings (documentation parity). |
| `scripts/lib/configDefaults.ts` | Edit. Register the six keys for `migrate-config`. |
| `package.json` | Edit. `qrcode` + `@types/qrcode` in `devDependencies`. |

---

## Task 1: Add the `qrcode` dependency and the QR wrapper

**Files:** create `scripts/lib/pdfCatalog/qr.ts`, `scripts/lib/pdfCatalog/qr.test.ts`; edit `package.json`.

### Step 1: Install
- [ ] `pnpm add -D qrcode @types/qrcode`

### Step 2: Failing test — `qr.test.ts`
- [ ] `renderQrSvg("https://example.com")` resolves to a string starting with `<svg` and containing `path` data.
- [ ] Same input → identical output (deterministic; no `Date`/random).
- [ ] Runs with no network access (pure computation).

### Step 3: Implement `qr.ts`
```ts
import QRCode from "qrcode";
/** Offline SVG QR. margin:1 keeps the quiet zone tight for a print card. */
export async function renderQrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 1 });
}
```
- [ ] Tests pass.

---

## Task 2: The contact-link resolver (`contactLinks.ts`)

**Files:** create `scripts/lib/pdfCatalog/contactLinks.ts`, `scripts/lib/pdfCatalog/contactLinks.test.ts`.

**Interfaces:** consumes `Platform` (`lib/config/types.ts`); produces `ResolvedPlatform`, `ContactActionSeed`, and mailto/sanitize helpers (see design §5.1).

### Step 1: Failing tests — `contactLinks.test.ts`
- [ ] `resolvePlatform` for each type produces the design §4 URL (email→`mailto:`, instagram→`https://instagram.com/…`, discord→`https://discord.com/users/…`, facebook/linkedin via `normalizeProfilePath`, whatsapp/twitter/tiktok/youtube/snapchat/venmo).
- [ ] `resolvePlatform` on a `qr_image` platform → `{ target: { kind: "image", qrImagePath } }`.
- [ ] `resolvePlatform` on a handle-only platform with no URL pattern (e.g. `zelle`) → `{ target: { kind: "text" } }`.
- [ ] `sanitizeEmail("a@b.com?cc=x")` → `"a@b.com"` (strips injected headers).
- [ ] `resolveContactActionSeed` returns first email + first discord; empty object when neither present.
- [ ] `buildItemMailto("a@b.com","Blue Chair","https://s/x/y")` → `mailto:a@b.com?subject=…Blue%20Chair…&body=…` with the live URL present (decoded) in the body.

### Step 2: Implement
- [ ] Port the `buildUrl` switch and `normalizeProfilePath` from `components/contact/PlatformButton.tsx` into pure functions (no React). Keep the `PLATFORM_LABELS` map for default labels.
- [ ] `displayValue`: the address for email, `@value` for handle platforms, the label for image platforms.
- [ ] All tests pass.

---

## Task 3: Template rendering (`template.ts`)

**Files:** edit `scripts/lib/pdfCatalog/template.ts`, `scripts/lib/pdfCatalog/template.test.ts`.

### Step 1: Failing tests — extend `template.test.ts`
- [ ] `buildItemHtml(item, baseUrl, strategy, t, { email, discordUrl })` renders a `mailto:` `<a>` whose href contains the encoded item name and the live URL, and a Discord `<a>` with the discord URL.
- [ ] `buildItemHtml(...)` **without** a seed (or empty seed) renders no contact block (backward-compat guard).
- [ ] `buildContactPageHtml(entries, t)` contains `t.pdfContactHeading`, each entry's label, inline `<svg>` for `qr` entries, `<img src="data:` for `image` entries, and the plain value for `text` entries; the section carries a page break.
- [ ] `buildFullCatalogHtml(..., contact, contactEntries)` emits the contact page **between** cover and TOC (assert ordering by index of marker substrings), and omits it when `contactEntries` is empty.
- [ ] `buildFlyerContactStripHtml(entries, t)` renders the compact variant.

### Step 2: Implement
- [ ] Add `ContactPdfEntry` union type (design §5.3).
- [ ] Add optional `contact?: ContactActionSeed` param to `buildItemHtml`; append contact block after the existing `.item-link` paragraph when non-empty.
- [ ] Add `buildContactPageHtml`, `buildFlyerContactStripHtml`.
- [ ] Thread `contact?`/`contactEntries?` through `buildFullCatalogHtml` and `buildFlyerHtml`.
- [ ] Extend `CATALOG_CSS`: `.contact-page`, `.contact-grid`, `.contact-card`, `.contact-qr` (fixed width ~128px; flyer ~96px), `.contact-target` (monospace, muted), `.item-contact` block. Keep the paper/ink/accent palette and `page-break-after: always` on the contact page.
- [ ] All tests pass (including untouched existing ones).

---

## Task 4: Generation assembly (`generate.ts`)

**Files:** edit `scripts/lib/pdfCatalog/generate.ts`, `scripts/lib/pdfCatalog/generate.test.ts`.

### Step 1: Failing tests — extend `generate.test.ts` (no Playwright)
- [ ] `buildContactPdfData()` (with a stubbed/curated platform list) returns a `seed` with the email+discord and `entries` with a `qr` entry per URL platform.
- [ ] A `qr_image` platform whose file is **absent** from `content/contact/` degrades to a `text` entry (no throw).
- [ ] A `qr_image` value containing `../` is reduced to its basename before the disk read (traversal guard).

### Step 2: Implement
- [ ] `buildContactPdfData()` per design §5.4: `resolveContactActionSeed`, then per-platform resolve → `renderQrSvg` for URLs, disk-read+base64 for images (guarded by `path.basename`), text fallback otherwise.
- [ ] `generateCatalogPdf`: `const { seed, entries } = await buildContactPdfData();` and pass into `buildFullCatalogHtml`.
- [ ] `generateFlyerPdf`: same, pass into `buildFlyerHtml`.
- [ ] Keep the dynamic Playwright import untouched; `qr.ts`/`contactLinks.ts` are eager-safe pure modules.
- [ ] All tests pass.

---

## Task 5: i18n keys

**Files:** edit `lib/config/types.ts`, `lib/i18n/translations.ts`, `content/config.ts`, `scripts/lib/configDefaults.ts`.

- [ ] Add to `UIStrings` (required `string`): `pdfContactHeading`, `pdfContactIntro`, `pdfContactScanHint`, `pdfItemContactHeading`, `pdfEmailAboutItem`, `pdfMessageOnDiscord`.
- [ ] Add the same six with English values to `EN_FALLBACK` (design §6).
- [ ] Add the six to `content/config.ts`'s `en` block after the existing `pdf*` keys.
- [ ] Append the six to the PDF-chrome entry in `scripts/lib/configDefaults.ts` (matching indentation/trailing commas of `content/config.ts`).
- [ ] `pnpm type-check` passes (confirms EN_FALLBACK/type/config are consistent and no key is missing).

---

## Task 6: Verification (per `superpowers:verification-before-completion`)

- [ ] `pnpm test` — full suite green.
- [ ] `pnpm type-check` — clean.
- [ ] `pnpm lint` — clean (`--max-warnings 0`).
- [ ] **Real render:** temporarily set a discord + email (+ optional wechat image) in a throwaway config or drive `generateCatalogPdf`/`generateFlyerPdf` via a scratch script; confirm the produced PDF has the contact page (page 2) with scannable QRs and per-item mailto/discord links. Revert any throwaway config change.
- [ ] Self code-review pass (`superpowers:requesting-code-review` / `code-review` skill) standing in for the absent human reviewer; address findings.
- [ ] Confirm `git diff develop...HEAD` touches no `studio/**`, no config-write modules, no bilingual `docs/*.md`.

---

## Notes for the implementer

- The live site's `PlatformButton.buildUrl` is the parity reference; a test asserts the ported formats match for the in-scope platforms. If `buildUrl` changes later, update both.
- The contact page is inserted **only** when `contactEntries` is non-empty, so a seller with no platforms sees no change.
- `mailto:` and `https:` `<a>` links survive Chromium print-to-PDF as clickable annotations — that is what makes the per-item actions "quick contact".
