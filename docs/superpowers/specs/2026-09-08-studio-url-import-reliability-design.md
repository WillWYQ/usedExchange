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

**Where eBay fits (gap found by a fifth review pass, §23):** eBay was one of the four sites named in §2.2 but was never placed in either bucket above. Unlike Facebook Marketplace/Depop/Mercari, eBay listings are generally server-rendered with real `og:image`/JSON-LD product data (eBay wants its listings indexable), so it more plausibly belongs with the sites Tier 1 already handles reasonably, or that Tier 2 recovers if a particular listing template doesn't. It isn't expected to need the Amazon/Costco-class bot-defense treatment in §10 — noted here so that section doesn't read as silently expecting eBay to keep failing.

## 4. Goals / Non-goals

**Goals:**
- Recover candidates on JS-rendered pages via a safe, opt-in headless-render fallback.
- Improve compatibility of the existing plain-HTTP path with better headers and a `Referer` on image downloads (hotlink protection).
- Always leave the seller a working path to finish the job, even on sites where automated extraction is a lost cause (Amazon/Costco-class bot defense, or a login wall).
- Fix the thumbnail hotlink/broken-image bug in the picker.
- Keep the SSRF guarantee intact across every new code path — no exceptions.
- Add zero new install-time cost — see §7: this reuses an already-present dependency rather than adding one.

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
                                        │                + usedHeadlessFallback: true
                                        │                + headlessFailureReason:
                                        │                    "not-installed" | "navigation-failed"
                                       yes
                                        ▼
                          extractImportCandidates(renderedHtml, renderedFinalUrl)
                                        │
                                        ▼
                     return candidates + usedHeadlessFallback: true
                            + headlessFailureReason: null (or "navigation-failed"
                              if candidates still came back empty — §11.1)
```

Tier 1 is untouched in behavior for any site that already works today — zero added latency, zero new dependency on the fast path. Tier 2 only ever runs on the confirmed-failing case (`images.length === 0`), and reuses `extractImportCandidates` unchanged: the only thing that differs between tiers is *how the HTML string was obtained*, not how it's parsed. This keeps exactly one extraction/filtering implementation to maintain and test.

## 6. Headless rendering module (`scripts/lib/headlessImport.ts`, new)

### 6.1 Shape

```ts
export type HeadlessRenderResult =
  | { available: true; html: string; finalUrl: string }
  | { available: false; reason: "not-installed" | "navigation-failed" };
// "not-installed" covers everything launchChromiumOrError() collapses into
// its one generic { error } case (missing package, missing Chromium binary,
// or any other launch-time failure) — it doesn't distinguish these itself,
// and the actionable advice is the same either way (§7), matching how the
// PDF-export feature already treats this same function's error today.
// "navigation-failed" is reserved for a failure *after* a successful
// launch that isn't a plain timeout (a timeout is non-fatal, per §6.2).

export async function renderWithHeadlessBrowser(
  url: string,
  options: { timeoutMs: number },
): Promise<HeadlessRenderResult>;

// Test-only injection seam, mirrors ssrfGuard.ts's __setDnsLookupForTests.
export function __setHeadlessRendererForTests(
  fn: typeof renderWithHeadlessBrowser | null,
): void;
```

`renderWithHeadlessBrowser` never throws — same "degrade to empty, don't crash the request" philosophy as `urlImport.ts`. `{ available: false, reason: "not-installed" }` is returned the moment launching Chromium fails (package or binary missing — see §7), before any navigation is attempted.

### 6.2 Lifecycle, and reusing the existing Chromium launcher

**Correction from the independent design review (see §19):** the first draft of this section proposed launching Chromium via a brand-new `playwright-core` dependency. That was wrong — this repo already depends on the full `playwright` package (`package.json`, used by `scripts/lib/pdfCatalog/generate.ts` for the "Export catalog PDF" feature) and already has exactly the lazy-launch-with-friendly-error pattern this module needs, in `launchChromiumOrError()`. This design now **extracts that function** out of `pdfCatalog/generate.ts` into a small new shared module, `scripts/lib/chromiumLauncher.ts`, with the same signature it has today:

```ts
export async function launchChromiumOrError(): Promise<{ browser: Browser } | { error: string }>;
```

Both `pdfCatalog/generate.ts` (unchanged behavior, now importing from the shared location) and `headlessImport.ts` (new) depend on this one module — one Playwright dependency, one Chromium install, one lazy-import/friendly-error pattern, shared by both features instead of duplicated. A seller who already ran the PDF export's one-time Chromium setup gets URL-import's fallback working for free, and vice versa.

**What "shared" does and doesn't mean (correction from a second review pass, see §20).** `launchChromiumOrError()` keeps its exact existing contract unchanged: a stateless factory that launches a *fresh* browser on every call — that's what `pdfCatalog/generate.ts`'s two existing callers (`generateCatalogPdf`, `generateFlyerPdf`) already rely on, each launching-and-closing its own instance per PDF render. The extraction shares the *package, the Chromium install, and the launch/friendly-error code* between the two features — it does not, by itself, share one running browser *process*. `headlessImport.ts` layers its own caching on top: it calls `launchChromiumOrError()` once and keeps the resulting `Browser` in a module-level variable for the life of the Studio server process (avoiding Chromium's ~1-2s cold-launch cost on every import) — a plain PDF export happening around the same time still launches its own separate, short-lived process, that's fine, just worth being precise that it isn't literally the same one.

**How "the cached instance died" is actually detected (specified per a fourth review pass, §22).** The first three revisions of this section said the cache gets replaced "if a later operation fails because the cached browser was closed or crashed" without saying how that's told apart from an ordinary navigation timeout on a perfectly healthy browser — both would otherwise just be a caught exception, and guessing which one happened from the exception alone is fragile. Playwright answers this directly: `Browser.isConnected(): boolean` and a `'disconnected'` event (confirmed present on this repo's pinned `playwright-core`) report the browser's own liveness independently of any particular page or navigation. The module checks `isConnected()` before reusing the cached instance for a new render (cheap, synchronous, no ambiguity with a navigation-level failure), and also registers a `'disconnected'` listener on launch that clears the cached reference immediately, so a browser that dies between requests (crash, OOM-kill) is detected proactively rather than only discovered the next time something tries to use it. Either way, the next call to `renderWithHeadlessBrowser` sees no valid cached instance and calls `launchChromiumOrError()` again — liveness of the *browser resource* is now decoupled entirely from whether any individual *navigation* succeeded, so a timeout on a healthy browser is never mistaken for a dead one. A `{ error }` result from `launchChromiumOrError()` maps to `{ available: false, reason: "not-installed" }`. Each call to `renderWithHeadlessBrowser` gets its own fresh incognito `BrowserContext` + `Page` (no cookie/storage leakage between unrelated imports), closed in a `finally` after content is captured or the attempt fails. The shared `Browser` itself is not closed per-request.

Navigation uses `page.goto(url, { waitUntil: "networkidle", timeout })`; a navigation timeout is caught and treated as non-fatal — `page.content()` is still read from whatever state was reached, consistent with "degrade to fewer/no results, don't throw."

The browser context is launched with no UA override — Chromium's own real, default `User-Agent` is sent as-is. This is deliberately different from Tier 1's self-identifying UA (§8): a genuine browser engine is genuinely doing the rendering here, so presenting as one is accurate, not spoofing. The one hardening applied at launch is disabling the standard `navigator.webdriver` automation flag (`--disable-blink-features=AutomationControlled`) — a broad, well-known, non-targeted signal, not aimed at any specific vendor's defenses. Nothing further in the stealth direction (§10, §18).

### 6.3 Security: SSRF protection extends to the browser path

This is the part that needed the most care. `fetchUrlSafely` normally resolves DNS, validates every resolved address against loopback/private/link-local/cloud-metadata/multicast ranges, then **pins the actual socket** to the validated address — closing the DNS-rebinding TOCTOU gap a naive check-then-connect would leave open. A headless browser does its own networking; calling `page.goto()` directly would silently bypass all of that for a malicious pasted URL (or a redirect) trying to reach the seller's own local network.

To preserve the guarantee:

- **`ssrfGuard.ts` is refactored** to expose the address-validation step as its own reusable function, independent of the throw-based `resolveAndValidate` used by the plain-fetch path. **Corrected per §19:** the first draft of this function returned only an `allowed` boolean, which would have forced `resolveAndValidate` to either duplicate the DNS lookup afterward (reopening a TOCTOU gap *in the currently-safe, pinned Tier-1 path*) or stopped being a real "thin wrapper" as claimed. The resolved address must travel with the allow/deny answer so Tier 1's existing pinning behavior needs no second lookup:
  ```ts
  export async function checkHostnameAllowed(
    hostname: string,
  ): Promise<
    | { allowed: true; address: string; family: 4 | 6 }
    | { allowed: false; reason: string }
  >;
  ```
  `resolveAndValidate` becomes a genuinely thin wrapper: call this, throw `SsrfError(reason)` on `allowed: false`, otherwise return `{ address, family }` exactly as it does today — same one DNS lookup, same pinning, zero behavior change for the plain-fetch path. The headless path calls the same function for its own per-request checks (§ below) but, per the accepted residual gap, has no way to force Chromium to connect to the literal `address` it gets back — only the plain-fetch path can use that part of the answer.

  **A requirement the type signature alone doesn't communicate (added per a second review pass, §20):** today's `resolveAndValidate` resolves a hostname to *every* address DNS returns and rejects if *any* of them is disallowed — a hostname resolving to a mix of public and private addresses is treated as fully untrustworthy (`ssrfGuard.test.ts` locks this in explicitly), even though only the *first* address is ever actually used for the connection. `checkHostnameAllowed` must carry this exact behavior forward: resolve the full address list, validate every entry, return `allowed: false` on the first disallowed hit found anywhere in that list, and only on a clean pass return the first address for pinning. An implementation that reads the two-branch return type and validates only the one address it ends up returning would silently reopen this multi-address case — the signature shows *what* comes back, not that *every resolved address* must be checked to get there, so this needs to be explicit in the implementation, not left implicit.
- **Every HTTP(S) request Chromium makes is intercepted** via `context.route("**/*", handler)`. Resource types `image`, `media`, `font`, `stylesheet`, `manifest`, `other` are aborted outright — extraction only needs resolved `src` attribute *strings*, never the actual bytes (those are downloaded later through the existing safe pipeline), so blocking them costs nothing and shrinks the attack surface. For the resource types that must load for JS-rendering to work (`document`, `script`, `xhr`, `fetch`, `eventsource`), the handler resolves the request's hostname through `checkHostnameAllowed` and aborts if disallowed. Because each redirect hop generates its own new intercepted request, redirects are re-validated automatically — the same "no exceptions, re-check every hop" property `fetchUrlSafely` already has.
- **WebSocket connections are a separate mechanism, not covered by `context.route()`.** Playwright's generic `route()`/`context.route()` API does not intercept WebSocket handshakes at all — a known, documented Playwright limitation, which is why a dedicated `context.routeWebSocket()` API exists. This module registers a `routeWebSocket()` handler that never calls the route's `connectToServer()`. **Precision correction from a second review pass (§20):** this doesn't make the WebSocket visibly "fail" or get rejected from the page's point of view — Playwright mocks the connection as having opened successfully and simply never forwards anything to (or from) a real server. The security property that actually matters still holds exactly as intended: no real socket to any address, internal or external, is ever opened, which is a full, simple block — appropriate here since photo-gallery extraction never needs a live WebSocket. (Implementation note: `routeWebSocket()` matches its pattern as a glob by default, and a glob does not handle the `wss://` scheme cleanly — confirmed as a known, maintainer-acknowledged issue — so the actual handler should register a regex pattern, not a bare URL string, to reliably match every WebSocket regardless of scheme. Worker-originated WebSocket connections were checked separately and do not bypass this — they fail closed rather than reaching a real server unrouted.) Blocking every WebSocket outright — rather than trying to allow/deny individual ones by hostname the way HTTP requests are handled — avoids relying on interception behavior this module cannot fully verify hostname-by-hostname.
- **Accepted residual gap (seller sign-off obtained, §2.5):** Chromium performs its own DNS resolution at actual connect time, a moment after `checkHostnameAllowed` ran. Unlike the pinned-socket plain-fetch path, there is no hook to force Chromium's connection onto the literal address we validated — a narrowly-timed DNS-rebinding attack (the attacker's DNS server changes its answer between our check and Chromium's connect) is theoretically possible in the headless path only. Closing this fully would require a local forward proxy that Chromium's traffic is routed through, so *that* proxy — not Chromium — does the resolve-validate-pin dance. Given the threat model this guard exists for ("a remote page tries to reach the seller's own machine," documented in `ssrfGuard.ts`'s own comments) and that only the seller ever supplies the URL, this gap is accepted and documented rather than built around, for now. Flagged here as a known follow-up if the risk tolerance ever changes.

### 6.4 Trigger condition

Tier 2 runs if and only if Tier 1's `images.length === 0`, regardless of whether a name was found. This is a direct, simple match to the confirmed symptom and keeps the fast path fast for every site that isn't broken.

## 7. No new dependency — reusing what PDF export already installs

**This entire section was wrong in the first draft and is rewritten per §19.** `playwright` (the full package, not `-core`) is already a `devDependency` in `package.json`, already used by `scripts/lib/pdfCatalog/generate.ts` for the "Export catalog PDF" feature, and its one-time Chromium install step is already documented — `docs/SCRIPTS.md`: "Catalog PDF export... renders via headless Chromium. One-time setup: `npx playwright install chromium`." There is no new dependency to add, no version-alignment problem to solve, and no new setup script to build or document — §6.2's extraction of `launchChromiumOrError()` into a shared `scripts/lib/chromiumLauncher.ts` means URL-import's headless fallback rides the exact same package and the exact same already-documented one-time command as PDF export.

If Chromium isn't installed, `launchChromiumOrError()` returns `{ error }` today (surfaced by the PDF feature as "PDF renderer not installed. Run: npx playwright install chromium"); `headlessImport.ts` maps that same result to `{ available: false, reason: "not-installed" }`, and Studio surfaces a URL-import-appropriate version of the same hint (§12) pointing at the same command. No new `content/config.ts` field: whether Chromium is installed *is* the on/off switch, exactly as it already is for PDF export — one existing pattern, now serving two features.

## 8. Referer and header realism (`ssrfGuard.ts`)

Two independent, additive changes to `fetchUrlSafely`:

- **`SafeFetchOptions` gains `referer?: string`.** When present, sent as the `Referer` header. Threaded through for image downloads specifically (see §11.2) — hotlink protection commonly checks that the `Referer` matches the site the image was linked from, and today's download path sends none at all.
- **Default headers gain `Accept`, `Accept-Language`, and `Accept-Encoding: gzip, deflate, br`.** These are honest, complete-HTTP-request headers, not identity spoofing (the `User-Agent` stays the existing self-identifying `UsedExchangeStudio/1.0 (+local seller tool)` for this plain-fetch tier — misrepresenting a non-JS HTTP client as a full browser has limited ROI against real bot detection and a real honesty cost; the *headless* tier is where a genuine browser UA is truthful, because a real browser engine is genuinely doing the rendering there). Advertising `Accept-Encoding` means responses may now arrive compressed.

  **Decompression must not become a decompression-bomb hole (found by a third review pass, §21).** Today's byte cap (`options.maxBytes`, `IMPORT_PAGE_MAX_BYTES` / `IMPORT_IMAGE_MAX_BYTES`) is enforced on raw wire bytes as `res.on("data")` chunks arrive — exactly the right place to enforce it *when there's no decompression*, because wire bytes and content bytes are the same thing. Once responses can be compressed, decompressing an already-capped buffer *after* collection (the natural minimal-diff reading of "decompress before returning bytes") caps only the *compressed* size — a small adversarial gzip/brotli payload well under either cap could expand to gigabytes in memory, a real DoS against the seller's own machine and squarely inside the threat model this guard exists for. The fix: when `Content-Encoding` is present, pipe the response through the matching Node `zlib` transform stream (`createGunzip`/`createInflate`/`createBrotliDecompress`) and move the existing cap-and-abort logic (`total > options.maxBytes` → destroy and reject) to count bytes coming *out* of that transform, not bytes arriving over the wire. Absent/identity encoding keeps today's behavior exactly (cap on the one and only byte stream there is). This is a bigger change than "add three headers and call `zlib.gunzipSync` on the result" — it has to be streaming to actually bound peak memory, not just the returned buffer's final size.

## 9. Manual "paste a photo URL" escape hatch (new, `NewItemDialog.tsx`)

A small textarea in URL-import mode, for pasting one or more direct image URLs by hand (newline- or comma-separated). **Placement correction (found by a third review pass, §21):** the candidate-picker block in today's `NewItemDialog.tsx` is gated behind `previewFetched && createdIdPendingWarning === null` — the first draft's "always available" claim didn't hold if the textarea were placed inside that same block, since a seller who hasn't clicked "Fetch page" yet (or whose fetch is still pending) would never see it. This textarea renders as its own block, outside that gate — visible in URL-import mode from the start, independent of whether a fetch has been attempted.

**That relocation alone doesn't deliver the stated benefit — found and completed by a fourth review pass, §22.** Moving only the textarea still leaves a seller stuck: the item-name field (`NewItemDialog.tsx:417-426`) sits inside that same `previewFetched`-gated block, and the Create button (`:493-498`) is `disabled={... || !previewFetched}` — both regardless of how many URLs were pasted. §21's own claim that this "skip[s] a doomed fetch entirely" didn't actually hold. The fix isn't to un-gate those two elements independently (that would leave two parallel, easy-to-desync conditions for "the seller has something to work with"): adding at least one pasted URL calls the exact same `setPreviewFetched(true)` that a successful `fetchUrlPreview()` already calls. `previewFetched` already means, functionally, "there's at least one candidate and the seller can proceed to name the item and create it" — a manual paste satisfies that condition through a different route, not a different one. One flag, two ways to set it, no separate gating logic to keep in sync — and the name field and Create button unlock the moment a valid URL is pasted, exactly as §21 originally intended.

This is the guaranteed fallback for sites no amount of automated extraction will ever reliably beat — Amazon and Costco specifically, per the seller's own examples (§10). Pasted URLs are validated client-side (`new URL()`, must be `http`/`https`), deduped against existing candidates, and merged into `candidateImages` + `selectedImages` (auto-selected, same reasoning as extracted candidates: a seller who deliberately pastes a URL wants it imported). No new server endpoint — downloads go through the existing `importImagesFromUrls` → `handleImageImport` pipeline unchanged, so they get the same sniff/sanitize/write treatment and the same `Referer` treatment as extracted candidates (§11.2).

**A fetch after a paste must not silently discard what was pasted — found by a fifth review pass, §23.** Round 4 made pasting a fully standalone path to the rest of the form (correct), but never revisited what happens if the seller *also* fetches — either afterward, or even during, since Tier 2's headless fallback can take several real seconds and a paste can easily land while it's still in flight. Verified directly: `fetchUrlPreview`'s success path (`NewItemDialog.tsx:117-147`) calls `setCandidateImages(preview.images)` and `setSelectedImages(new Set(preview.images))` — hard replacements, not merges — and `setName(preview.name ?? "")` unconditionally, which would blank out a name the seller had already typed by hand if the fetch's own guess comes back null. Nothing about this is new to this feature; it's a pre-existing pattern in code §9 didn't touch. It only becomes a real hazard now that §9 gives pasting its own, fully independent path to populated state that a later fetch can walk over. Fixed: `fetchUrlPreview`'s success path now merges into existing `candidateImages`/`selectedImages` using the same dedup-and-auto-select logic §9 already specifies for paste (union, never remove), rather than replacing them, and only sets `name` when the field is currently empty. This is a deliberate simplification, not full provenance-tracking: a fetch never automatically clears an *earlier* fetch's candidates either — the seller uses the existing "Select none" / per-item checkboxes to clean up if they fetch the wrong page twice. Silently losing a selection the seller already made is a materially worse failure than a few extra thumbnails to uncheck, especially given §2's whole premise is sites where fetch may contribute nothing at all.

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
  usedHeadlessFallback: boolean;              // Tier 2 ran (successfully or not)
  headlessFailureReason: "not-installed" | "navigation-failed" | null;
  // null in three cases: Tier 1 already succeeded (Tier 2 never ran); Tier 2
  // ran, rendered fine, and found candidates; or Tier 2 ran, rendered fine,
  // and STILL found zero candidates (HeadlessRenderResult's `available: true`
  // branch carries no reason at all — a site that renders but genuinely has
  // no photos isn't a failure of the fallback itself). §12's table treats
  // this third null case the same as "navigation-failed": both mean Chromium
  // ran with nothing actionable to blame it on, so the seller gets the same
  // "couldn't find photos automatically" message rather than install advice.
};
```

**Corrected per a third review pass, §21:** the first draft collapsed this into one `headlessUnavailable: boolean`, discarding the distinction `HeadlessRenderResult` (§6.1) already makes between `"not-installed"` and `"navigation-failed"`. That distinction matters to the seller, not just internally: a boolean routes both cases to the same "run `npx playwright install chromium`" advice (§12) — actively wrong when Chromium is installed and working fine but a *particular* navigation failed (e.g. an SSRF-blocked redirect mid-page-load). Carrying the real reason through lets §12 give advice that matches what actually happened.

### 11.2 `POST /api/items/<category>/<item>/images/import`

Request body gains an optional field, applying to the whole batch:

```ts
const importImagesBodySchema = z.object({
  urls: z.array(z.string().min(1)).min(1).max(IMPORT_MAX_URLS_PER_REQUEST),
  sourceUrl: z.string().min(1).optional(),
});
```

`handleImageImport` passes `referer: <origin of sourceUrl>` (scheme + host + port only — not the full path/query, matching the `strict-origin-when-cross-origin` referrer policy browsers already default to, so a pasted URL that happens to embed something sensitive in its path/query never leaks further than a real cross-origin image request would) to each `fetchUrlSafely` call.

**One-`sourceUrl`-per-batch is a known simplification, not an oversight (§9 interaction found by a third review pass, §21).** The original justification — "every URL in one call comes from the same page" — held for a pure scraped-candidates import, but no longer holds once §9's manual paste-URL escape hatch exists: a seller can merge pasted URLs from an *arbitrary* site into the same `selectedImages` set as scraped candidates and submit them together. Accepted as-is rather than redesigned into a per-URL `{url, sourceUrl}[]` shape: a mismatched or missing referer here is not a security issue (`ssrfGuard.ts`'s protections are unaffected either way), only a missed opportunity to dodge hotlink protection on a *manually pasted* URL — and manually-pasted URLs are already the fallback for exactly the sites (Amazon/Costco-class defenses) where referer-matching alone was never going to be the deciding factor. Tracking origin per-URL would add real client/server complexity for a marginal, non-functional benefit on the case that matters least.

### 11.3 `POST /api/import-url/thumbnail` (new)

Request: `{ url: string; sourceUrl?: string }`. On failure: a JSON `{ error }`, mirroring the other routes' error shape.

**On success, this cannot literally be "raw bytes, not JSON" as the first draft of this section said (found by a third review pass, §21).** `StudioResponse` is deliberately only `JsonResponse | FileResponse | SseResponse` (`scripts/lib/studioApi.ts`) — by design, per that type's own comment, specifically so route handlers never touch an HTTP object and stay drivable from Vitest with no server running. There is no in-memory-buffer variant to add bytes to; `FileResponse` requires an actual path on disk (`vite.config.ts`'s dispatcher pipes it straight into `createReadStream`). This codebase already has the right-shaped precedent for "bytes obtained at request time, served once, then discarded": the catalog PDF download path (`registerPdfExport`/`handleExportPdfDownload`) writes to a temp file and returns a `FileResponse` with `onSent` releasing it after the stream finishes. This route follows the same primitive, simplified for a single round trip (the PDF path's token/TTL registry exists because *its* generate and download are two separate requests; this route's fetch-then-serve is one): fetch the image via `fetchUrlSafely`, sniff its type, write it to a fresh file under `os.tmpdir()`, and return a `FileResponse` for that path with `onSent: () => fs.unlink(path)` — no token needed, no new `StudioResponse` variant, no change to `vite.config.ts`'s dispatcher.

**Why POST, not a `GET .../thumbnail?url=...`:** `checkStudioCsrf` (`studio/csrfGuard.ts`) deliberately exempts `GET`/`HEAD`, reasoning that Vite's own CORS/`allowedHosts` checks "already cover reads." That reasoning holds for routes that only read the seller's own local content — it does **not** hold for a route whose side effect is an *outbound network fetch of an attacker-influenced URL*. A bare `<img src="http://127.0.0.1:<port>/api/import-url/thumbnail?url=...">` embedded on any unrelated page the seller happens to have open in another tab would fire with no preflight, no CORS check gating whether it fires (CORS only gates whether the response can be *read* by cross-origin JS, and a plain `<img>` tag never reads it) — reintroducing exactly the class of hole `csrfGuard.ts` exists to close, via a different HTTP method. `ssrfGuard.ts` would still block internal targets, but the seller's machine could be made to originate blind requests to arbitrary *external* attacker-chosen URLs. Keeping this endpoint as CSRF-protected POST (matching every other networked route in this file) closes that off entirely. The client fetches each thumbnail via `fetch()` (POST) → `res.blob()` → `URL.createObjectURL()`, revoked on unmount/replacement.

Bounded concurrency comes for free: all ~40 candidate thumbnails now request the *same local origin*, so the browser's own per-origin connection cap (~6 concurrent in most browsers) naturally throttles both the client requests and, transitively, the server's fan-out to the various remote hosts — no hand-rolled semaphore needed.

**Lazy loading is preserved, not silently dropped (per §19).** Moving from a bare `<img src>` to a `fetch()` + blob-URL means the native `loading="lazy"` attribute (today's `NewItemDialog.tsx`) no longer does anything — a `fetch()` call has no browser-native deferral. Left alone, that would mean every one of up to 40 candidates gets fetched immediately on mount, each one now a *double* network hop (server re-fetches the remote image, then the browser fetches it from the local server) instead of today's single direct hop — a real latency/bandwidth regression for a seller who only ever looks at the first handful of candidates. This design replaces the native attribute with an `IntersectionObserver`-gated fetch (a small hook: only fetch a thumbnail once its `<li>` scrolls near the viewport), keeping the original "don't fetch what isn't shown" intent through the proxy instead of losing it.

**In-flight thumbnail fetches are cancelled, not just their blob URLs cleaned up (added per a second review pass, §20).** `NewItemDialog.tsx` already treats "the seller left this mode/state while an async call was in flight" as a real case to guard against — the existing `modeRef` check on `fetchUrlPreview`'s result explicitly exists because the seller can switch away from URL-import mode before that request resolves. The same discipline applies here: switching modes, closing the dialog, or re-fetching a new preview can unmount up to ~40 in-flight thumbnail requests at once, each one still driving a real upstream `fetchUrlSafely` call server-side even after nothing on screen needs the result. Each thumbnail's `fetch()` is issued with an `AbortController` whose `abort()` is called from the same cleanup path that revokes its blob URL (the `IntersectionObserver` hook's unmount/re-trigger cleanup, and the existing mode-switch handlers), not left to run to completion unobserved.

## 12. UI error-messaging states (`NewItemDialog.tsx`)

When the preview returns `images.length === 0`:

| Condition | Message |
|---|---|
| `headlessFailureReason === "not-installed"` | This page may need JavaScript to show photos. Run `npx playwright install chromium` once to enable deeper import (the same one-time step the catalog PDF export uses — already done if you've set that up), then retry — or paste a photo link directly below. |
| `headlessFailureReason === "navigation-failed"`, or `null` with `usedHeadlessFallback === true` (Tier 2 genuinely ran — installed and working — and still found nothing) | Couldn't find photos on this page automatically (it may block automated access, or require login). Paste a photo link directly below. |

Both states point at the same always-available escape hatch (§9) rather than dead-ending the seller.

## 13. i18n

New/changed keys in both `studio/src/i18n/strings.en.ts` and `strings.zh.ts` (bilingual — this pair is source-code i18n data, not a `docs/*.md` file, but the seller-facing-text principle is the same and both files are edited together as usual for this codebase):

- Replace `newItem.url.noImages` with the two conditional messages in §12.
- `newItem.url.pasteUrls.label`, `.placeholder`, `.add`, `.invalid` (validation error when no pasted line parses as a URL).
- A loading-state label reused for the (now potentially slower, up to the headless timeout) fetch attempt — existing `newItem.url.fetching` is fine as-is; no separate "trying deeper import…" sub-state is planned (the request is a single round trip; the client has no signal to distinguish "fast path is slow" from "fallback in progress" without adding a streaming/progress mechanism, which is disproportionate to this need).

## 14. Testing strategy

- **`scripts/lib/ssrfGuard.test.ts`:** cases for the new `checkHostnameAllowed` export, confirming it rejects if *any* address a hostname resolves to is disallowed (not just the first, per §6.3) and returns the resolved `address`/`family` alongside `allowed: true` (existing `resolveAndValidate`/`fetchUrlSafely` tests should pass unchanged since it's a refactor, not a behavior change — same one DNS lookup, same pinning); the `referer` header being sent (as an origin only, per §11.2) when provided and absent when not; gzip/deflate/br response decompression against a local test server; and — the case that matters most, per §8's correction — a local test server that sends a small, deeply-compressed payload past `maxBytes` once decompressed, confirming the streamed decompression aborts before that full size is ever held in memory, not merely that the final returned buffer is checked afterward.
- **`scripts/lib/chromiumLauncher.test.ts`** (new, extracted alongside the function itself): the direct `launchChromiumOrError()` expectations that today live inline in `scripts/lib/pdfCatalog/generate.test.ts` (its pass-1/pass-2 page-count parity test happens to call it directly, per that file's own comment on why `renderHtmlToPdfBytes` is likewise exported for direct testing). **Correction from a second review pass (§20):** `generate.test.ts` keeps its own tests — its actual subject is PDF pagination, not the launcher — and simply updates its import of `launchChromiumOrError` to the new shared module; only the launcher's *own* dedicated success/missing-package/missing-binary coverage moves into the new file.
- **`scripts/lib/headlessImport.test.ts`** additionally covers the self-healing cache (§6.2, added per a fourth review pass, §22): a mocked `Browser` whose `isConnected()` is stubbed to flip to `false` is not reused for a subsequent call (a fresh `launchChromiumOrError()` happens instead), and a mocked `'disconnected'` event handler actually clears the cached reference when fired.
- **`scripts/lib/headlessImport.test.ts`** (new): unit tests against **mocked** Playwright objects (route/request interception decisions — resource-type blocking, hostname allow/deny via a stubbed `checkHostnameAllowed` that enforces the multi-address check per §6.3, and that a registered `routeWebSocket()` handler never calls `connectToServer()`) so the security-critical interception logic is covered deterministically without a real browser. `{ available: false, reason: "not-installed" }` is tested via a stubbed `launchChromiumOrError` returning `{ error }`. **Correction from a second review pass (§20):** real-Chromium smoke tests use the same runtime try/catch soft-skip-with-`console.warn` pattern `generate.test.ts` already uses for its own real-Chromium tests (not a new opt-in-env-var convention as the first draft proposed) — one established way of handling "Chromium may not be installed in this environment" across both modules that now share it, rather than two.
- **`scripts/lib/studioApi.test.ts`:** two-tier trigger logic using `__setHeadlessRendererForTests` (Tier 2 only invoked when Tier 1 finds zero images; `headlessFailureReason` set correctly for each of "not-installed," "navigation-failed," and the success case, per §11.1's correction), `sourceUrl` → origin-only `referer` threading in `handleImageImport`, and the new thumbnail route's CSRF/validation/error-shape behavior plus its temp-file lifecycle (§11.3): the file exists on disk while the response streams, `onSent` actually removes it afterward, and a fetch failure never leaves an orphaned temp file behind.
- **`studio/src/api.test.ts`:** the new thumbnail-fetch client function returns a `Blob` on success and throws the server's `{ error }` message on failure, matching this file's existing per-function test pattern.
- **`studio/src/panes/NewItemDialog.test.tsx`:** the two new conditional messages render correctly based on preview-response flags, the manual paste-URL textarea's parsing/validation/dedup/merge-into-selection behavior, that pasting a valid URL sets `previewFetched` and unlocks the name field and Create button without a fetch ever having run (§9, per §22's fix), that a fetch resolving *after* a paste merges into — never replaces — the seller's already-pasted-and-selected images, and never blanks an already-typed name when the fetch's own guess is null (§9, per §23's fix), and thumbnail blob-URL lifecycle (fetched only once `IntersectionObserver` reports a candidate near-viewport, revoked on unmount — no leaked object URLs, no eager fetch of all 40 on mount, and an in-flight thumbnail fetch is actually aborted — not just its blob URL discarded later — when the mode is switched away mid-request, per §11.3).

## 15. Iron-Rule compliance (CLAUDE.md)

1. **`content/` folder rule:** N/A — no seller-content files touched by this feature.
2. **Bilingual doc sync:** `docs/CURRENT_FUNCTIONALITY.md`, `docs/DESIGN.md`, `docs/TECH_REQUIREMENTS.md`, and `docs/SCRIPTS.md` (the last for its existing Chromium-setup note, which now also covers URL-import) — all four **and their `_zh` counterparts** need updates during implementation (new route, new known-limitations note, updated response/body shapes, the shared-launcher relationship with PDF export). Tracked explicitly in §16.
3. **App code is live:** this is exactly the kind of explicitly-requested feature change Rule 3 allows.
4. **`reserved_for` never rendered:** untouched by this feature.
5. **`image-manifest.json` stays in git:** untouched.
6. **`lib/utils/pricing.ts` has no `"use client"`:** untouched.
7. **Mark phases complete:** N/A — this enhances already-shipped Studio functionality (Phases 0-18 are all already complete); no new phase entry is being added to `IMPLEMENTATION_PLAN.md`.
8. **New config fields must be backward-compatible:** N/A by design — §7 deliberately adds no `content/config.ts` field.

## 16. Docs to update during implementation (bilingual, per CLAUDE.md Rule 2)

- `docs/CURRENT_FUNCTIONALITY.md` / `_zh`: describe the two-tier fetch, the manual paste-URL escape hatch, that the headless fallback reuses the same one-time Chromium setup as PDF export, and the Amazon/Costco/login-wall known limitation.
- `docs/DESIGN.md` / `_zh` (§22, Seller Studio): headless-fallback architecture, the extended SSRF model (including the WebSocket-blocking approach and the accepted DNS-rebinding residual risk), the new thumbnail route, and the new `scripts/lib/chromiumLauncher.ts` shared module (also referenced from the PDF-export design material).
- `docs/TECH_REQUIREMENTS.md` / `_zh` (§30, Seller Studio — per CLAUDE.md's own doc-section reference table; §29 is the shipping estimator, a different feature): updated `POST /api/import-url/preview` response shape, updated images/import body shape, new `POST /api/import-url/thumbnail` contract.
- `docs/SCRIPTS.md` / `_zh`: update the existing "Catalog PDF export... one-time setup: `npx playwright install chromium`" note to mention it now also unlocks URL-import's deep-import fallback — no new script row needed.

## 17. Files touched (implementation-plan input)

**New:**
- `scripts/lib/chromiumLauncher.ts` + `.test.ts` — `launchChromiumOrError()`, extracted from `pdfCatalog/generate.ts` (§6.2).
- `scripts/lib/headlessImport.ts` + `.test.ts`

**Edited:**
- `scripts/lib/pdfCatalog/generate.ts` — `launchChromiumOrError()` removed in favor of importing it from the new shared module; no behavior change, contract and both existing callers (`generateCatalogPdf`, `generateFlyerPdf`) unchanged.
- `scripts/lib/pdfCatalog/generate.test.ts` — only its import of `launchChromiumOrError` changes (now from `../chromiumLauncher`); its own tests, including the one that calls the function directly for pass-1/pass-2 parity, are otherwise untouched (§14).
- `scripts/lib/ssrfGuard.ts` (+ `.test.ts`) — `checkHostnameAllowed` export (address-carrying, §6.3), `referer` option, header realism, decompression.
- `scripts/lib/studioApi.ts` (+ `.test.ts`) — two-tier orchestration, `sourceUrl`/referer threading, new thumbnail route.
- `studio/src/api.ts` (+ `.test.ts`) — updated `previewImportUrl`/`importImagesFromUrls` types, new thumbnail-fetch client function.
- `studio/src/panes/NewItemDialog.tsx` (+ `.test.tsx`) — new messaging states, paste-URL textarea, `IntersectionObserver`-gated thumbnail blob-URL rendering.
- `studio/src/i18n/strings.en.ts`, `strings.zh.ts` — new/changed keys (§13).
- Docs listed in §16.

**Not touched:** `package.json` — no new dependency, no new script (§7). `studio/vite.config.ts` and the `StudioResponse` type — the new thumbnail route reuses the existing `FileResponse` + temp-file pattern (§11.3), not a new response variant.

## 18. Out of scope (this change)

- Stealth/anti-detection engineering against specific bot-defense vendors (§10).
- A local DNS-pinning forward proxy for the headless path (§6.3 — accepted residual risk instead).
- A `content/config.ts` toggle for this feature (§7).
- Any change to `extractImportCandidates`'s parsing/ranking rules.

## 19. Post-review findings (independent audit, 2026-09-08)

An independent general-purpose subagent reviewed the first draft of this spec against the actual codebase before it moved to `writing-plans`, per the seller's request. Its findings, and how each was resolved, are recorded here rather than silently folded into the sections above — this directory's own convention (see `2026-08-17-studio-pdf-contact-accessibility-design.md`'s §8a) for exactly this situation.

**Substantive findings, all fixed in this revision:**

- **[factual error]** The first draft proposed adding `playwright-core` as a new dependency with a new `pnpm setup-url-import` script, unaware that `playwright` (the full package) is already a `devDependency` used by `pdfCatalog/generate.ts`'s PDF export, with its Chromium install step already documented in `docs/SCRIPTS.md`. Fixed: §6.2 and §7 rewritten to extract the existing `launchChromiumOrError()` into a shared `scripts/lib/chromiumLauncher.ts` and reuse the already-documented setup step. No new dependency, no new script.
- **[design concern]** Following from the above, a separate `playwright-core` would have created a second, independently-versioned Chromium cache alongside the existing one. Resolved by the same fix — there is now only ever one Playwright dependency and one Chromium install.
- **[design concern]** The original `isHostnameAllowed(hostname): Promise<{allowed}>` sketch didn't carry the resolved address, so `resolveAndValidate` could not actually become "a thin wrapper" around it without a second DNS lookup — which would have reopened a TOCTOU gap in the currently-safe, pinned Tier-1 path. Fixed: §6.3's `checkHostnameAllowed` now returns `{ allowed: true; address; family }`, so the plain-fetch path's existing single-lookup, pinned-socket behavior is preserved exactly.
- **[security gap]** The original design blocked the `websocket` resource type through the same generic `context.route()` handler used for images/fonts/etc. Verified via Playwright's own issue tracker (microsoft/playwright#31969, #28947) that `route()` does not intercept WebSocket handshakes at all — a dedicated `context.routeWebSocket()` API exists specifically because of this gap. Fixed: §6.3 now specifies `routeWebSocket()` with a handler that never calls `connectToServer()` (which fully blocks the connection by default), plus a note on the `wss://` glob-matching pitfall that pushed the pattern to a regex.

**Addressed as a deliberate trade-off, not a defect:**

- **[nitpick]** Moving thumbnails from a plain `<img src>` to a `fetch()`-based proxy silently drops native `loading="lazy"` and doubles each thumbnail's network hop. Fixed: §11.3 now specifies `IntersectionObserver`-gated fetching to preserve the original "don't fetch what isn't shown" behavior.

**Confirmed accurate — no change:** the `checkStudioCsrf` GET/HEAD-exemption reasoning and the POST-only justification for the new thumbnail route (§11.3); the English-only doc-convention citation; the i18n key claims (§13).

## 20. Second independent review (fresh subagent, 2026-09-08)

A second, separately-spawned subagent reviewed the revised spec — deliberately fresh rather than a continuation of the first, so it wouldn't just confirm the first review's own conclusions. Verdict: ready with minor fixes, all applied below (two verified directly against the cited source before editing, per this project's usual review-then-verify practice rather than accepting either subagent's account at face value).

**Fixed in this revision:**

- **[design concern]** §6.2 implied that extracting `launchChromiumOrError()` into a shared module means URL-import and PDF export share one running browser *process*. Verified directly: the function (`scripts/lib/pdfCatalog/generate.ts`) is a stateless factory — its two existing callers each launch-and-close their own instance per render, and only `headlessImport.ts`'s own module-level caching (not the shared function itself) makes its instance long-lived. Fixed: §6.2 now states plainly that "shared" means the package/install/launch-code, not a shared process, and adds self-healing (relaunch on next call if the cached instance turns out to be dead) since a long-lived cached instance — unlike PDF export's per-call one — can actually go stale between requests.
- **[design concern]** §6.3's `checkHostnameAllowed` signature returns one address, but the current `resolveAndValidate` it replaces validates *every* address a hostname resolves to and rejects on any disallowed hit (locked in by an existing `ssrfGuard.test.ts` case) — verified directly in `ssrfGuard.ts`. The type signature alone doesn't communicate that "check all, return one" requirement. Fixed: §6.3 now states the multi-address requirement explicitly in prose, and §14 notes the new test must assert it.
- **[design concern]** §14/§17 implied the existing `launchChromiumOrError` test could "move alongside" the function into the new file. `scripts/lib/pdfCatalog/generate.test.ts:640` calls it directly inside a test whose actual subject is PDF pagination parity — verified via `grep`. Fixed: that test stays put with an updated import; only dedicated launcher coverage is new.
- **[design concern]** The first draft's `headlessImport.test.ts` proposed an opt-in-env-var gate for real-Chromium smoke tests, inconsistent with `generate.test.ts`'s existing runtime try/catch-and-`console.warn` skip pattern for the same underlying problem. Fixed: §14 now specifies the existing convention, not a second one.
- **[design concern]** §11.3 revoked thumbnail blob URLs on unmount but never cancelled the underlying `fetch()`, so switching modes mid-load would let up to ~40 real upstream requests run to completion for nothing — inconsistent with this same component's existing `modeRef` discipline for exactly this class of "seller left mid-request" case. Fixed: added `AbortController` cancellation wired to the same cleanup path.

**Fixed as a wording-precision issue, not a real gap:** §6.3's description of the WebSocket block ("never reaches the real server") could be read as the connection visibly failing — Playwright actually mocks it as silently appearing to open. The underlying guarantee (no real socket ever opens) was never wrong, only the phrasing; reworded.

**Independently confirmed accurate — no change:** the `wss://` glob-matching issue (maintainer-confirmed upstream); that Worker-originated WebSockets don't bypass the guard; and that `studioApi.ts`'s flat route-dispatch chain has no shadowing risk for the new thumbnail route.

## 21. Third independent review (fresh subagent, 2026-09-08)

A third, separately-spawned subagent reviewed the spec again — fresh, not a continuation — deliberately pointed at the sections the first two rounds had spent the least time on (§8, §9, §11.1/§11.2, §12, §15) rather than re-litigating §6/§7. Verdict: two of its findings were load-bearing (the design as written could not actually be built), not polish. Both were verified directly against source before fixing, per this project's practice of checking a review's claims rather than accepting either subagent's account at face value.

**Load-bearing fixes:**

- **[security gap]** §8's decompression addition never addressed how it interacts with the existing byte cap. Verified directly: `fetchUrlSafely`'s `res.on("data")` loop enforces `maxBytes` on raw wire chunks as they stream in; decompressing an already-capped buffer afterward (the natural reading of the original wording) would cap only *compressed* size — a small adversarial payload could expand to gigabytes in memory, a real DoS squarely inside this guard's own threat model. Fixed: §8 now specifies streaming decompression through a `zlib` transform with the cap moved to count *decompressed* output bytes, not wire bytes.
- **[design concern]** §11.3's thumbnail route could not be built as originally specified. Verified directly: `StudioResponse` (`scripts/lib/studioApi.ts`) is deliberately only `JsonResponse | FileResponse | SseResponse` with no in-memory-buffer variant — by the type's own comment, specifically so handlers never touch an HTTP object — and `FileResponse` requires an actual file on disk. Fixed: §11.3 now reuses the exact temp-file + `FileResponse.onSent` pattern this codebase already has for the same shape of problem (the catalog PDF download path), simplified to one request instead of that path's two-step token registry, rather than inventing a new response type.

**Also fixed, smaller precision gaps:**

- **[design concern]** §12's table collapsed `HeadlessRenderResult`'s own `"not-installed"` vs `"navigation-failed"` distinction (§6.1) into one boolean, which would have shown "run `npx playwright install chromium`" advice even when Chromium was installed and working fine but a specific navigation failed for some other reason. Fixed: §11.1's response now carries the real reason through (`headlessFailureReason`), and §12 branches on it.
- **[design concern]** §11.2 justified one `sourceUrl` per import batch on "every URL comes from the same page" — no longer true once §9's paste-URL escape hatch can merge URLs from any site into one batch. Fixed: §11.2 now states this is an accepted simplification (not a security gap either way) rather than leaving a premise that a later section quietly invalidates.
- **[nitpick]** The Referer added in §11.2 forwarded the full pasted URL, including path and query — more than a real cross-origin image request would send under browsers' own default `strict-origin-when-cross-origin` policy. Fixed: origin only.
- **[nitpick]** §15's Rule-2 compliance list dropped `docs/SCRIPTS.md`/`_zh` even though §16 right below it still lists an update there. Fixed: added back for consistency.
- **[nitpick]** §9 called the paste-URL textarea "always available," but the picker block it would have shared a home with is gated behind `previewFetched` — meaning it wouldn't have been available before a first fetch attempt. Fixed: §9 now places it as its own block outside that gate, which also happens to be the more seller-friendly behavior (skip a doomed fetch entirely on a site already known to need the escape hatch).

**Independently re-verified, not just trusted from §19/§20:** multi-address SSRF validation and first-address pinning; the `checkStudioCsrf` GET/HEAD exemption; and the `generate.test.ts` direct-call coupling. All still accurate.

## 22. Fourth independent review (fresh subagent, 2026-09-08)

A fourth, separately-spawned subagent reviewed the spec once more, deliberately pointed at the still-least-scrutinized corners (exact doc section numbers cited in §16, §6.2's self-healing mechanism, §9's actual buildability against the live component, `chromiumLauncher.ts`'s type-export needs, whether §5/§13 still matched the current response shape after three rounds of edits to it) and explicitly told it could recommend stopping the review loop if nothing new turned up. It found two more real, concrete gaps — both verified directly against source before fixing.

**Fixed in this revision:**

- **[design concern]** §9's fix from the third review pass only moved the paste-URL textarea outside the `previewFetched` gate — it didn't check what else depends on that same gate. Verified directly in `NewItemDialog.tsx`: the item-name field (lines 417-426) and the Create button's `disabled` condition (lines 493-498, `!previewFetched`) both still require `previewFetched === true`, regardless of how many URLs are pasted. §21's claim that this change lets a seller "skip a doomed fetch entirely" didn't actually hold. Fixed: pasting at least one valid URL now calls the same `setPreviewFetched(true)` a successful fetch already calls, so the escape hatch unlocks the whole rest of the form through the one existing flag rather than needing two separately-maintained gating conditions.
- **[design concern]** §6.2's "self-healing" cache-invalidation was named but never specified: no way was given to tell "the cached browser died" apart from "a navigation timed out on a healthy browser," since both would otherwise just be a caught exception. Verified directly against this repo's pinned `playwright-core` type declarations that `Browser.isConnected(): boolean` and a `'disconnected'` event both exist and report browser liveness independent of any particular navigation. Fixed: §6.2 now specifies checking `isConnected()` before reusing the cache and registering a `'disconnected'` listener at launch to clear it proactively — liveness of the cached resource is fully decoupled from whether any one render attempt succeeded.

**Fixed as a leftover-consistency nitpick:** §5's diagram still labeled only the final success arrow with `usedHeadlessFallback: true`, a small leftover from before §21 replaced a single boolean with the three-way `headlessFailureReason`. Both arrows now show the full, current field set.

**Checked directly against source, no issue found — explicitly worth recording since this was the whole point of this pass:** `docs/DESIGN.md`'s "§22, Seller Studio" and `docs/TECH_REQUIREMENTS.md`'s "§30, Seller Studio" headings (both exist exactly as cited); `docs/SCRIPTS.md`'s cited Chromium-setup line (matches verbatim); whether `chromiumLauncher.ts` needs to re-export `Browser`/`Page` from `playwright` (it doesn't — `headlessImport.ts` can do the identical type-only import `pdfCatalog/generate.ts` already does, erased at compile time); and §13's i18n key claims against the real `strings.en.ts` (still accurate). The reviewing agent's own verdict: ready with the above minor fixes, and if another pass turns up nothing beyond precision nitpicks, that is itself a legitimate signal to stop rather than a reason to keep looping.

## 23. Fifth independent review (fresh subagent, 2026-09-08)

A fifth, separately-spawned subagent was pointed at a specific interaction the orchestrating session had spotted but not yet verified — whether round 4's fix (paste sets the same `previewFetched` flag a fetch does) creates a new hazard where a fetch landing after (or during, given Tier 2's multi-second latency) a paste could silently wipe out what the seller had already pasted and selected — plus a fresh, skeptical read of the narrative sections (§1-4, §10) that every prior round had used as unquestioned context rather than fact-checked themselves. Verdict: needs another pass; one real, previously-unexamined gap found, plus two smaller leftovers from the edit history.

**Fixed in this revision:**

- **[design concern]** Confirmed real: `fetchUrlPreview`'s success path (`NewItemDialog.tsx:117-147`) replaces `candidateImages`/`selectedImages` outright and unconditionally overwrites `name`, rather than merging — a pre-existing pattern in code §9 never touched, which only becomes a hazard now that paste (round 4) gives the seller a second, independent way to populate that same state before a fetch resolves. §9's own merge-and-dedupe logic was specified only for the paste handler, never revisited for the fetch success path. Fixed: fetch now merges into existing candidates/selections (union, same dedup rule as paste) instead of replacing them, and only sets `name` when the field is currently empty — a deliberate, stated simplification (a second fetch still doesn't auto-clear a first fetch's candidates either; the seller cleans up via the existing per-item checkboxes / "Select none") rather than building full per-URL provenance tracking, on the reasoning that silent loss of a seller's existing selection is worse than a few extra thumbnails to uncheck.
- **[nitpick]** §5's diagram still hardcoded `headlessFailureReason: "not-installed"` on the "available: false" arrow even after round 4 claimed to have brought the diagram in line with the three-way reason field — it added the field name but not the fact that this specific arrow can carry either `"not-installed"` or `"navigation-failed"`. Fixed.
- **[design concern]** eBay — one of the four sites the seller actually named (§2) — was never placed in either bucket of §3's root-cause split or mentioned in §10's known limitations, leaving it unclear whether it's expected to keep failing. Fixed: noted as more likely already server-rendered (unlike the SPA-heavy sites) and not expected to need Amazon/Costco-class treatment.

**Independently re-verified, not just trusted from §19-22:** `StudioResponse`'s union shape, the CSRF GET/HEAD exemption, multi-address SSRF rejection, the wire-byte cap's placement ahead of decompression, the `launchChromiumOrError`/`generate.test.ts` coupling, the cited doc section numbers, the original feature commit hash, and the regex-not-DOM-parser framing of `urlImport.ts`. All still accurate on a fresh, skeptical re-read.
