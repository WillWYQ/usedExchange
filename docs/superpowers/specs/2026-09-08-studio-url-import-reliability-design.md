# Design: Making Seller Studio's "Import photos from a URL" work on more real-world sites

**Date:** 2026-09-08
**Branch:** `feature/studio-url-import-reliability` (off `develop`)
**Scope:** Improve the success rate of Studio's existing URL-import feature (`scripts/lib/urlImport.ts`, `scripts/lib/ssrfGuard.ts`, `scripts/lib/studioApi.ts`, `studio/src/panes/NewItemDialog.tsx`) on sites where it currently returns zero photos, plus a related hotlink/thumbnail-preview bug found while investigating.
**Out of scope:** The item-creation flow itself, the manual upload flow, `pnpm fb-export`, any change to how downloaded photos are stored/sniffed/sanitized (that pipeline is reused as-is).
**Doc convention:** English-only (this is a `docs/superpowers/specs/*` file, not one of the bilingual top-level `docs/*.md` files governed by CLAUDE.md Rule 2). Chat with the seller for this feature was conducted in Chinese per their request; this artifact follows the established English-only convention for this directory (see `2026-08-17-studio-pdf-contact-accessibility-design.md`).

---

## 1. Background

Studio can create an item by pasting a product/listing URL instead of uploading photos by hand (shipped in commit `ba8a3fb`, `feat(studio): import item photos from a product URL`). The flow: `POST /api/import-url/preview` fetches the page server-side through `fetchUrlSafely` (SSRF-guarded) and runs `extractImportCandidates` — a deliberate **regex/string scan of static HTML**, not a DOM parser or JS engine — to guess a name and a list of candidate photo URLs. The seller picks photos, then `POST /api/items/<cat>/<item>/images/import` downloads only the chosen ones through the same safe-fetch path.

The seller reports this "doesn't work for a lot of sites." This design starts from a live investigation of the actual code, followed by two rounds of clarifying questions with the seller.

## 2. Clarifying questions — answered

1. **Symptom:** "Fetch page" returns 0 photos and no detected name. (Not the other candidate symptoms offered: broken thumbnails, or photos found-but-fail-on-download.)
2. **Target sites:** international marketplaces (eBay, Facebook Marketplace, Depop, Mercari), "tried all kinds," plus explicitly named **Amazon and Costco**.
3. **Acceptable fix weight:** seller is willing to accept a headless-browser fallback (e.g. Playwright) despite the dependency weight.
4. **Thumbnail hotlink bug** (found during investigation, not the seller's original complaint): seller wants it fixed in the same change.
5. **Headless-path DNS-rebinding residual risk** (found during investigation): seller accepts the residual risk rather than building a local pinning proxy now.

## 3. Root cause

`extractImportCandidates` only ever sees whatever HTML `fetchUrlSafely` receives from a plain, non-JS HTTP GET. Two distinct failure modes both present as "zero images, no name":

- **Client-rendered galleries.** Facebook Marketplace, Depop, Mercari, and similar SPAs populate their photo gallery via client-side JS after the initial HTML loads. The static HTML has nothing to regex-scan.
- **Bot-defended pages.** Amazon and Costco both run aggressive bot-management. A plain HTTP request with a non-browser `User-Agent` and no browser-like headers is a plausible candidate for a CAPTCHA/interstitial response — which is real HTML, but not the product page, so it also extracts to zero images.

A third, separate bug (not the seller's reported symptom, found by reading `NewItemDialog.tsx`): the picker's thumbnail grid renders `<img src={candidateUrl}>` directly in the seller's browser. Any site with hotlink protection (Referer allow-listing on its CDN) 403s that request, showing a broken-image icon even when the URL is perfectly downloadable server-side.

## 4. Goals / Non-goals

**Goals:**
- Recover candidates on JS-rendered pages via a safe, opt-in headless-render fallback.
- Improve compatibility of the existing plain-HTTP path with better headers and a `Referer` on image downloads (hotlink protection).
- Always leave the seller a working path to finish the job, even on sites where automated extraction is a lost cause (Amazon/Costco-class bot defense, or a login wall).
- Fix the thumbnail hotlink/broken-image bug in the picker.
- Keep the SSRF guarantee intact across every new code path — no exceptions.
- Keep `pnpm install` light for sellers who never touch this feature.

**Non-goals:**
- Defeating enterprise bot-management (Akamai/PerimeterX/Amazon's own stack) via fingerprint spoofing, stealth plugins, or a stealth arms race. See §10 (Known limitations) — this is a deliberate line, not an oversight.
- A local DNS-pinning forward proxy for Chromium traffic (residual risk accepted per §2.5 — see §6.3).
- A new `content/config.ts` toggle for this feature (see §7 — the optional dependency's presence *is* the toggle).
- Any change to `extractImportCandidates`'s actual filtering/ranking rules — both fetch tiers feed it unchanged.

## 5. Architecture: two-tier fetch

```
seller pastes URL
        │
        ▼
Tier 1: fetchUrlSafely(url)  ──────────────► extractImportCandidates(html, finalUrl)
   (plain HTTP, ~instant,                          │
    unchanged code path)                    images.length > 0? ──yes──► return candidates
                                                    │
                                                   no
                                                    ▼
                                    Tier 2: renderWithHeadlessBrowser(finalUrl)
                                       (SSRF-guarded Chromium, only runs
                                        when Tier 1 found nothing)
                                                    │
                                    available? ──no──► return Tier-1's (empty) result
                                        │                + headlessUnavailable: true
                                       yes
                                        ▼
                          extractImportCandidates(renderedHtml, renderedFinalUrl)
                                        │
                                        ▼
                              return candidates + usedHeadlessFallback: true
```

Tier 1 is untouched in behavior for any site that already works today — zero added latency, zero new dependency on the fast path. Tier 2 only ever runs on the confirmed-failing case (`images.length === 0`), and reuses `extractImportCandidates` unchanged: the only thing that differs between tiers is *how the HTML string was obtained*, not how it's parsed. This keeps exactly one extraction/filtering implementation to maintain and test.

## 6. Headless rendering module (`scripts/lib/headlessImport.ts`, new)

### 6.1 Shape

```ts
export type HeadlessRenderResult =
  | { available: true; html: string; finalUrl: string }
  | { available: false; reason: "not-installed" | "launch-failed" | "navigation-failed" };

export async function renderWithHeadlessBrowser(
  url: string,
  options: { timeoutMs: number },
): Promise<HeadlessRenderResult>;

// Test-only injection seam, mirrors ssrfGuard.ts's __setDnsLookupForTests.
export function __setHeadlessRendererForTests(
  fn: typeof renderWithHeadlessBrowser | null,
): void;
```

`renderWithHeadlessBrowser` never throws — same "degrade to empty, don't crash the request" philosophy as `urlImport.ts`. `{ available: false, reason: "not-installed" }` is returned the moment `import("playwright-core")` fails to resolve, before any launch is attempted.

### 6.2 Lifecycle

A module-level `Browser` instance is launched lazily on first use and kept warm for the life of the Studio server process (avoids paying Chromium's ~1-2s cold-launch cost on every single import). Each call gets its own fresh incognito `BrowserContext` + `Page` (no cookie/storage leakage between unrelated imports), closed in a `finally` after content is captured or the attempt fails. The shared `Browser` itself is not closed per-request.

Navigation uses `page.goto(url, { waitUntil: "networkidle", timeout })`; a navigation timeout is caught and treated as non-fatal — `page.content()` is still read from whatever state was reached, consistent with "degrade to fewer/no results, don't throw."

The browser context is launched with no UA override — Chromium's own real, default `User-Agent` is sent as-is. This is deliberately different from Tier 1's self-identifying UA (§8): a genuine browser engine is genuinely doing the rendering here, so presenting as one is accurate, not spoofing. The one hardening applied at launch is disabling the standard `navigator.webdriver` automation flag (`--disable-blink-features=AutomationControlled`) — a broad, well-known, non-targeted signal, not aimed at any specific vendor's defenses. Nothing further in the stealth direction (§10, §18).

### 6.3 Security: SSRF protection extends to the browser path

This is the part that needed the most care. `fetchUrlSafely` normally resolves DNS, validates every resolved address against loopback/private/link-local/cloud-metadata/multicast ranges, then **pins the actual socket** to the validated address — closing the DNS-rebinding TOCTOU gap a naive check-then-connect would leave open. A headless browser does its own networking; calling `page.goto()` directly would silently bypass all of that for a malicious pasted URL (or a redirect) trying to reach the seller's own local network.

To preserve the guarantee:

- **`ssrfGuard.ts` is refactored** to expose the address-validation step as its own reusable function, independent of the throw-based `resolveAndValidate` used by the plain-fetch path:
  ```ts
  export async function isHostnameAllowed(
    hostname: string,
  ): Promise<{ allowed: true } | { allowed: false; reason: string }>;
  ```
  `resolveAndValidate` becomes a thin wrapper that calls this and throws `SsrfError` on `allowed: false`. One validation implementation, shared by both fetch paths — they cannot drift apart.
- **Every request Chromium makes is intercepted** via `context.route("**/*", handler)`. Resource types `image`, `media`, `font`, `stylesheet`, `websocket`, `manifest`, `other` are aborted outright — extraction only needs resolved `src` attribute *strings*, never the actual bytes (those are downloaded later through the existing safe pipeline), so blocking them costs nothing and shrinks the attack surface. For the resource types that must load for JS-rendering to work (`document`, `script`, `xhr`, `fetch`, `eventsource`), the handler resolves the request's hostname through `isHostnameAllowed` and aborts if disallowed. Because each redirect hop generates its own new intercepted request, redirects are re-validated automatically — the same "no exceptions, re-check every hop" property `fetchUrlSafely` already has.
- **Accepted residual gap (seller sign-off obtained, §2.5):** Chromium performs its own DNS resolution at actual connect time, a moment after `isHostnameAllowed` ran. Unlike the pinned-socket plain-fetch path, there is no hook to force Chromium's connection onto the literal address we validated — a narrowly-timed DNS-rebinding attack (the attacker's DNS server changes its answer between our check and Chromium's connect) is theoretically possible in the headless path only. Closing this fully would require a local forward proxy that Chromium's traffic is routed through, so *that* proxy — not Chromium — does the resolve-validate-pin dance. Given the threat model this guard exists for ("a remote page tries to reach the seller's own machine," documented in `ssrfGuard.ts`'s own comments) and that only the seller ever supplies the URL, this gap is accepted and documented rather than built around, for now. Flagged here as a known follow-up if the risk tolerance ever changes.

### 6.4 Trigger condition

Tier 2 runs if and only if Tier 1's `images.length === 0`, regardless of whether a name was found. This is a direct, simple match to the confirmed symptom and keeps the fast path fast for every site that isn't broken.

## 7. Optional dependency, kept off the default install path

`playwright-core` is a small JS package with no bundled browser and no postinstall download — safe to add as a normal `devDependency` with effectively zero cost to `pnpm install`. The actual Chromium binary (the heavy part, ~100-300MB) is a separate, explicit download that only happens when the seller runs a new one-time command:

```
pnpm setup-url-import
```

matching the existing opt-in-setup convention (`pnpm setup-ui`, `pnpm configure-image-cors`). Implementation: `scripts/setup-url-import.sh`, which installs the Chromium build matching the exact `playwright-core` version pinned in `package.json` (version alignment matters — `playwright-core` resolves browsers from a version-keyed cache directory, so a mismatched installer version would silently not find the binary it just downloaded).

If Chromium isn't installed, Tier 2 returns `{ available: false, reason: "not-installed" }` and Studio surfaces this to the seller as an actionable hint (§9) rather than failing silently or crashing. No new `content/config.ts` field: whether the optional dependency is present *is* the on/off switch, which is simpler than adding and documenting a redundant config toggle for the same thing.

## 8. Referer and header realism (`ssrfGuard.ts`)

Two independent, additive changes to `fetchUrlSafely`:

- **`SafeFetchOptions` gains `referer?: string`.** When present, sent as the `Referer` header. Threaded through for image downloads specifically (see §11.2) — hotlink protection commonly checks that the `Referer` matches the site the image was linked from, and today's download path sends none at all.
- **Default headers gain `Accept`, `Accept-Language`, and `Accept-Encoding: gzip, deflate, br`.** These are honest, complete-HTTP-request headers, not identity spoofing (the `User-Agent` stays the existing self-identifying `UsedExchangeStudio/1.0 (+local seller tool)` for this plain-fetch tier — misrepresenting a non-JS HTTP client as a full browser has limited ROI against real bot detection and a real honesty cost; the *headless* tier is where a genuine browser UA is truthful, because a real browser engine is genuinely doing the rendering there). Advertising `Accept-Encoding` means responses may now arrive compressed — `fetchUrlSafely` decompresses based on the actual `Content-Encoding` response header (gzip/deflate/br via Node's built-in `zlib`; absent/identity is a no-op) before returning bytes.

## 9. Manual "paste a photo URL" escape hatch (new, `NewItemDialog.tsx`)

A small textarea in the URL-import picker, always available, for pasting one or more direct image URLs by hand (newline- or comma-separated). This is the guaranteed fallback for sites no amount of automated extraction will ever reliably beat — Amazon and Costco specifically, per the seller's own examples (§10). Pasted URLs are validated client-side (`new URL()`, must be `http`/`https`), deduped against existing candidates, and merged into `candidateImages` + `selectedImages` (auto-selected, same reasoning as extracted candidates: a seller who deliberately pastes a URL wants it imported). No new server endpoint — downloads go through the existing `importImagesFromUrls` → `handleImageImport` pipeline unchanged, so they get the same sniff/sanitize/write treatment and the same `Referer` treatment as extracted candidates (§11.2).

## 10. Known limitations (setting expectations up front)

- **Amazon and Costco may still fail even with the headless fallback.** Both run enterprise-grade bot management that fingerprints far more than headers or basic JS execution (TLS fingerprint, `navigator.webdriver`, timing patterns, etc.). Vanilla Playwright is not a reliable answer to that, and building a dedicated evasion suite against a specific commercial vendor's defenses is out of scope (§4 Non-goals) — that's a maintenance arms race disproportionate to a personal local tool, not a one-time fix. The manual paste-URL escape hatch (§9) is the intended answer for these: if the seller can see the photo in their own logged-in browser, they can always get it in.
- **Facebook Marketplace listings behind a login wall** will render a login page, not the listing, under headless rendering too — no scraping technique fixes this without real session cookies, which this feature will not handle. Same escape hatch applies.
- **Only one, non-targeted hardening step is applied** to the headless browser — see §6.2. Nothing further in the stealth direction.

## 11. API contract changes

### 11.1 `POST /api/import-url/preview`

Response gains two fields:

```ts
type ImportUrlPreview = {
  name: string | null;
  images: string[];
  usedHeadlessFallback: boolean;   // Tier 2 ran
  headlessUnavailable: boolean;    // Tier 2 wanted to run but Chromium isn't installed
};
```

### 11.2 `POST /api/items/<category>/<item>/images/import`

Request body gains an optional field, applying to the whole batch (every URL in one call comes from the same preview/page in the current UI flow):

```ts
const importImagesBodySchema = z.object({
  urls: z.array(z.string().min(1)).min(1).max(IMPORT_MAX_URLS_PER_REQUEST),
  sourceUrl: z.string().min(1).optional(),
});
```

`handleImageImport` passes `referer: sourceUrl` to each `fetchUrlSafely` call.

### 11.3 `POST /api/import-url/thumbnail` (new)

Request: `{ url: string; sourceUrl?: string }`. Response: the raw image bytes with the sniffed `Content-Type` (a binary passthrough, not JSON) — or a JSON `{ error }` on failure, mirroring the other routes' error shape.

**Why POST, not a `GET .../thumbnail?url=...`:** `checkStudioCsrf` (`studio/csrfGuard.ts`) deliberately exempts `GET`/`HEAD`, reasoning that Vite's own CORS/`allowedHosts` checks "already cover reads." That reasoning holds for routes that only read the seller's own local content — it does **not** hold for a route whose side effect is an *outbound network fetch of an attacker-influenced URL*. A bare `<img src="http://127.0.0.1:<port>/api/import-url/thumbnail?url=...">` embedded on any unrelated page the seller happens to have open in another tab would fire with no preflight, no CORS check gating whether it fires (CORS only gates whether the response can be *read* by cross-origin JS, and a plain `<img>` tag never reads it) — reintroducing exactly the class of hole `csrfGuard.ts` exists to close, via a different HTTP method. `ssrfGuard.ts` would still block internal targets, but the seller's machine could be made to originate blind requests to arbitrary *external* attacker-chosen URLs. Keeping this endpoint as CSRF-protected POST (matching every other networked route in this file) closes that off entirely. The client fetches each thumbnail via `fetch()` (POST) → `res.blob()` → `URL.createObjectURL()`, revoked on unmount/replacement.

Bounded concurrency comes for free: all ~40 candidate thumbnails now request the *same local origin*, so the browser's own per-origin connection cap (~6 concurrent in most browsers) naturally throttles both the client requests and, transitively, the server's fan-out to the various remote hosts — no hand-rolled semaphore needed.

## 12. UI error-messaging states (`NewItemDialog.tsx`)

When the preview returns `images.length === 0`:

| Condition | Message |
|---|---|
| `headlessUnavailable === true` | This page may need JavaScript to show photos. Run `pnpm setup-url-import` once to enable deeper import, then retry — or paste a photo link directly below. |
| `headlessUnavailable === false` (Tier 2 ran — since the trigger for reaching this branch at all is "Tier 1 found zero images," `false` here always means Tier 2 was attempted and also found nothing) | Couldn't find photos on this page automatically (it may block automated access, or require login). Paste a photo link directly below. |

Both states point at the same always-available escape hatch (§9) rather than dead-ending the seller.

## 13. i18n

New/changed keys in both `studio/src/i18n/strings.en.ts` and `strings.zh.ts` (bilingual — this pair is source-code i18n data, not a `docs/*.md` file, but the seller-facing-text principle is the same and both files are edited together as usual for this codebase):

- Replace `newItem.url.noImages` with the two conditional messages in §12.
- `newItem.url.pasteUrls.label`, `.placeholder`, `.add`, `.invalid` (validation error when no pasted line parses as a URL).
- A loading-state label reused for the (now potentially slower, up to the headless timeout) fetch attempt — existing `newItem.url.fetching` is fine as-is; no separate "trying deeper import…" sub-state is planned (the request is a single round trip; the client has no signal to distinguish "fast path is slow" from "fallback in progress" without adding a streaming/progress mechanism, which is disproportionate to this need).

## 14. Testing strategy

- **`scripts/lib/ssrfGuard.test.ts`:** cases for the new `isHostnameAllowed` export (existing `resolveAndValidate`/`fetchUrlSafely` tests should pass unchanged since it's a refactor, not a behavior change), the `referer` header being sent when provided and absent when not, and gzip/deflate/br response decompression against a local test server.
- **`scripts/lib/headlessImport.test.ts`** (new): unit tests against **mocked** Playwright objects (route/request interception decisions — resource-type blocking, hostname allow/deny via a stubbed `isHostnameAllowed`) so the security-critical interception logic is covered deterministically without a real browser. `{ available: false, reason: "not-installed" }` is tested by simulating the dynamic import failure. A small number of real-Chromium smoke tests are gated behind an opt-in env var and **not** part of default `pnpm test` / CI — consistent with keeping CI fast and not requiring a Chromium download on every run.
- **`scripts/lib/studioApi.test.ts`:** two-tier trigger logic using `__setHeadlessRendererForTests` (Tier 2 only invoked when Tier 1 finds zero images; response flags set correctly in each branch), `sourceUrl` → `referer` threading in `handleImageImport`, and the new thumbnail route's CSRF/validation/error-shape behavior.
- **`studio/src/api.test.ts`:** the new thumbnail-fetch client function returns a `Blob` on success and throws the server's `{ error }` message on failure, matching this file's existing per-function test pattern.
- **`studio/src/panes/NewItemDialog.test.tsx`:** the two new conditional messages render correctly based on preview-response flags, the manual paste-URL textarea's parsing/validation/dedup/merge-into-selection behavior, and thumbnail blob-URL lifecycle (created on mount, revoked on unmount — no leaked object URLs).

## 15. Iron-Rule compliance (CLAUDE.md)

1. **`content/` folder rule:** N/A — no seller-content files touched by this feature.
2. **Bilingual doc sync:** `docs/CURRENT_FUNCTIONALITY.md`, `docs/DESIGN.md`, `docs/TECH_REQUIREMENTS.md`, and `docs/SCRIPTS.md` all currently describe URL-import and/or the `pnpm setup-*` script family — all four **and their `_zh` counterparts** need updates during implementation (new route, new script, new known-limitations note, updated response/body shapes). Tracked explicitly in §16.
3. **App code is live:** this is exactly the kind of explicitly-requested feature change Rule 3 allows.
4. **`reserved_for` never rendered:** untouched by this feature.
5. **`image-manifest.json` stays in git:** untouched.
6. **`lib/utils/pricing.ts` has no `"use client"`:** untouched.
7. **Mark phases complete:** N/A — this enhances already-shipped Studio functionality (Phases 0-18 are all already complete); no new phase entry is being added to `IMPLEMENTATION_PLAN.md`.
8. **New config fields must be backward-compatible:** N/A by design — §7 deliberately adds no `content/config.ts` field.

## 16. Docs to update during implementation (bilingual, per CLAUDE.md Rule 2)

- `docs/CURRENT_FUNCTIONALITY.md` / `_zh`: describe the two-tier fetch, the manual paste-URL escape hatch, the `pnpm setup-url-import` command, and the Amazon/Costco/login-wall known limitation.
- `docs/DESIGN.md` / `_zh` (§22, Seller Studio): headless-fallback architecture, the extended SSRF model, the new thumbnail route.
- `docs/TECH_REQUIREMENTS.md` / `_zh` (§29-30 area): updated `POST /api/import-url/preview` response shape, updated images/import body shape, new `POST /api/import-url/thumbnail` contract.
- `docs/SCRIPTS.md` / `_zh`: new `pnpm setup-url-import` entry, matching the existing `pnpm setup-ui` / `pnpm configure-image-cors` style.
- `.claude/CLAUDE.md`'s "Common Seller Tasks" table: add the new script row.

## 17. Files touched (implementation-plan input)

**New:**
- `scripts/lib/headlessImport.ts` + `.test.ts`
- `scripts/setup-url-import.sh`

**Edited:**
- `scripts/lib/ssrfGuard.ts` (+ `.test.ts`) — `isHostnameAllowed` export, `referer` option, header realism, decompression.
- `scripts/lib/studioApi.ts` (+ `.test.ts`) — two-tier orchestration, `sourceUrl`/referer threading, new thumbnail route.
- `studio/src/api.ts` (+ `.test.ts`) — updated `previewImportUrl`/`importImagesFromUrls` types, new thumbnail-fetch client function.
- `studio/src/panes/NewItemDialog.tsx` (+ `.test.tsx`) — new messaging states, paste-URL textarea, thumbnail blob-URL rendering.
- `studio/src/i18n/strings.en.ts`, `strings.zh.ts` — new/changed keys (§13).
- `package.json` — `playwright-core` devDependency, `setup-url-import` script.
- Docs listed in §16.

## 18. Out of scope (this change)

- Stealth/anti-detection engineering against specific bot-defense vendors (§10).
- A local DNS-pinning forward proxy for the headless path (§6.3 — accepted residual risk instead).
- A `content/config.ts` toggle for this feature (§7).
- Any change to `extractImportCandidates`'s parsing/ranking rules.
