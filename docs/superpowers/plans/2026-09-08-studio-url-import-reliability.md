# Seller Studio URL-Import Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Seller Studio's "Import photos from a URL" feature succeed on more real-world sites by adding an SSRF-guarded headless-Chromium fallback for JS-rendered pages, fixing hotlink-related failures, and giving the seller a guaranteed manual escape hatch — plus fixing a decompression-bomb gap, a data-loss interaction between paste and fetch, and a broken-thumbnail cosmetic bug found along the way.

**Architecture:** A two-tier fetch — the existing plain-HTTP path unchanged, then a new SSRF-guarded headless-Chromium fallback that only runs when the fast path finds zero photos — reuses this repo's *existing* `playwright` devDependency via a newly-extracted shared launcher, rather than adding a new one. A manual paste-URL escape hatch and a CSRF-safe thumbnail proxy round out the seller-facing changes.

**Tech Stack:** TypeScript, Node.js, Vite dev-server middleware (`scripts/lib/studioApi.ts` + `studio/vite.config.ts`), React (Studio SPA), Vitest, `playwright` (already a devDependency), Zod.

**Full design rationale:** `docs/superpowers/specs/2026-09-08-studio-url-import-reliability-design.md` ("the spec" below) — including five rounds of independent review findings in its §19-§23. Read a section before its corresponding task if anything here seems underspecified.

## Global Constraints

- No new npm dependency and no new `pnpm` script — reuse the `playwright` devDependency and the `npx playwright install chromium` one-time step `pdfCatalog/generate.ts` already established (spec §7).
- The SSRF guarantee (`scripts/lib/ssrfGuard.ts`) must hold, without exception, on every new network-touching path, including the headless browser's own request interception (spec §6.3).
- No new `content/config.ts` field (spec §4, §7).
- Every English doc edited in this plan must be mirrored to its `_zh` counterpart in the same task (CLAUDE.md Iron Rule 2).
- Commit after every task; end each message `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- `content/`, `reserved_for`, `image-manifest.json`, and `lib/utils/pricing.ts`'s client-safety are all untouched by this feature (CLAUDE.md Iron Rules 1, 4, 5, 6 — no action needed, listed for completeness).

---

### Task 1: Extract `launchChromiumOrError` into a shared launcher module

**Files:**
- Create: `scripts/lib/chromiumLauncher.ts`
- Create: `scripts/lib/chromiumLauncher.test.ts`
- Modify: `scripts/lib/pdfCatalog/generate.ts` (remove the function; import it instead)
- Modify: `scripts/lib/pdfCatalog/generate.test.ts` (update one import path only)

**Interfaces:**
- Produces: `launchChromiumOrError(): Promise<{ browser: Browser } | { error: string }>` and `export type { Browser }` from `scripts/lib/chromiumLauncher.ts` — consumed by Task 4 (`headlessImport.ts`) and by `pdfCatalog/generate.ts` (unchanged call sites).

This is a pure refactor: identical behavior, identical error string, identical two call sites in `generate.ts`. It unblocks Task 4 without touching PDF export's behavior at all. See spec §6.2 for why this extraction exists (PDF export and URL-import share the same package/Chromium-install path, never a running browser process — that distinction matters starting in Task 4, not here).

- [ ] **Step 1: Write the failing test for the new module**

```typescript
// scripts/lib/chromiumLauncher.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

describe("launchChromiumOrError", () => {
  afterEach(() => {
    vi.doUnmock("playwright");
    vi.resetModules();
  });

  it("returns a browser when playwright launches successfully", async () => {
    const fakeBrowser = { close: vi.fn() };
    vi.doMock("playwright", () => ({
      chromium: { launch: vi.fn().mockResolvedValue(fakeBrowser) },
    }));
    const { launchChromiumOrError } = await import("./chromiumLauncher");

    const result = await launchChromiumOrError();

    expect("browser" in result).toBe(true);
    if ("browser" in result) {
      expect(result.browser).toBe(fakeBrowser);
    }
  });

  it("returns the same friendly error when the playwright package is missing", async () => {
    vi.doMock("playwright", () => {
      throw new Error("Cannot find module 'playwright'");
    });
    const { launchChromiumOrError } = await import("./chromiumLauncher");

    const result = await launchChromiumOrError();

    expect(result).toEqual({
      error: "PDF renderer not installed. Run: npx playwright install chromium",
    });
  });

  it("returns the same friendly error when the Chromium binary is missing", async () => {
    vi.doMock("playwright", () => ({
      chromium: {
        launch: vi.fn().mockRejectedValue(new Error("Executable doesn't exist at .../chrome")),
      },
    }));
    const { launchChromiumOrError } = await import("./chromiumLauncher");

    const result = await launchChromiumOrError();

    expect(result).toEqual({
      error: "PDF renderer not installed. Run: npx playwright install chromium",
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run scripts/lib/chromiumLauncher.test.ts`
Expected: FAIL — `scripts/lib/chromiumLauncher.ts` does not exist yet.

- [ ] **Step 3: Create the module with the function moved from `generate.ts`**

```typescript
// scripts/lib/chromiumLauncher.ts
// Shared headless-Chromium launcher for every Studio feature that needs
// one (the catalog PDF export, and the URL-import headless-render
// fallback) — one Playwright dependency, one Chromium install, one
// lazy-import/friendly-error pattern instead of two. See
// docs/superpowers/specs/2026-09-08-studio-url-import-reliability-design.md §6.2/§7.

// Type-only: erased at compile time, so this does NOT make the
// `playwright` package a runtime dependency of this module — see
// launchChromiumOrError below for why that matters.
import type { Browser } from "playwright";

export type { Browser };

/**
 * Launches a fresh headless Chromium instance, or a friendly error if the
 * `playwright` package or its Chromium binary isn't installed. Stateless:
 * every call launches a brand-new browser. Callers that need to reuse one
 * browser across multiple operations (PDF export's own multi-render
 * passes; the URL-import headless fallback's warm-instance cache) are
 * responsible for holding onto the returned `Browser` and closing it.
 *
 * Dynamic import, not a static one: some callers load this module at
 * Studio boot time and must not crash on a site that skipped the optional
 * Chromium download. Missing *package* and missing Chromium *binary* both
 * land in this same catch and produce the same friendly typed error.
 */
export async function launchChromiumOrError(): Promise<{ browser: Browser } | { error: string }> {
  try {
    const { chromium } = await import("playwright");
    return { browser: await chromium.launch() };
  } catch {
    return { error: "PDF renderer not installed. Run: npx playwright install chromium" };
  }
}
```

- [ ] **Step 4: Run the new test to verify it passes**

Run: `pnpm vitest run scripts/lib/chromiumLauncher.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Update `generate.ts` to import from the new module instead of defining it**

In `scripts/lib/pdfCatalog/generate.ts`, find the existing block (near the top-of-file type import and the function itself, around where `import type { Page, Browser } from "playwright";` appears):

Remove the local function definition entirely:

```typescript
export async function launchChromiumOrError(): Promise<{ browser: Browser } | { error: string }> {
  try {
    const { chromium } = await import("playwright");
    return { browser: await chromium.launch() };
  } catch {
    return { error: "PDF renderer not installed. Run: npx playwright install chromium" };
  }
}
```

Add an import instead, next to the other local-module imports:

```typescript
import { launchChromiumOrError } from "../chromiumLauncher";
```

Leave `import type { Page, Browser } from "playwright";` in place — `generate.ts` still uses `Page`/`Browser` as types elsewhere (e.g. `renderHtmlToPdfBytes`'s signature) — and leave both existing call sites (`generateCatalogPdf`, `generateFlyerPdf`) exactly as they are; they already just call `launchChromiumOrError()`.

- [ ] **Step 6: Update `generate.test.ts`'s import**

In `scripts/lib/pdfCatalog/generate.test.ts`, find the import that pulls `launchChromiumOrError` from `./generate` and change only that one specifier to the new module:

```typescript
import { launchChromiumOrError } from "../chromiumLauncher";
```

Leave every other import from `./generate` (and the rest of the file, including the pass-1/pass-2 page-count parity test that calls `launchChromiumOrError()` directly) untouched — per spec §20's correction, that test's real subject is PDF pagination, not the launcher, and it doesn't move.

- [ ] **Step 7: Run the full existing PDF test suite to confirm no regression**

Run: `pnpm vitest run scripts/lib/pdfCatalog/generate.test.ts`
Expected: PASS, same test count as before this change (real-Chromium tests soft-skip with `console.warn` if Chromium isn't installed in this environment — that's expected, not a failure).

- [ ] **Step 8: Type-check and lint**

Run: `pnpm type-check && pnpm lint`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add scripts/lib/chromiumLauncher.ts scripts/lib/chromiumLauncher.test.ts scripts/lib/pdfCatalog/generate.ts scripts/lib/pdfCatalog/generate.test.ts
git commit -m "$(cat <<'EOF'
refactor: extract launchChromiumOrError into a shared launcher module

Pure extraction, no behavior change — unblocks the URL-import headless
fallback (next task) reusing the same Playwright dependency and Chromium
install PDF export already needs, instead of adding a second one.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `checkHostnameAllowed` — address-carrying, multi-address SSRF check

**Files:**
- Modify: `scripts/lib/ssrfGuard.ts`
- Modify: `scripts/lib/ssrfGuard.test.ts`

**Interfaces:**
- Consumes: nothing new (uses the existing `dnsLookupImpl`/`addressValidatorImpl` seams already in this file).
- Produces: `checkHostnameAllowed(hostname: string): Promise<{ allowed: true; address: string; family: 4 | 6 } | { allowed: false; reason: string }>` — consumed by Task 4 (`headlessImport.ts`'s per-request interception).

This refactors `resolveAndValidate`'s validation logic into a reusable, non-throwing function, **without changing `resolveAndValidate`'s or `fetchUrlSafely`'s own behavior at all** — same one DNS lookup, same socket pinning, same multi-address rejection rule. See spec §6.3 and its §20/§21 corrections: the function must resolve *every* address a hostname returns and reject if *any* one is disallowed (not just the first, which is all that ever gets used for the actual connection) — this is exactly what the existing `resolveAndValidate` already does; this task only gives that logic a second entry point that doesn't throw and that a caller outside this file's normal exception-based flow (Task 4) can use directly.

- [ ] **Step 1: Write the failing tests**

Add to `scripts/lib/ssrfGuard.test.ts` (alongside its existing `resolveAndValidate`/`fetchUrlSafely` test blocks — check the existing `__setDnsLookupForTests` usage pattern in this file and match it):

```typescript
import { checkHostnameAllowed } from "./ssrfGuard";

describe("checkHostnameAllowed", () => {
  afterEach(() => {
    __setDnsLookupForTests(null);
  });

  it("returns the resolved address and family when a hostname's only address is allowed", async () => {
    __setDnsLookupForTests(async () => [{ address: "93.184.216.34", family: 4 }]);

    const result = await checkHostnameAllowed("example.com");

    expect(result).toEqual({ allowed: true, address: "93.184.216.34", family: 4 });
  });

  it("rejects when the hostname resolves to a disallowed address", async () => {
    __setDnsLookupForTests(async () => [{ address: "127.0.0.1", family: 4 }]);

    const result = await checkHostnameAllowed("localhost.example");

    expect(result.allowed).toBe(false);
  });

  it("rejects if ANY of several resolved addresses is disallowed, even if the first is fine", async () => {
    __setDnsLookupForTests(async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ]);

    const result = await checkHostnameAllowed("mixed.example");

    expect(result.allowed).toBe(false);
  });

  it("returns the first address when a hostname resolves to multiple allowed addresses", async () => {
    __setDnsLookupForTests(async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "93.184.216.35", family: 4 },
    ]);

    const result = await checkHostnameAllowed("multi.example");

    expect(result).toEqual({ allowed: true, address: "93.184.216.34", family: 4 });
  });

  it("rejects (does not throw) when DNS resolution fails", async () => {
    __setDnsLookupForTests(async () => {
      throw new Error("ENOTFOUND");
    });

    const result = await checkHostnameAllowed("nonexistent.invalid");

    expect(result.allowed).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run scripts/lib/ssrfGuard.test.ts -t checkHostnameAllowed`
Expected: FAIL — `checkHostnameAllowed` is not exported yet.

- [ ] **Step 3: Implement it, and rebuild `resolveAndValidate` as a thin wrapper around it**

In `scripts/lib/ssrfGuard.ts`, replace the existing `resolveAndValidate` function with:

```typescript
export async function checkHostnameAllowed(
  hostname: string,
): Promise<{ allowed: true; address: string; family: 4 | 6 } | { allowed: false; reason: string }> {
  if (net.isIP(hostname)) {
    if (addressValidatorImpl(hostname)) {
      return { allowed: false, reason: `Disallowed address: ${hostname}` };
    }
    return { allowed: true, address: hostname, family: net.isIPv6(hostname) ? 6 : 4 };
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await dnsLookupImpl(hostname);
  } catch (err) {
    return {
      allowed: false,
      reason: `DNS resolution failed for ${hostname}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (addresses.length === 0) {
    return { allowed: false, reason: `DNS resolution returned no addresses for ${hostname}` };
  }
  // A domain that resolves to a mix of public and private addresses is
  // treated as fully untrustworthy -- reject on ANY disallowed hit, even
  // though only the first address below is ever actually used to connect.
  for (const { address } of addresses) {
    if (addressValidatorImpl(address)) {
      return { allowed: false, reason: `Disallowed resolved address for ${hostname}: ${address}` };
    }
  }
  const first = addresses[0]!;
  return { allowed: true, address: first.address, family: first.family === 6 ? 6 : 4 };
}

async function resolveAndValidate(hostname: string): Promise<PinnedAddress> {
  const check = await checkHostnameAllowed(hostname);
  if (!check.allowed) {
    throw new SsrfError(check.reason);
  }
  return { address: check.address, family: check.family };
}
```

`PinnedAddress` already exists above this in the file (`type PinnedAddress = { address: string; family: 4 | 6 };`) — no change needed there. Nothing else in this file changes: `fetchUrlSafely` continues to call `resolveAndValidate` exactly as before.

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `pnpm vitest run scripts/lib/ssrfGuard.test.ts -t checkHostnameAllowed`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the full existing ssrfGuard suite to confirm zero regression**

Run: `pnpm vitest run scripts/lib/ssrfGuard.test.ts`
Expected: PASS, every pre-existing test (including the multi-address-rejection one the refactor must not weaken, and the real-socket end-to-end test) still passes unchanged.

- [ ] **Step 6: Type-check and lint**

Run: `pnpm type-check && pnpm lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/ssrfGuard.ts scripts/lib/ssrfGuard.test.ts
git commit -m "$(cat <<'EOF'
refactor(ssrfGuard): extract checkHostnameAllowed as a reusable, non-throwing check

resolveAndValidate becomes a thin wrapper around it with zero behavior
change (same single DNS lookup, same socket pinning, same reject-on-any-
disallowed-address rule). Gives the upcoming headless-browser fallback a
way to reuse the exact same SSRF validation per intercepted request
without duplicating the address-range logic.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Referer header, richer request headers, and streaming decompression in `fetchUrlSafely`

**Files:**
- Modify: `scripts/lib/ssrfGuard.ts`
- Modify: `scripts/lib/ssrfGuard.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `SafeFetchOptions` gains `referer?: string`; `fetchUrlSafely`'s behavior on a compressed response changes (transparent decompression) — consumed by Task 6 (referer threading) and Task 7 (thumbnail route), and exercised implicitly by every existing caller.

**The security-critical part of this task is the decompression cap, not the headers.** Per spec §8/§21: today's `maxBytes` cap runs on raw wire bytes as they stream in. Advertising `Accept-Encoding` means a response can now arrive compressed — decompressing an already-capped buffer *after* collection would cap only the *compressed* size, letting a small adversarial payload expand to gigabytes in memory. The cap must move to count *decompressed* output bytes, via a streaming `zlib` transform, not a `zlib.gunzipSync` call on the final buffer.

- [ ] **Step 1: Write the failing tests**

This file already has exactly the fixture this needs: a `describe("fetchUrlSafely — end-to-end mechanics against a real server (loopback trusted for test reachability)", ...)` block with a shared `beforeEach`/`afterEach` (`__setAddressValidatorForTests(allowLoopbackOnly)` / `(null)`) and two helpers, `listen(server): Promise<number>` and `closeAll(servers): Promise<void[]>`. Add these as new `it(...)` cases inside that *same* describe block — they need the identical setup, not a new one:

```typescript
// Add near the top of the file, alongside the other imports:
import * as zlib from "zlib";

// New it() cases inside the existing "end-to-end mechanics" describe block:

it("sends the Referer header when options.referer is provided", async () => {
  let receivedReferer: string | undefined;
  const server = http.createServer((req, res) => {
    receivedReferer = req.headers.referer;
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<html></html>");
  });
  const port = await listen(server);
  try {
    await fetchUrlSafely(`http://127.0.0.1:${port}/`, {
      timeoutMs: 2000,
      maxBytes: 10_000,
      referer: "https://seller-pasted-site.example/listing/123",
    });
    expect(receivedReferer).toBe("https://seller-pasted-site.example/listing/123");
  } finally {
    await closeAll([server]);
  }
});

it("sends no Referer header when options.referer is omitted", async () => {
  let receivedReferer: string | undefined;
  const server = http.createServer((req, res) => {
    receivedReferer = req.headers.referer;
    res.end("ok");
  });
  const port = await listen(server);
  try {
    await fetchUrlSafely(`http://127.0.0.1:${port}/`, { timeoutMs: 2000, maxBytes: 10_000 });
    expect(receivedReferer).toBeUndefined();
  } finally {
    await closeAll([server]);
  }
});

it("transparently decompresses a gzip response", async () => {
  const server = http.createServer((_req, res) => {
    const body = zlib.gzipSync(Buffer.from("hello from gzip"));
    res.writeHead(200, { "Content-Encoding": "gzip" });
    res.end(body);
  });
  const port = await listen(server);
  try {
    const result = await fetchUrlSafely(`http://127.0.0.1:${port}/`, { timeoutMs: 2000, maxBytes: 10_000 });
    expect(result.bytes.toString("utf-8")).toBe("hello from gzip");
  } finally {
    await closeAll([server]);
  }
});

it("caps DECOMPRESSED size, not compressed size — rejects a small payload that expands past maxBytes", async () => {
  // 200KB of a single repeated byte compresses to well under 2KB, but
  // decompresses back to 200KB -- bigger than the tiny maxBytes below. If
  // the cap were (wrongly) applied to wire bytes, this would pass.
  const huge = Buffer.alloc(200_000, "a");
  const compressed = zlib.gzipSync(huge);
  expect(compressed.length).toBeLessThan(2_000); // sanity: tiny on the wire

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Encoding": "gzip" });
    res.end(compressed);
  });
  const port = await listen(server);
  try {
    await expect(
      fetchUrlSafely(`http://127.0.0.1:${port}/`, { timeoutMs: 2000, maxBytes: 10_000 }),
    ).rejects.toThrow(/exceeded maxBytes/);
  } finally {
    await closeAll([server]);
  }
});

it("passes an uncompressed response through unchanged (no content-encoding header)", async () => {
  const server = http.createServer((_req, res) => {
    res.end("plain text, no encoding");
  });
  const port = await listen(server);
  try {
    const result = await fetchUrlSafely(`http://127.0.0.1:${port}/`, { timeoutMs: 2000, maxBytes: 10_000 });
    expect(result.bytes.toString("utf-8")).toBe("plain text, no encoding");
  } finally {
    await closeAll([server]);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run scripts/lib/ssrfGuard.test.ts -t "Referer|decompresses|DECOMPRESSED|uncompressed"`
Expected: FAIL — `referer` isn't a recognized option yet; responses aren't decompressed yet, so the gzip test's assertion on plain-text content fails and the cap test doesn't reject (or rejects for the wrong reason).

- [ ] **Step 3: Add `referer` to `SafeFetchOptions` and the request headers**

In `scripts/lib/ssrfGuard.ts`, update the options type:

```typescript
export type SafeFetchOptions = {
  timeoutMs: number;
  maxBytes: number;
  maxRedirects?: number;
  userAgent?: string;
  referer?: string;
};
```

In `fetchUrlSafely`, find the `requestOptions.headers` object (`{ Host: currentUrl.host, "User-Agent": userAgent }`) and extend it:

```typescript
headers: {
  Host: currentUrl.host,
  "User-Agent": userAgent,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  ...(options.referer ? { Referer: options.referer } : {}),
},
```

- [ ] **Step 4: Run the header tests to verify they pass**

Run: `pnpm vitest run scripts/lib/ssrfGuard.test.ts -t Referer`
Expected: PASS (2 tests)

- [ ] **Step 5: Add the streaming decompression + moved byte cap**

Add the import at the top of `scripts/lib/ssrfGuard.ts`:

```typescript
import * as zlib from "zlib";
```

Add this helper near `stripContentType`:

```typescript
function pickDecompressor(contentEncoding: string | string[] | undefined): NodeJS.ReadWriteStream | null {
  const value = Array.isArray(contentEncoding) ? contentEncoding[0] : contentEncoding;
  switch ((value ?? "").trim().toLowerCase()) {
    case "gzip":
      return zlib.createGunzip();
    case "deflate":
      return zlib.createInflate();
    case "br":
      return zlib.createBrotliDecompress();
    default:
      return null;
  }
}
```

Inside `fetchUrlSafely`'s `transport.request(requestOptions, (res) => { ... })` callback, replace the existing body-collection block (the `const contentType = ...` line through the `req.on("error", ...)` line's matching `res.on(...)` handlers) with:

```typescript
const contentType = stripContentType(res.headers["content-type"]);
const decompressor = pickDecompressor(res.headers["content-encoding"]);
// The cap runs on whatever stream produces the FINAL content bytes -- the
// decompressor's output when one exists, never on compressed wire bytes.
// Capping compressed size only would let a small adversarial payload
// expand to gigabytes in memory before any check ever saw the real size.
const source: NodeJS.ReadableStream = decompressor ? res.pipe(decompressor) : res;

const chunks: Buffer[] = [];
let total = 0;
let destroyed = false;

const fail = (err: Error) => {
  if (destroyed) return;
  destroyed = true;
  res.destroy();
  decompressor?.destroy();
  rejectPromise(err);
};

source.on("data", (chunk: Buffer) => {
  if (destroyed) return;
  total += chunk.length;
  if (total > options.maxBytes) {
    fail(new SsrfError(`Response exceeded maxBytes (${options.maxBytes})`));
    return;
  }
  chunks.push(chunk);
});
source.on("end", () => {
  if (destroyed) return;
  resolvePromise({
    kind: "final",
    result: {
      bytes: Buffer.concat(chunks),
      contentType,
      finalUrl: currentUrl.toString(),
    },
  });
});
source.on("error", fail);
// .pipe() does not forward 'error' events from its source by default --
// this must be attached regardless of whether decompression is in play,
// or a raw network error on `res` would go unhandled when source !== res.
res.on("error", fail);
```

This replaces the whole previous body-handling block (which used `res.on(...)` directly) — the redirect check just above it (`if (status >= 300 && status < 400 ...)`) stays exactly as it was.

- [ ] **Step 6: Run the decompression tests to verify they pass**

Run: `pnpm vitest run scripts/lib/ssrfGuard.test.ts -t "decompresses|DECOMPRESSED|uncompressed"`
Expected: PASS (3 tests) — including the decompression-bomb-shaped cap test.

- [ ] **Step 7: Run the full ssrfGuard and studioApi suites to confirm zero regression**

Run: `pnpm vitest run scripts/lib/ssrfGuard.test.ts scripts/lib/studioApi.test.ts`
Expected: PASS — every existing test (redirect handling, timeout, uncompressed responses, the URL-import preview/import handlers) still passes unchanged.

- [ ] **Step 8: Type-check and lint**

Run: `pnpm type-check && pnpm lint`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add scripts/lib/ssrfGuard.ts scripts/lib/ssrfGuard.test.ts
git commit -m "$(cat <<'EOF'
feat(ssrfGuard): add Referer support and safe response decompression

fetchUrlSafely now accepts an optional referer (for hotlink-protected
image downloads) and advertises Accept-Encoding, decompressing gzip/
deflate/br responses via a streaming zlib transform. The existing
maxBytes cap moves to count decompressed output bytes rather than wire
bytes, closing a decompression-bomb gap a naive "decompress the
already-capped buffer afterward" implementation would have opened.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `scripts/lib/headlessImport.ts` — the SSRF-guarded headless renderer

**Files:**
- Create: `scripts/lib/headlessImport.ts`
- Create: `scripts/lib/headlessImport.test.ts`

**Interfaces:**
- Consumes: `launchChromiumOrError` + `Browser` type (Task 1, `./chromiumLauncher`), `checkHostnameAllowed` (Task 2, `./ssrfGuard`).
- Produces:
  ```typescript
  export type HeadlessRenderResult =
    | { available: true; html: string; finalUrl: string }
    | { available: false; reason: "not-installed" | "navigation-failed" };
  export function renderWithHeadlessBrowser(url: string, options: { timeoutMs: number }): Promise<HeadlessRenderResult>;
  export function __setHeadlessRendererForTests(fn: typeof renderWithHeadlessBrowser | null): void;
  ```
  Consumed by Task 5 (`studioApi.ts`'s two-tier orchestration).

This is the security-critical core of the whole feature (spec §6). Every sub-behavior below is there because a specific review round (§19-§23) found a way the naive version of it breaks: the shared launcher is a stateless factory, so this module owns its own cache and self-heals it via `isConnected()`/`'disconnected'` (§20, §22) rather than guessing browser-death from a caught exception; every HTTP(S) sub-request is hostname-checked through the exact same `checkHostnameAllowed` the plain-fetch path uses (§19); WebSocket is blocked through the dedicated `routeWebSocket()` API because `context.route()` silently never sees WebSocket handshakes at all (§19); image/font/stylesheet/media/manifest/texttrack/other resource types are aborted outright since extraction only ever needs resolved `src` *strings*, never the bytes.

- [ ] **Step 1: Write the failing tests for availability detection**

```typescript
// scripts/lib/headlessImport.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./chromiumLauncher", () => ({
  launchChromiumOrError: vi.fn(),
}));
vi.mock("./ssrfGuard", () => ({
  checkHostnameAllowed: vi.fn(),
}));

import { launchChromiumOrError } from "./chromiumLauncher";
import { checkHostnameAllowed } from "./ssrfGuard";
import { renderWithHeadlessBrowser } from "./headlessImport";

function fakePage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    content: vi.fn().mockResolvedValue("<html><body>rendered</body></html>"),
    url: vi.fn().mockReturnValue("https://example.com/final"),
    ...overrides,
  };
}

function fakeContext(page: ReturnType<typeof fakePage>) {
  return {
    route: vi.fn().mockResolvedValue(undefined),
    routeWebSocket: vi.fn().mockResolvedValue(undefined),
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function fakeBrowser(context: ReturnType<typeof fakeContext>, connected = true) {
  const listeners: Record<string, () => void> = {};
  return {
    isConnected: vi.fn().mockReturnValue(connected),
    newContext: vi.fn().mockResolvedValue(context),
    on: vi.fn((event: string, cb: () => void) => {
      listeners[event] = cb;
    }),
    __fireDisconnected: () => listeners["disconnected"]?.(),
  };
}

describe("renderWithHeadlessBrowser — availability", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns not-installed when launchChromiumOrError fails", async () => {
    vi.mocked(launchChromiumOrError).mockResolvedValue({ error: "not installed" });

    const result = await renderWithHeadlessBrowser("https://example.com", { timeoutMs: 5000 });

    expect(result).toEqual({ available: false, reason: "not-installed" });
  });

  it("returns the rendered HTML and final URL on a successful navigation", async () => {
    vi.mocked(checkHostnameAllowed).mockResolvedValue({ allowed: true, address: "93.184.216.34", family: 4 });
    const page = fakePage();
    const context = fakeContext(page);
    vi.mocked(launchChromiumOrError).mockResolvedValue({ browser: fakeBrowser(context) as never });

    const result = await renderWithHeadlessBrowser("https://example.com", { timeoutMs: 5000 });

    expect(result).toEqual({
      available: true,
      html: "<html><body>rendered</body></html>",
      finalUrl: "https://example.com/final",
    });
    expect(context.close).toHaveBeenCalled();
  });

  it("still returns rendered content when navigation times out (non-fatal)", async () => {
    vi.mocked(checkHostnameAllowed).mockResolvedValue({ allowed: true, address: "93.184.216.34", family: 4 });
    const page = fakePage({ goto: vi.fn().mockRejectedValue(new Error("Timeout 5000ms exceeded")) });
    const context = fakeContext(page);
    vi.mocked(launchChromiumOrError).mockResolvedValue({ browser: fakeBrowser(context) as never });

    const result = await renderWithHeadlessBrowser("https://example.com", { timeoutMs: 5000 });

    expect(result.available).toBe(true);
  });

  it("returns navigation-failed when reading content throws after a successful launch", async () => {
    vi.mocked(checkHostnameAllowed).mockResolvedValue({ allowed: true, address: "93.184.216.34", family: 4 });
    const page = fakePage({ content: vi.fn().mockRejectedValue(new Error("page crashed")) });
    const context = fakeContext(page);
    vi.mocked(launchChromiumOrError).mockResolvedValue({ browser: fakeBrowser(context) as never });

    const result = await renderWithHeadlessBrowser("https://example.com", { timeoutMs: 5000 });

    expect(result).toEqual({ available: false, reason: "navigation-failed" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run scripts/lib/headlessImport.test.ts`
Expected: FAIL — `scripts/lib/headlessImport.ts` does not exist yet.

- [ ] **Step 3: Implement the module's lifecycle, caching, and self-healing (no interception yet)**

```typescript
// scripts/lib/headlessImport.ts
// SSRF-guarded headless-Chromium fallback for Studio's URL-import feature.
// Runs only when the plain-HTTP fetch (scripts/lib/urlImport.ts +
// scripts/lib/ssrfGuard.ts) finds zero photo candidates -- most sites
// never reach this module at all. See
// docs/superpowers/specs/2026-09-08-studio-url-import-reliability-design.md §6.

import type { Browser, BrowserContext } from "playwright";
import { launchChromiumOrError } from "./chromiumLauncher";
import { checkHostnameAllowed } from "./ssrfGuard";

export type HeadlessRenderResult =
  | { available: true; html: string; finalUrl: string }
  | { available: false; reason: "not-installed" | "navigation-failed" };
// "not-installed" covers everything launchChromiumOrError() collapses
// into its one generic { error } case (missing package, missing Chromium
// binary, or any other launch-time failure) -- the actionable advice is
// the same either way. "navigation-failed" is for a failure *after* a
// successful launch that isn't a plain timeout (a timeout is non-fatal,
// see renderOnce below).

// Kept warm for the life of the Studio server process to avoid paying
// Chromium's cold-launch cost on every import -- launchChromiumOrError()
// itself is a stateless per-call factory (shared with PDF export), so
// this caching is this module's own responsibility, not that function's.
let cachedBrowser: Browser | null = null;

async function getBrowser(): Promise<{ browser: Browser } | { error: string }> {
  if (cachedBrowser && cachedBrowser.isConnected()) {
    return { browser: cachedBrowser };
  }
  const launch = await launchChromiumOrError();
  if ("error" in launch) return launch;
  cachedBrowser = launch.browser;
  const launched = launch.browser;
  // Proactive self-healing: a browser that dies between requests (crash,
  // OOM-kill) is detected the moment it happens, not just discovered the
  // next time something tries to use it. isConnected() above is the
  // belt-and-braces synchronous check for the gap between "it disconnected"
  // and "this listener fired".
  launched.on("disconnected", () => {
    if (cachedBrowser === launched) cachedBrowser = null;
  });
  return { browser: launched };
}

const BLOCKED_RESOURCE_TYPES = new Set([
  "image",
  "media",
  "font",
  "stylesheet",
  "manifest",
  "texttrack",
  "other",
]);

async function guardRequests(context: BrowserContext): Promise<void> {
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (BLOCKED_RESOURCE_TYPES.has(request.resourceType())) {
      await route.abort();
      return;
    }
    let hostname: string;
    try {
      hostname = new URL(request.url()).hostname;
    } catch {
      await route.abort();
      return;
    }
    const check = await checkHostnameAllowed(hostname);
    if (!check.allowed) {
      await route.abort();
      return;
    }
    await route.continue();
  });
  // WebSocket handshakes are a separate mechanism entirely -- context.route()
  // never sees them at all (a known Playwright limitation). Matched with a
  // regex, not a bare string: the glob matcher used above gets confused by
  // the wss:// scheme. Never calling connectToServer() mocks every
  // WebSocket as silently opened and never forwards anything to a real
  // server -- a full block, fine since gallery extraction never needs a
  // live WebSocket.
  await context.routeWebSocket(/.*/, () => {
    // Intentionally empty.
  });
}

async function renderOnce(browser: Browser, url: string, timeoutMs: number): Promise<HeadlessRenderResult> {
  let context: BrowserContext | null = null;
  try {
    context = await browser.newContext();
    await guardRequests(context);
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: timeoutMs });
    } catch {
      // Non-fatal: read whatever state was reached instead of giving up,
      // matching extractImportCandidates's own "degrade, don't throw"
      // philosophy for adversarial/malformed input.
    }

    const html = await page.content();
    const finalUrl = page.url();
    return { available: true, html, finalUrl };
  } catch {
    return { available: false, reason: "navigation-failed" };
  } finally {
    await context?.close();
  }
}

async function renderWithHeadlessBrowserImpl(
  url: string,
  options: { timeoutMs: number },
): Promise<HeadlessRenderResult> {
  const browserResult = await getBrowser();
  if ("error" in browserResult) {
    return { available: false, reason: "not-installed" };
  }
  return renderOnce(browserResult.browser, url, options.timeoutMs);
}

let rendererImpl = renderWithHeadlessBrowserImpl;

export function renderWithHeadlessBrowser(
  url: string,
  options: { timeoutMs: number },
): Promise<HeadlessRenderResult> {
  return rendererImpl(url, options);
}

/** Test-only injection seam, mirrors ssrfGuard.ts's __setDnsLookupForTests. */
export function __setHeadlessRendererForTests(
  fn: typeof renderWithHeadlessBrowserImpl | null,
): void {
  rendererImpl = fn ?? renderWithHeadlessBrowserImpl;
}
```

- [ ] **Step 4: Run the availability tests to verify they pass**

Run: `pnpm vitest run scripts/lib/headlessImport.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Write the failing tests for request interception (the security-critical part)**

Append to `scripts/lib/headlessImport.test.ts`:

```typescript
describe("renderWithHeadlessBrowser — request interception", () => {
  afterEach(() => vi.clearAllMocks());

  it("aborts asset-shaped resource types without ever checking their hostname", async () => {
    const page = fakePage();
    const context = fakeContext(page);
    vi.mocked(launchChromiumOrError).mockResolvedValue({ browser: fakeBrowser(context) as never });

    await renderWithHeadlessBrowser("https://example.com", { timeoutMs: 5000 });

    const routeHandler = context.route.mock.calls[0][1] as (route: unknown) => Promise<void>;
    const abort = vi.fn();
    for (const resourceType of ["image", "media", "font", "stylesheet", "manifest", "texttrack", "other"]) {
      await routeHandler({
        request: () => ({ resourceType: () => resourceType, url: () => "https://cdn.example/x" }),
        abort,
        continue: vi.fn(),
      });
    }
    expect(abort).toHaveBeenCalledTimes(7);
    expect(checkHostnameAllowed).not.toHaveBeenCalled();
  });

  it("allows a document/script/xhr/fetch request whose hostname passes checkHostnameAllowed", async () => {
    vi.mocked(checkHostnameAllowed).mockResolvedValue({ allowed: true, address: "93.184.216.34", family: 4 });
    const page = fakePage();
    const context = fakeContext(page);
    vi.mocked(launchChromiumOrError).mockResolvedValue({ browser: fakeBrowser(context) as never });

    await renderWithHeadlessBrowser("https://example.com", { timeoutMs: 5000 });

    const routeHandler = context.route.mock.calls[0][1] as (route: unknown) => Promise<void>;
    const continueFn = vi.fn();
    await routeHandler({
      request: () => ({ resourceType: () => "xhr", url: () => "https://api.example.com/data" }),
      abort: vi.fn(),
      continue: continueFn,
    });

    expect(checkHostnameAllowed).toHaveBeenCalledWith("api.example.com");
    expect(continueFn).toHaveBeenCalled();
  });

  it("aborts a document/script/xhr/fetch request whose hostname is disallowed", async () => {
    vi.mocked(checkHostnameAllowed).mockResolvedValue({ allowed: false, reason: "internal address" });
    const page = fakePage();
    const context = fakeContext(page);
    vi.mocked(launchChromiumOrError).mockResolvedValue({ browser: fakeBrowser(context) as never });

    await renderWithHeadlessBrowser("https://example.com", { timeoutMs: 5000 });

    const routeHandler = context.route.mock.calls[0][1] as (route: unknown) => Promise<void>;
    const abort = vi.fn();
    await routeHandler({
      request: () => ({ resourceType: () => "fetch", url: () => "http://169.254.169.254/latest/meta-data" }),
      abort,
      continue: vi.fn(),
    });

    expect(abort).toHaveBeenCalled();
  });

  it("registers a routeWebSocket handler that never calls connectToServer", async () => {
    const page = fakePage();
    const context = fakeContext(page);
    vi.mocked(launchChromiumOrError).mockResolvedValue({ browser: fakeBrowser(context) as never });

    await renderWithHeadlessBrowser("https://example.com", { timeoutMs: 5000 });

    expect(context.routeWebSocket).toHaveBeenCalledWith(expect.any(RegExp), expect.any(Function));
    const wsHandler = context.routeWebSocket.mock.calls[0][1] as (ws: unknown) => void;
    const connectToServer = vi.fn();
    wsHandler({ connectToServer });
    expect(connectToServer).not.toHaveBeenCalled();
  });
});

describe("renderWithHeadlessBrowser — self-healing cache", () => {
  afterEach(() => vi.clearAllMocks());

  it("relaunches when the cached browser reports isConnected() === false", async () => {
    vi.mocked(checkHostnameAllowed).mockResolvedValue({ allowed: true, address: "1.2.3.4", family: 4 });
    const page = fakePage();
    const context = fakeContext(page);
    const deadBrowser = fakeBrowser(context, false);
    const freshBrowser = fakeBrowser(context, true);
    vi.mocked(launchChromiumOrError)
      .mockResolvedValueOnce({ browser: deadBrowser as never })
      .mockResolvedValueOnce({ browser: freshBrowser as never });

    await renderWithHeadlessBrowser("https://example.com", { timeoutMs: 5000 }); // caches deadBrowser
    // Simulate the disconnected event firing between calls.
    deadBrowser.__fireDisconnected();
    await renderWithHeadlessBrowser("https://example.com", { timeoutMs: 5000 });

    expect(launchChromiumOrError).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm vitest run scripts/lib/headlessImport.test.ts -t "interception|self-healing"`
Expected: FAIL — interception/WebSocket-blocking/self-healing aren't implemented in Step 3's version (self-healing is actually already implemented from Step 3 — this test should already pass; the resource-type/hostname/WebSocket tests should pass too, since Step 3's `guardRequests` already includes them. This step exists to confirm that explicitly before moving on — if any of these fail, re-check Step 3's `guardRequests` and `getBrowser` against the code above.)

- [ ] **Step 7: Run the full file to verify everything passes**

Run: `pnpm vitest run scripts/lib/headlessImport.test.ts`
Expected: PASS (all tests from Steps 1 and 5)

- [ ] **Step 8: Type-check and lint**

Run: `pnpm type-check && pnpm lint`
Expected: no errors. (If `BrowserContext`'s TypeScript types don't expose `routeWebSocket` in the installed `playwright` version, check `node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/types/types.d.ts` for the exact method name/signature and adjust — it was confirmed present during the design's review, spec §19/§21.)

- [ ] **Step 9: Commit**

```bash
git add scripts/lib/headlessImport.ts scripts/lib/headlessImport.test.ts
git commit -m "$(cat <<'EOF'
feat(studio): add SSRF-guarded headless-Chromium render fallback

New scripts/lib/headlessImport.ts: renders a page with real Chromium when
the plain-HTTP fetch finds nothing (JS-rendered galleries, bot-defended
pages). Every HTTP(S) sub-request is hostname-checked through the exact
same checkHostnameAllowed the plain-fetch path uses; asset resource types
are aborted outright since extraction only needs resolved src strings;
WebSocket is blocked via the dedicated routeWebSocket API since
context.route() never sees WebSocket handshakes at all. The shared
Chromium instance self-heals via isConnected()/'disconnected' rather than
inferring death from a caught navigation exception. Not yet wired into
the URL-import preview endpoint -- next task.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Wire the two-tier fetch into `handleImportUrlPreview`

**Files:**
- Modify: `scripts/lib/studioApi.ts`
- Modify: `scripts/lib/studioApi.test.ts`

**Interfaces:**
- Consumes: `renderWithHeadlessBrowser`, `__setHeadlessRendererForTests` (Task 4, `./headlessImport`).
- Produces: `POST /api/import-url/preview`'s response gains `usedHeadlessFallback: boolean` and `headlessFailureReason: "not-installed" | "navigation-failed" | null` — consumed by Task 8 (client types) and Task 9 (UI messaging).

Per spec §6.4/§11.1: Tier 2 runs if and only if Tier 1's `images.length === 0`, regardless of whether a name was found. `headlessFailureReason` is `null` in three cases — Tier 1 already succeeded, Tier 2 rendered fine and found candidates, or Tier 2 rendered fine and still found nothing (an `available: true` result carries no reason at all, since a genuinely-rendered site with no photos isn't a failure of the fallback) — the UI (Task 9) treats that third `null` case the same as `"navigation-failed"`.

- [ ] **Step 1: Write the failing tests**

This file already has a `describe("POST /api/import-url/preview", ...)` block with a `beforeEach` that resets the module-level `fetchUrlSafelyMock` (`vi.mock("./ssrfGuard", ...)` at the top of the file), a local `preview(url)` helper that calls `handleStudioRequest` with the right method/url/body/`projectRoot: PROJECT_ROOT`, and an `asJson(res)` cast helper. Add these `it()` cases inside that *same* describe block, alongside its existing ones, and add the import + a describe-scoped `afterEach` for the new test seam:

```typescript
// Add near the top of the file, alongside the other local imports:
import { __setHeadlessRendererForTests } from "./headlessImport";

// Add inside the existing describe("POST /api/import-url/preview", ...) block,
// alongside its existing beforeEach:
afterEach(() => __setHeadlessRendererForTests(null));

// New it() cases in that same block:

it("does not invoke the headless fallback when Tier 1 already finds images", async () => {
  fetchUrlSafelyMock.mockResolvedValue({
    bytes: Buffer.from(
      `<html><head><meta property="og:image" content="/photo.jpg"></head></html>`,
      "utf-8",
    ),
    contentType: "text/html",
    finalUrl: "https://example.com/listing",
  });
  let headlessCalled = false;
  __setHeadlessRendererForTests(async () => {
    headlessCalled = true;
    return { available: true, html: "<html></html>", finalUrl: "https://example.com" };
  });

  const res = asJson(await preview("https://example.com/listing"));

  expect(headlessCalled).toBe(false);
  const body = res.body as { usedHeadlessFallback: boolean; headlessFailureReason: unknown };
  expect(body.usedHeadlessFallback).toBe(false);
  expect(body.headlessFailureReason).toBeNull();
});

it("invokes the headless fallback and returns its candidates when Tier 1 finds zero images", async () => {
  fetchUrlSafelyMock.mockResolvedValue({
    bytes: Buffer.from("<html><body><div id=\"app\"></div></body></html>", "utf-8"), // SPA shell, nothing to extract
    contentType: "text/html",
    finalUrl: "https://example.com/listing",
  });
  __setHeadlessRendererForTests(async () => ({
    available: true,
    html: '<html><head><meta property="og:image" content="https://example.com/photo.jpg"></head></html>',
    finalUrl: "https://example.com/rendered",
  }));

  const res = asJson(await preview("https://example.com/listing"));

  const body = res.body as { images: string[]; usedHeadlessFallback: boolean; headlessFailureReason: unknown };
  expect(body.usedHeadlessFallback).toBe(true);
  expect(body.images).toContain("https://example.com/photo.jpg");
  expect(body.headlessFailureReason).toBeNull();
});

it("sets headlessFailureReason to not-installed when the fallback is unavailable", async () => {
  fetchUrlSafelyMock.mockResolvedValue({
    bytes: Buffer.from("<html><body></body></html>", "utf-8"),
    contentType: "text/html",
    finalUrl: "https://example.com/listing",
  });
  __setHeadlessRendererForTests(async () => ({ available: false, reason: "not-installed" }));

  const res = asJson(await preview("https://example.com/listing"));

  const body = res.body as { usedHeadlessFallback: boolean; headlessFailureReason: unknown };
  expect(body.usedHeadlessFallback).toBe(true);
  expect(body.headlessFailureReason).toBe("not-installed");
});

it("sets headlessFailureReason to null when the fallback runs fine but still finds zero images", async () => {
  fetchUrlSafelyMock.mockResolvedValue({
    bytes: Buffer.from("<html><body></body></html>", "utf-8"),
    contentType: "text/html",
    finalUrl: "https://example.com/listing",
  });
  __setHeadlessRendererForTests(async () => ({
    available: true,
    html: "<html><body>nothing here</body></html>",
    finalUrl: "https://example.com/rendered",
  }));

  const res = asJson(await preview("https://example.com/listing"));

  const body = res.body as { images: string[]; usedHeadlessFallback: boolean; headlessFailureReason: unknown };
  expect(body.images).toEqual([]);
  expect(body.usedHeadlessFallback).toBe(true);
  expect(body.headlessFailureReason).toBeNull();
});

it("sets headlessFailureReason to navigation-failed when the fallback errors after launching", async () => {
  fetchUrlSafelyMock.mockResolvedValue({
    bytes: Buffer.from("<html><body></body></html>", "utf-8"),
    contentType: "text/html",
    finalUrl: "https://example.com/listing",
  });
  __setHeadlessRendererForTests(async () => ({ available: false, reason: "navigation-failed" }));

  const res = asJson(await preview("https://example.com/listing"));

  const body = res.body as { headlessFailureReason: unknown };
  expect(body.headlessFailureReason).toBe("navigation-failed");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run scripts/lib/studioApi.test.ts -t "two-tier fallback"`
Expected: FAIL — the response has no `usedHeadlessFallback`/`headlessFailureReason` fields yet, and the headless renderer is never invoked.

- [ ] **Step 3: Implement the two-tier trigger in `handleImportUrlPreview`**

In `scripts/lib/studioApi.ts`, add the import:

```typescript
import { renderWithHeadlessBrowser } from "./headlessImport";
```

Add a constant near the existing `IMPORT_PAGE_FETCH_TIMEOUT_MS`/`IMPORT_PAGE_MAX_BYTES` block:

```typescript
// Headless rendering is inherently slower than a plain fetch (cold
// navigation + JS execution + a settle wait) -- more generous than the
// plain-fetch timeout, but still bounded so a pathological page can't
// hang a preview request indefinitely.
const IMPORT_HEADLESS_TIMEOUT_MS = 20_000;
```

Replace the body of `handleImportUrlPreview` (from where it currently computes `{ name, images }` through its `return` statement) with:

```typescript
async function handleImportUrlPreview(req: StudioRequest): Promise<StudioResponse> {
  const { url } = parseJsonBody(req.body, importUrlPreviewBodySchema);

  let fetched: Awaited<ReturnType<typeof fetchUrlSafely>>;
  try {
    fetched = await fetchUrlSafely(url, {
      timeoutMs: IMPORT_PAGE_FETCH_TIMEOUT_MS,
      maxBytes: IMPORT_PAGE_MAX_BYTES,
    });
  } catch (err: unknown) {
    throw new StudioError(400, `could not fetch that page: ${importFetchErrorMessage(err)}`);
  }

  if (fetched.contentType !== "" && !fetched.contentType.includes("html") && !fetched.contentType.includes("text")) {
    return { status: 200, body: { name: null, images: [], usedHeadlessFallback: false, headlessFailureReason: null } };
  }

  const html = fetched.bytes.toString("utf-8");
  const tier1 = extractImportCandidates(html, fetched.finalUrl);

  if (tier1.images.length > 0) {
    return {
      status: 200,
      body: { ...tier1, usedHeadlessFallback: false, headlessFailureReason: null },
    };
  }

  const rendered = await renderWithHeadlessBrowser(fetched.finalUrl, { timeoutMs: IMPORT_HEADLESS_TIMEOUT_MS });
  if (!rendered.available) {
    return {
      status: 200,
      body: { ...tier1, usedHeadlessFallback: true, headlessFailureReason: rendered.reason },
    };
  }

  const tier2 = extractImportCandidates(rendered.html, rendered.finalUrl);
  return {
    status: 200,
    body: { ...tier2, usedHeadlessFallback: true, headlessFailureReason: null },
  };
}
```

This preserves every existing line of Tier-1 behavior (the content-type short-circuit, the error message on a failed fetch) and adds Tier 2 strictly as a follow-up when `tier1.images.length === 0`.

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `pnpm vitest run scripts/lib/studioApi.test.ts -t "headless fallback|not-installed|navigation-failed"`
Expected: PASS (5 tests)

- [ ] **Step 5: Update two pre-existing tests whose exact-equality assertions predate the two new response fields**

Run the full file now (`pnpm vitest run scripts/lib/studioApi.test.ts`) and two pre-existing tests in this same describe block will fail — not a regression, an expected consequence of Step 3 adding two fields to every response from this handler. They assert `res.body` via `toEqual(...)` against the *old*, narrower shape:

`"extracts name and images from the fetched page"` currently ends with:

```typescript
expect(res.body).toEqual({
  name: "Vintage Desk Lamp",
  images: ["https://example.com/photos/lamp.jpg"],
});
```

Update it to:

```typescript
expect(res.body).toEqual({
  name: "Vintage Desk Lamp",
  images: ["https://example.com/photos/lamp.jpg"],
  usedHeadlessFallback: false,
  headlessFailureReason: null,
});
```

`"reports empty candidates for a non-HTML response instead of parsing binary as text"` currently ends with:

```typescript
expect(res.body).toEqual({ name: null, images: [] });
```

Update it to:

```typescript
expect(res.body).toEqual({
  name: null,
  images: [],
  usedHeadlessFallback: false,
  headlessFailureReason: null,
});
```

(The third existing test, `"treats a missing content-type as HTML rather than refusing to parse"`, uses `toMatchObject` rather than `toEqual` and needs no change — a subset match tolerates the two extra fields. The SSRF-rejection and validation-error tests return a different, error-shaped body entirely and are likewise unaffected.)

- [ ] **Step 6: Run the full studioApi suite to confirm zero regression**

Run: `pnpm vitest run scripts/lib/studioApi.test.ts`
Expected: PASS — every test in this file, including the two just updated and the fetch-failure/validation-error cases that were never touched.

- [ ] **Step 7: Type-check and lint**

Run: `pnpm type-check && pnpm lint`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/studioApi.ts scripts/lib/studioApi.test.ts
git commit -m "$(cat <<'EOF'
feat(studio): wire the headless-Chromium fallback into URL-import preview

handleImportUrlPreview now falls back to renderWithHeadlessBrowser only
when the existing plain-HTTP fetch finds zero photo candidates, and
reports whether the fallback ran and why it failed (not-installed vs
navigation-failed) so the UI can give advice that matches what actually
happened, rather than collapsing both into one generic message.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Thread an origin-only Referer into `handleImageImport`

**Files:**
- Modify: `scripts/lib/studioApi.ts`
- Modify: `scripts/lib/studioApi.test.ts`

**Interfaces:**
- Consumes: `SafeFetchOptions.referer` (Task 3).
- Produces: `importImagesBodySchema` gains optional `sourceUrl`; `handleImageImport` passes an origin-derived `referer` to `fetchUrlSafely` — consumed by Task 8 (client sends `sourceUrl`) and Task 9 (`NewItemDialog.tsx` supplies it).

Per spec §11.2/§21: only the *origin* (scheme+host+port) of `sourceUrl` is sent, never its full path/query — matching the `strict-origin-when-cross-origin` policy browsers already default to for cross-origin requests, so a pasted URL that happens to embed something sensitive in its path never leaks further than a real image request would. One `sourceUrl` applies to the whole batch — a known, accepted simplification once Task 9's paste escape hatch can mix URLs from different sites into one import call (not a security issue either way; `ssrfGuard.ts`'s protections are unaffected).

- [ ] **Step 1: Write the failing tests**

This file already has a `describe("POST /api/items/:cat/:item/images/import", ...)` block with a `beforeEach` that creates a temp `sandbox` project root, resets `fetchUrlSafelyMock`, and seeds a real item (`seedItem("electronics/desk-lamp")`), plus a local `importImages(urls)` helper and a `PNG_BYTES` fixture. Extend the helper to optionally accept a `sourceUrl`, and add two new `it()` cases alongside the existing ones in that same block:

```typescript
// Change the existing helper in this describe block from:
//   function importImages(urls: string[]) {
//     return handleStudioRequest({
//       method: "POST",
//       url: "/api/items/electronics/desk-lamp/images/import",
//       body: Buffer.from(JSON.stringify({ urls })),
//       projectRoot: sandbox,
//     });
//   }
// to:
function importImages(urls: string[], sourceUrl?: string) {
  return handleStudioRequest({
    method: "POST",
    url: "/api/items/electronics/desk-lamp/images/import",
    body: Buffer.from(JSON.stringify(sourceUrl ? { urls, sourceUrl } : { urls })),
    projectRoot: sandbox,
  });
}

// New it() cases in the same block:

it("passes the ORIGIN of sourceUrl as referer, not the full URL", async () => {
  fetchUrlSafelyMock.mockResolvedValue({
    bytes: PNG_BYTES,
    contentType: "image/png",
    finalUrl: "https://example.com/photos/front.png",
  });

  await importImages(
    ["https://example.com/photos/front.png"],
    "https://seller-site.example/listing/123?ref=abc",
  );

  expect(fetchUrlSafelyMock).toHaveBeenCalledWith(
    "https://example.com/photos/front.png",
    expect.objectContaining({ referer: "https://seller-site.example" }),
  );
});

it("passes no referer when sourceUrl is omitted", async () => {
  fetchUrlSafelyMock.mockResolvedValue({
    bytes: PNG_BYTES,
    contentType: "image/png",
    finalUrl: "https://example.com/photos/front.png",
  });

  await importImages(["https://example.com/photos/front.png"]);

  const [, options] = fetchUrlSafelyMock.mock.calls[0]!;
  expect((options as { referer?: string }).referer).toBeUndefined();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run scripts/lib/studioApi.test.ts -t "ORIGIN of sourceUrl|no referer when sourceUrl"`
Expected: FAIL — `sourceUrl` isn't accepted by the schema yet, and no `referer` is threaded through.

- [ ] **Step 3: Implement it**

In `scripts/lib/studioApi.ts`, update the schema:

```typescript
const importImagesBodySchema = z.object({
  urls: z.array(z.string().min(1)).min(1).max(IMPORT_MAX_URLS_PER_REQUEST),
  sourceUrl: z.string().min(1).optional(),
});
```

Add a small helper near `importFetchErrorMessage`:

```typescript
function originOnly(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}
```

In `handleImageImport`, update the destructuring and the `fetchUrlSafely` call inside its loop:

```typescript
const { urls, sourceUrl } = parseJsonBody(req.body, importImagesBodySchema);
const referer = sourceUrl ? originOnly(sourceUrl) : undefined;
const dir = resolveItemDir(req.projectRoot, category, item);

const failed: Array<{ url: string; error: string }> = [];
let imported = 0;
for (const url of urls) {
  try {
    const fetched = await fetchUrlSafely(url, {
      timeoutMs: IMPORT_IMAGE_FETCH_TIMEOUT_MS,
      maxBytes: IMPORT_IMAGE_MAX_BYTES,
      referer,
    });
    /* ...rest of the loop body (sniffImageType, deriveImportedFilename, writeImage, imported++) unchanged... */
  } catch (err: unknown) {
    failed.push({ url, error: importFetchErrorMessage(err) });
  }
}
```

Only the `parseJsonBody` destructuring line, the new `referer`/`originOnly` computation, and the `fetchUrlSafely(...)` call's options object change — everything else in the loop (sniffing, filename derivation, `writeImage`, the `failed`/`imported` bookkeeping) stays exactly as it is today.

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `pnpm vitest run scripts/lib/studioApi.test.ts -t "ORIGIN of sourceUrl|no referer when sourceUrl"`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full studioApi suite to confirm zero regression**

Run: `pnpm vitest run scripts/lib/studioApi.test.ts`
Expected: PASS — every pre-existing `handleImageImport` test (partial failure handling, filename derivation, sniffing) still passes with `sourceUrl` simply absent.

- [ ] **Step 6: Type-check and lint**

Run: `pnpm type-check && pnpm lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/studioApi.ts scripts/lib/studioApi.test.ts
git commit -m "$(cat <<'EOF'
feat(studio): send an origin-only Referer on URL-import photo downloads

An optional sourceUrl on the images/import request lets
handleImageImport send the seller-pasted page's ORIGIN (never its full
path/query, matching browsers' own strict-origin-when-cross-origin
default) as Referer on each download -- hotlink-protected CDNs commonly
require a matching Referer, and today's download path sent none at all.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: New `POST /api/import-url/thumbnail` route (temp-file pattern)

**Files:**
- Modify: `scripts/lib/studioApi.ts`
- Modify: `scripts/lib/studioApi.test.ts`

**Interfaces:**
- Consumes: `fetchUrlSafely` + `sniffImageType` (existing), `originOnly` (Task 6).
- Produces: `POST /api/import-url/thumbnail` — request `{ url: string; sourceUrl?: string }`; success is a `FileResponse` (image bytes via a temp file + `onSent` cleanup), failure a `JsonResponse` `{ error }` — consumed by Task 8 (client thumbnail-fetch function).

Per spec §11.3/§21: `StudioResponse` is deliberately only `JsonResponse | FileResponse | SseResponse`, specifically so handlers never touch an HTTP object. There is no in-memory-buffer variant, and `FileResponse` requires a real file on disk — so this route reuses the exact pattern the catalog PDF download path (`registerPdfExport`/`handleExportPdfDownload`) already established for "bytes obtained at request time, served once, discarded," simplified to one request instead of that path's two-step token registry (this route's fetch-then-serve is a single round trip; PDF export's generate and download are two separate requests, which is why *it* needs a token). **Why this route must stay POST, never a `GET .../thumbnail?url=...`:** `checkStudioCsrf` exempts GET/HEAD on the reasoning that Vite's CORS/`allowedHosts` checks already cover reads — true for routes that only read local content, not for one whose side effect is an outbound fetch of an attacker-influenced URL. A bare `<img src="http://127.0.0.1:<port>/api/import-url/thumbnail?url=...">` on any unrelated page the seller has open in another tab would fire with no preflight and no CORS gate on whether it fires at all (CORS only gates reading the response, and a plain `<img>` tag never reads it) — reintroducing exactly the class of hole `csrfGuard.ts` exists to close, via a different method. Keeping this route POST means it gets the *existing* CSRF middleware automatically, with no per-route code needed.

- [ ] **Step 1: Write the failing tests**

Add to `scripts/lib/studioApi.test.ts`, as a new describe block matching the same `fetchUrlSafelyMock`/`PROJECT_ROOT`/`PNG_BYTES`/`isFileResponse` conventions the existing `"POST /api/import-url/preview"` and `"POST /api/items/:cat/:item/images/import"` blocks already use (this route doesn't write into any item folder, so it needs `PROJECT_ROOT`, not a `sandbox`):

```typescript
import * as fs from "fs/promises";

describe("POST /api/import-url/thumbnail", () => {
  beforeEach(() => {
    fetchUrlSafelyMock.mockReset();
  });

  function thumbnail(url: string, sourceUrl?: string) {
    return handleStudioRequest({
      method: "POST",
      url: "/api/import-url/thumbnail",
      body: Buffer.from(JSON.stringify(sourceUrl ? { url, sourceUrl } : { url })),
      projectRoot: PROJECT_ROOT,
    });
  }

  it("returns a FileResponse pointing at a temp file containing the fetched image bytes", async () => {
    fetchUrlSafelyMock.mockResolvedValue({
      bytes: PNG_BYTES,
      contentType: "image/png",
      finalUrl: "https://cdn.example/photo.png",
    });

    const res = await thumbnail("https://cdn.example/photo.png", "https://seller-site.example/listing");

    expect(isFileResponse(res)).toBe(true);
    if (isFileResponse(res)) {
      expect(res.status).toBe(200);
      expect(res.contentType).toBe("image/png");
      const bytesOnDisk = await fs.readFile(res.file);
      expect(bytesOnDisk).toEqual(PNG_BYTES);
    }
    expect(fetchUrlSafelyMock).toHaveBeenCalledWith(
      "https://cdn.example/photo.png",
      expect.objectContaining({ referer: "https://seller-site.example" }),
    );
  });

  it("removes the temp file once onSent fires", async () => {
    fetchUrlSafelyMock.mockResolvedValue({
      bytes: PNG_BYTES,
      contentType: "image/png",
      finalUrl: "https://cdn.example/photo.png",
    });

    const res = await thumbnail("https://cdn.example/photo.png");
    if (!isFileResponse(res)) throw new Error("expected a FileResponse");

    const tempPath = res.file;
    await fs.access(tempPath); // exists before onSent
    res.onSent?.();
    await new Promise((resolve) => setTimeout(resolve, 10)); // onSent's cleanup is fire-and-forget

    await expect(fs.access(tempPath)).rejects.toThrow();
  });

  it("returns a JSON error when the fetch fails", async () => {
    fetchUrlSafelyMock.mockRejectedValue(new SsrfError("Disallowed resolved address for bad.example: 127.0.0.1"));

    const res = await thumbnail("http://bad.example/photo.png");

    expect(isFileResponse(res)).toBe(false);
    expect(asJson(res).body).toMatchObject({ error: expect.stringContaining("127.0.0.1") });
  });

  it("returns a JSON error when the fetched bytes aren't a real image", async () => {
    fetchUrlSafelyMock.mockResolvedValue({
      bytes: Buffer.from("<!doctype html><title>Not an image</title>"),
      contentType: "text/html",
      finalUrl: "https://cdn.example/not-an-image",
    });

    const res = await thumbnail("https://cdn.example/not-an-image");

    expect(isFileResponse(res)).toBe(false);
    expect(asJson(res).body).toMatchObject({ error: expect.stringContaining("not a JPEG, PNG, WebP or GIF") });
  });

  it("405s a GET on the thumbnail route", async () => {
    const res = await handleStudioRequest({
      method: "GET",
      url: "/api/import-url/thumbnail",
      body: Buffer.alloc(0),
      projectRoot: PROJECT_ROOT,
    });
    expect(res.status).toBe(405);
  });
});
```

(Named "...on the thumbnail route" specifically, not the shorter "405s a GET" the preview-route describe block above already uses for its own, unrelated test — two identically-named tests in the same file would make the `-t` filters below ambiguous.)

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run scripts/lib/studioApi.test.ts -t "temp file|fetch fails|aren't a real image|405s a GET on the thumbnail route"`
Expected: FAIL — the route doesn't exist yet (falls through to a 404).

- [ ] **Step 3: Implement the handler**

Add these imports to `scripts/lib/studioApi.ts` if not already present:

```typescript
import * as os from "os";
import * as fsPromises from "fs/promises";
```

(Check the top of the file first — `os`/`path`/`fs`-family imports likely already exist under some alias; reuse whatever's already there rather than adding a duplicate under a different name.)

Add near `deriveImportedFilename`:

```typescript
const IMAGE_MIME_TYPES: Record<ImageKind, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

const importThumbnailBodySchema = z.object({
  url: z.string().min(1),
  sourceUrl: z.string().min(1).optional(),
});

async function handleImportThumbnail(req: StudioRequest): Promise<StudioResponse> {
  const { url, sourceUrl } = parseJsonBody(req.body, importThumbnailBodySchema);
  const referer = sourceUrl ? originOnly(sourceUrl) : undefined;

  let fetched: Awaited<ReturnType<typeof fetchUrlSafely>>;
  try {
    fetched = await fetchUrlSafely(url, {
      timeoutMs: IMPORT_IMAGE_FETCH_TIMEOUT_MS,
      maxBytes: IMPORT_IMAGE_MAX_BYTES,
      referer,
    });
  } catch (err: unknown) {
    throw new StudioError(400, importFetchErrorMessage(err));
  }

  const kind = sniffImageType(fetched.bytes);
  if (kind === null) {
    throw new StudioError(400, "not a JPEG, PNG, WebP or GIF");
  }

  const tempPath = path.join(os.tmpdir(), `usedexchange-thumb-${crypto.randomUUID()}.${kind}`);
  await fsPromises.writeFile(tempPath, fetched.bytes);

  return {
    status: 200,
    file: tempPath,
    contentType: IMAGE_MIME_TYPES[kind],
    onSent: () => {
      fsPromises.unlink(tempPath).catch(() => {
        // Best-effort cleanup -- a failed unlink here (already gone,
        // permissions) must not affect a response that's already been
        // fully sent to the seller's own browser.
      });
    },
  };
}
```

`ImageKind`, `sniffImageType`, `path`, and `crypto` should already be imported/defined in this file (used by `handleImageImport`/`deriveImportedFilename`) — reuse them, don't reimport under new names. If `StudioError`'s constructor signature differs from `new StudioError(status, message)` shown above, match whatever this file's other handlers already use (e.g. `handleImportUrlPreview`'s existing `throw new StudioError(400, ...)` calls).

Wire the route into the dispatcher. Find the flat `if (pathname === "/api/import-url/preview") { ... }` block and add a sibling immediately after it:

```typescript
if (pathname === "/api/import-url/thumbnail") {
  if (req.method !== "POST") return { status: 405, body: { error: "method not allowed" } };
  return await handleImportThumbnail(req);
}
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `pnpm vitest run scripts/lib/studioApi.test.ts -t "temp file|fetch fails|aren't a real image|405s a GET on the thumbnail route"`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the full studioApi suite to confirm zero regression**

Run: `pnpm vitest run scripts/lib/studioApi.test.ts`
Expected: PASS.

- [ ] **Step 6: Type-check and lint**

Run: `pnpm type-check && pnpm lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/studioApi.ts scripts/lib/studioApi.test.ts
git commit -m "$(cat <<'EOF'
feat(studio): add a CSRF-safe thumbnail-proxy route for URL-import

POST /api/import-url/thumbnail fetches a candidate image server-side
(through the existing SSRF-guarded pipeline, sniffed and origin-referer'd
exactly like a real import) and serves it via a temp file + FileResponse
onSent cleanup -- the same pattern the catalog PDF download path already
uses for "bytes obtained at request time, served once, discarded", since
StudioResponse has no in-memory-buffer variant to return raw bytes
directly. Kept as POST specifically: a GET .../thumbnail?url=... would be
triggerable by a bare <img> tag on any unrelated page the seller has open
in another tab, since checkStudioCsrf exempts GET/HEAD -- POST gets the
existing CSRF middleware for free. Not yet called from the client --
next task.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Client wrapper updates in `studio/src/api.ts`

**Files:**
- Modify: `studio/src/api.ts`
- Modify: `studio/src/api.test.ts`

**Interfaces:**
- Consumes: the response/request shapes from Tasks 5-7 (server-side contracts).
- Produces:
  ```typescript
  export type ImportUrlPreview = {
    name: string | null;
    images: string[];
    usedHeadlessFallback: boolean;
    headlessFailureReason: "not-installed" | "navigation-failed" | null;
  };
  export function previewImportUrl(url: string): Promise<ImportUrlPreview>;
  export function importImagesFromUrls(id: string, urls: string[], sourceUrl?: string): Promise<ImportImagesResult>;
  export function fetchImportThumbnail(url: string, sourceUrl?: string, signal?: AbortSignal): Promise<Blob>;
  ```
  Consumed by Task 9 (messaging + paste escape hatch) and Task 10 (thumbnail rendering — Task 10 is what actually passes `signal`, wiring it to an `AbortController` it owns, so an in-flight thumbnail fetch can be cancelled when its `<li>` unmounts).

- [ ] **Step 1: Write the failing tests**

This file mocks `fetch` per-test with `vi.stubGlobal("fetch", fetchMock)` / `vi.unstubAllGlobals()` (see `createCategory`'s or `saveCategoryMeta`'s existing tests), where `fetchMock = vi.fn(async () => ({ ok, status, statusText, json: async () => ({...}) })) as unknown as typeof fetch`, and inspects the call via `fetchMock.mock.calls[0] as [string, RequestInit]`. Add these to `studio/src/api.test.ts`, importing the three new names alongside this file's existing `./api` import list:

```typescript
import { /* ...existing names..., */ previewImportUrl, importImagesFromUrls, fetchImportThumbnail } from "./api";

describe("previewImportUrl", () => {
  it("includes usedHeadlessFallback and headlessFailureReason from the response", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        name: null,
        images: [],
        usedHeadlessFallback: true,
        headlessFailureReason: "not-installed",
      }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const result = await previewImportUrl("https://example.com");

    expect(result.usedHeadlessFallback).toBe(true);
    expect(result.headlessFailureReason).toBe("not-installed");
    vi.unstubAllGlobals();
  });
});

describe("importImagesFromUrls — sourceUrl", () => {
  it("includes sourceUrl in the request body when provided", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ files: [], imported: 1, failed: [] }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    await importImagesFromUrls("some-item-id", ["https://cdn.example/a.jpg"], "https://seller-site.example/listing");

    const [, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      urls: ["https://cdn.example/a.jpg"],
      sourceUrl: "https://seller-site.example/listing",
    });
    vi.unstubAllGlobals();
  });

  it("omits sourceUrl from the request body when not provided", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ files: [], imported: 1, failed: [] }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    await importImagesFromUrls("some-item-id", ["https://cdn.example/a.jpg"]);

    const [, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ urls: ["https://cdn.example/a.jpg"] });
    vi.unstubAllGlobals();
  });
});

describe("fetchImportThumbnail", () => {
  it("returns a Blob on success", async () => {
    const fakeBlob = new Blob(["fake image bytes"]);
    const fetchMock = vi.fn(async () => ({ ok: true, blob: async () => fakeBlob })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchImportThumbnail("https://cdn.example/a.jpg", "https://seller-site.example/listing");

    expect(result).toBe(fakeBlob);
    vi.unstubAllGlobals();
  });

  it("throws the server's error message on failure", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => ({ error: "not a JPEG, PNG, WebP or GIF" }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchImportThumbnail("https://cdn.example/a.jpg")).rejects.toThrow(
      "not a JPEG, PNG, WebP or GIF",
    );
    vi.unstubAllGlobals();
  });

  it("forwards an AbortSignal to fetch when provided", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob([]),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await fetchImportThumbnail("https://cdn.example/a.jpg", undefined, controller.signal);

    const [, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run studio/src/api.test.ts -t "previewImportUrl|sourceUrl|fetchImportThumbnail"`
Expected: FAIL — the new fields/parameters/function don't exist yet.

- [ ] **Step 3: Implement it**

In `studio/src/api.ts`, update the preview type and parsing:

```typescript
export type ImportUrlPreview = {
  name: string | null;
  images: string[];
  usedHeadlessFallback: boolean;
  headlessFailureReason: "not-installed" | "navigation-failed" | null;
};

export async function previewImportUrl(url: string): Promise<ImportUrlPreview> {
  const res = await fetch("/api/import-url/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `fetching that page failed with ${res.status} ${res.statusText}`));
  }
  return {
    name: typeof body?.name === "string" ? body.name : null,
    images: Array.isArray(body?.images) ? (body.images as string[]) : [],
    usedHeadlessFallback: body?.usedHeadlessFallback === true,
    headlessFailureReason:
      body?.headlessFailureReason === "not-installed" || body?.headlessFailureReason === "navigation-failed"
        ? body.headlessFailureReason
        : null,
  };
}
```

Update `importImagesFromUrls` to accept and send the optional `sourceUrl`:

```typescript
export async function importImagesFromUrls(
  id: string,
  urls: string[],
  sourceUrl?: string,
): Promise<ImportImagesResult> {
  const res = await fetch(`/api/items/${id}/images/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sourceUrl ? { urls, sourceUrl } : { urls }),
  });
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `importing photos failed with ${res.status} ${res.statusText}`));
  }
  return {
    files: (body?.files as ImageEntry[] | undefined) ?? [],
    imported: typeof body?.imported === "number" ? body.imported : 0,
    failed: Array.isArray(body?.failed) ? (body.failed as Array<{ url: string; error: string }>) : [],
  };
}
```

Add the new thumbnail-fetch function near the other import-url functions:

```typescript
export async function fetchImportThumbnail(url: string, sourceUrl?: string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch("/api/import-url/thumbnail", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sourceUrl ? { url, sourceUrl } : { url }),
    signal,
  });
  if (!res.ok) {
    const body = await readJsonBody(res);
    throw new Error(errorMessage(body, `fetching that thumbnail failed with ${res.status} ${res.statusText}`));
  }
  return res.blob();
}
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `pnpm vitest run studio/src/api.test.ts -t "previewImportUrl|sourceUrl|fetchImportThumbnail"`
Expected: PASS (6 tests)

- [ ] **Step 5: Run the full api.ts suite to confirm zero regression**

Run: `pnpm vitest run studio/src/api.test.ts`
Expected: PASS.

- [ ] **Step 6: Type-check and lint**

Run: `pnpm type-check && pnpm lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add studio/src/api.ts studio/src/api.test.ts
git commit -m "$(cat <<'EOF'
feat(studio): extend the client API for the two-tier fallback and thumbnails

previewImportUrl surfaces usedHeadlessFallback/headlessFailureReason;
importImagesFromUrls gains an optional sourceUrl; a new
fetchImportThumbnail wraps the CSRF-safe thumbnail-proxy route as a Blob.
Not yet consumed by NewItemDialog.tsx -- next two tasks.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Messaging states, the paste-URL escape hatch, and the fetch/paste merge fix

**Files:**
- Modify: `studio/src/panes/NewItemDialog.tsx`
- Modify: `studio/src/panes/NewItemDialog.test.tsx`
- Modify: `studio/src/i18n/strings.en.ts`
- Modify: `studio/src/i18n/strings.zh.ts`

**Interfaces:**
- Consumes: `ImportUrlPreview` (Task 8), `importImagesFromUrls(id, urls, sourceUrl?)` (Task 8).
- Produces: no new exports (this is leaf UI code) — but the merge behavior this task establishes is what Task 10 builds thumbnail rendering on top of.

Three behaviors land together because they're genuinely entangled (spec §9, §12, §22, §23) — splitting them would leave an intermediate state where the escape hatch exists but silently loses data:

1. **Messaging** (spec §12): when `images.length === 0`, show one of two messages depending on `headlessFailureReason`.
2. **Paste escape hatch** (spec §9, §22): a textarea *outside* the `previewFetched` gate; adding a valid URL sets `previewFetched` — the same flag a successful fetch sets — so the name field and Create button unlock without a fetch ever running.
3. **Merge, not replace, on a fetch that resolves after a paste** (spec §23): because paste can now set `previewFetched` independently, `fetchUrlPreview`'s existing success path (which today *replaces* `candidateImages`/`selectedImages` and unconditionally overwrites `name`) must merge into whatever's already there instead, or a fetch landing after a paste silently destroys it.

- [ ] **Step 1: Write the failing tests**

This file mocks the raw `global.fetch` per test (`vi.stubGlobal("fetch", fetchMock)`) via a local `jsonResponse(body, status?)` helper and, inside `describe("url mode", ...)`, a `fetchMockFor({ preview, createStatus, createBody, importBody })` router that dispatches by URL string. Extend `fetchMockFor`'s `preview` parameter type to allow the two new fields, and add the new tests as siblings of the existing "url mode" tests, reusing `renderWithStudioI18n`, `fireEvent`, and the exact existing label/button text (`"Import from URL"`, `/^Product page URL/`, `"Fetch page"`, `/^Item name/`) — this file doesn't import `screen`, it destructures query functions from `renderWithStudioI18n`'s own return value:

```typescript
// Change fetchMockFor's existing parameter type from
//   preview?: { name: string | null; images: string[] };
// to:
preview?: {
  name: string | null;
  images: string[];
  usedHeadlessFallback?: boolean;
  headlessFailureReason?: "not-installed" | "navigation-failed" | null;
};

describe("URL-import messaging", () => {
  it("shows the setup hint when the fallback is unavailable", async () => {
    const fetchMock = fetchMockFor({
      preview: { name: null, images: [], usedHeadlessFallback: true, headlessFailureReason: "not-installed" },
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getByRole, getByLabelText, getByText, findByText } = renderWithStudioI18n(
      <NewItemDialog categories={[]} onCreated={vi.fn()} onCategoryCreated={vi.fn()} onCancel={vi.fn()} />,
    );
    fireEvent.click(getByRole("tab", { name: "Import from URL" }));
    fireEvent.change(getByLabelText(/^Product page URL/), { target: { value: "https://example.com/listing/1" } });
    fireEvent.click(getByText("Fetch page"));

    expect(await findByText(/npx playwright install chromium/)).toBeTruthy();
  });

  it("shows the generic blocked/login-wall hint when the fallback ran but still found nothing", async () => {
    const fetchMock = fetchMockFor({
      preview: { name: null, images: [], usedHeadlessFallback: true, headlessFailureReason: null },
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getByRole, getByLabelText, getByText, findByText } = renderWithStudioI18n(
      <NewItemDialog categories={[]} onCreated={vi.fn()} onCategoryCreated={vi.fn()} onCancel={vi.fn()} />,
    );
    fireEvent.click(getByRole("tab", { name: "Import from URL" }));
    fireEvent.change(getByLabelText(/^Product page URL/), { target: { value: "https://example.com/listing/1" } });
    fireEvent.click(getByText("Fetch page"));

    expect(await findByText(/block automated access|require login/i)).toBeTruthy();
  });

  it("shows the same generic hint, not the setup hint, for navigation-failed", async () => {
    const fetchMock = fetchMockFor({
      preview: { name: null, images: [], usedHeadlessFallback: true, headlessFailureReason: "navigation-failed" },
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getByRole, getByLabelText, getByText, findByText, queryByText } = renderWithStudioI18n(
      <NewItemDialog categories={[]} onCreated={vi.fn()} onCategoryCreated={vi.fn()} onCancel={vi.fn()} />,
    );
    fireEvent.click(getByRole("tab", { name: "Import from URL" }));
    fireEvent.change(getByLabelText(/^Product page URL/), { target: { value: "https://example.com/listing/1" } });
    fireEvent.click(getByText("Fetch page"));

    expect(await findByText(/block automated access|require login/i)).toBeTruthy();
    expect(queryByText(/npx playwright install chromium/)).toBeNull();
  });
});

describe("URL-import paste escape hatch", () => {
  it("unlocks the name field and Create button when a valid URL is pasted, without ever fetching", async () => {
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("no fetch should happen in this test"); }));
    const { getByRole, getByLabelText, getByText } = renderWithStudioI18n(
      <NewItemDialog categories={[]} onCreated={vi.fn()} onCategoryCreated={vi.fn()} onCancel={vi.fn()} />,
    );
    fireEvent.click(getByRole("tab", { name: "Import from URL" }));
    fireEvent.change(getByLabelText(/paste photo links/i), { target: { value: "https://cdn.example/photo.jpg" } });
    fireEvent.click(getByText("Add"));

    expect((getByLabelText(/^Item name/) as HTMLInputElement).disabled).toBe(false);
    expect((getByText("Create item & import photos") as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows a validation message and leaves the form locked when the pasted value isn't a URL", async () => {
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("no fetch should happen in this test"); }));
    const { getByRole, getByLabelText, getByText, findByText } = renderWithStudioI18n(
      <NewItemDialog categories={[]} onCreated={vi.fn()} onCategoryCreated={vi.fn()} onCancel={vi.fn()} />,
    );
    fireEvent.click(getByRole("tab", { name: "Import from URL" }));
    fireEvent.change(getByLabelText(/paste photo links/i), { target: { value: "not a url" } });
    fireEvent.click(getByText("Add"));

    expect(await findByText(/enter a valid/i)).toBeTruthy();
    // The name field only exists once previewFetched is true -- an invalid
    // paste must not have flipped it.
    expect(() => getByLabelText(/^Item name/)).toThrow();
  });

  it("dedupes a pasted URL that's already a candidate", async () => {
    const fetchMock = fetchMockFor({ preview: { name: "Vintage Desk Lamp", images: ["https://example.com/a.jpg"] } });
    vi.stubGlobal("fetch", fetchMock);
    const { getByRole, getByLabelText, getByText, findByDisplayValue } = renderWithStudioI18n(
      <NewItemDialog categories={[]} onCreated={vi.fn()} onCategoryCreated={vi.fn()} onCancel={vi.fn()} />,
    );
    fireEvent.click(getByRole("tab", { name: "Import from URL" }));
    fireEvent.change(getByLabelText(/^Product page URL/), { target: { value: "https://example.com/listing/1" } });
    fireEvent.click(getByText("Fetch page"));
    await findByDisplayValue("Vintage Desk Lamp");

    fireEvent.change(getByLabelText(/paste photo links/i), { target: { value: "https://example.com/a.jpg" } });
    fireEvent.click(getByText("Add"));

    const checkboxes = document.querySelectorAll<HTMLInputElement>(".url-picker-thumb input[type=checkbox]");
    expect(checkboxes).toHaveLength(1);
    expect(checkboxes[0]!.checked).toBe(true);
  });
});

describe("URL-import fetch-after-paste merge", () => {
  it("does not discard a pasted selection when a fetch resolves afterward", async () => {
    const fetchMock = fetchMockFor({
      preview: { name: null, images: ["https://example.com/fetched.jpg"] },
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getByRole, getByLabelText, getByText, findByText } = renderWithStudioI18n(
      <NewItemDialog categories={[]} onCreated={vi.fn()} onCategoryCreated={vi.fn()} onCancel={vi.fn()} />,
    );
    fireEvent.click(getByRole("tab", { name: "Import from URL" }));

    // Paste first -- unlocks the form with zero fetches, per the escape-hatch test above.
    fireEvent.change(getByLabelText(/paste photo links/i), { target: { value: "https://example.com/pasted.jpg" } });
    fireEvent.click(getByText("Add"));
    expect(document.querySelectorAll(".url-picker-thumb")).toHaveLength(1);

    // Now also fetch -- must ADD the fetched candidate, not replace the pasted one.
    fireEvent.change(getByLabelText(/^Product page URL/), { target: { value: "https://example.com/listing/1" } });
    fireEvent.click(getByText("Fetch page"));
    await findByText("2 selected");

    const checkboxes = document.querySelectorAll<HTMLInputElement>(".url-picker-thumb input[type=checkbox]");
    expect(checkboxes).toHaveLength(2);
    expect(Array.from(checkboxes).every((cb) => cb.checked)).toBe(true);
  });

  it("does not blank an already-typed name when the fetch's own guess is null", async () => {
    const fetchMock = fetchMockFor({ preview: { name: null, images: [] } });
    vi.stubGlobal("fetch", fetchMock);
    const { getByRole, getByLabelText, getByText } = renderWithStudioI18n(
      <NewItemDialog categories={[]} onCreated={vi.fn()} onCategoryCreated={vi.fn()} onCancel={vi.fn()} />,
    );
    fireEvent.click(getByRole("tab", { name: "Import from URL" }));
    fireEvent.change(getByLabelText(/paste photo links/i), { target: { value: "https://example.com/pasted.jpg" } });
    fireEvent.click(getByText("Add"));
    fireEvent.change(getByLabelText(/^Item name/), { target: { value: "My Hand-Typed Name" } });

    fireEvent.change(getByLabelText(/^Product page URL/), { target: { value: "https://example.com/listing/1" } });
    fireEvent.click(getByText("Fetch page"));
    for (let i = 0; i < 10; i++) await Promise.resolve(); // flush fetchUrlPreview's microtask chain

    expect((getByLabelText(/^Item name/) as HTMLInputElement).value).toBe("My Hand-Typed Name");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run studio/src/panes/NewItemDialog.test.tsx -t "URL-import"`
Expected: FAIL — none of this exists yet (no paste textarea, no conditional messaging, `fetchUrlPreview` still replaces instead of merging).

- [ ] **Step 3: Add the i18n keys**

In `studio/src/i18n/strings.en.ts`, replace the existing `"newItem.url.noImages"` entry with:

```typescript
"newItem.url.deepImportUnavailable":
  "This page may need JavaScript to show photos. Run `npx playwright install chromium` once to enable deeper import (the same one-time step the catalog PDF export uses — already done if you've set that up), then retry — or paste a photo link directly below.",
"newItem.url.stillNoImages":
  "Couldn't find photos on this page automatically (it may block automated access, or require login). Paste a photo link directly below.",
"newItem.url.pasteUrls.label": "Or paste photo links directly",
"newItem.url.pasteUrls.placeholder": "One or more image URLs, one per line",
"newItem.url.pasteUrls.add": "Add",
"newItem.url.pasteUrls.invalid": "Enter a valid http(s) image URL.",
```

In `studio/src/i18n/strings.zh.ts`, remove the matching `"newItem.url.noImages"` entry and add the mirrored keys:

```typescript
"newItem.url.deepImportUnavailable":
  "此页面的照片可能需要 JavaScript 才能显示。运行一次 `npx playwright install chromium` 即可启用深度导入（与目录 PDF 导出使用的一次性安装步骤相同 —— 如果你已经设置过，这里就已经可用），然后重试；或直接在下方粘贴图片链接。",
"newItem.url.stillNoImages": "未能在此页面自动找到照片（该网站可能屏蔽了自动访问，或需要登录才能查看）。请在下方直接粘贴图片链接。",
"newItem.url.pasteUrls.label": "或直接粘贴图片链接",
"newItem.url.pasteUrls.placeholder": "一个或多个图片链接，每行一个",
"newItem.url.pasteUrls.add": "添加",
"newItem.url.pasteUrls.invalid": "请输入有效的 http(s) 图片链接。",
```

- [ ] **Step 4: Rewrite `fetchUrlPreview`'s success path to merge instead of replace**

In `studio/src/panes/NewItemDialog.tsx`, add a small merge helper near the other free functions in the file:

```typescript
function mergeCandidates(
  existingImages: string[],
  existingSelected: Set<string>,
  newImages: string[],
): { images: string[]; selected: Set<string> } {
  const images = [...existingImages];
  const selected = new Set(existingSelected);
  for (const src of newImages) {
    if (!images.includes(src)) images.push(src);
    selected.add(src); // auto-select new candidates, same rule as extraction/paste
  }
  return { images, selected };
}
```

Replace the body of `fetchUrlPreview`'s success branch:

```typescript
const preview = await previewImportUrl(trimmed);
if (modeRef.current !== "url") return;
setName((prev) => (prev.trim() === "" ? (preview.name ?? "") : prev));
setCandidateImages((prevImages) => {
  const { images, selected } = mergeCandidates(prevImages, selectedImagesRef.current, preview.images);
  setSelectedImages(selected);
  return images;
});
setBrokenImages(new Set());
setPreviewFetched(true);
setHeadlessFailureReason(preview.headlessFailureReason);
```

This needs `selectedImagesRef` — `selectedImages` is read inside a `setCandidateImages` updater without being a stale closure risk, so add a ref that always tracks the latest `selectedImages`, next to where `modeRef` is already declared and kept in sync:

```typescript
const selectedImagesRef = useRef(selectedImages);
useEffect(() => {
  selectedImagesRef.current = selectedImages;
}, [selectedImages]);
```

Add the new `headlessFailureReason` state next to the other URL-mode state declarations (`previewFetched`, etc.):

```typescript
const [headlessFailureReason, setHeadlessFailureReason] = useState<ImportUrlPreview["headlessFailureReason"]>(null);
```

Also reset it alongside the other URL-mode state wherever mode switches away and back already reset `previewFetched`/`candidateImages` (the existing "Item"/"Category" tab `onClick` handlers, and `fetchUrlPreview`'s own start-of-fetch reset if one exists) — grep this file for every place `setPreviewFetched(false)` or `setCandidateImages([])` already appears and add `setHeadlessFailureReason(null)` alongside each one, so it never survives into a state it doesn't describe.

- [ ] **Step 5: Run the merge tests to verify they pass**

Run: `pnpm vitest run studio/src/panes/NewItemDialog.test.tsx -t merge`
Expected: PASS (2 tests)

- [ ] **Step 6: Wire `sourceUrl` through the actual create-item call — otherwise Tasks 6/8's referer support is dead code**

Task 6 (server) and Task 8 (client) built `sourceUrl` support end to end, but nothing yet calls `importImagesFromUrls` with it. Find `createUrlItem`'s existing call:

```typescript
const result = await importImagesFromUrls(id, urls);
```

Replace with:

```typescript
const result = await importImagesFromUrls(id, urls, sourceUrl.trim() === "" ? undefined : sourceUrl.trim());
```

(`sourceUrl` is the existing state backing the "Product page URL" field — empty when the seller only ever pasted URLs and never fetched a page, in which case `undefined` is sent, matching the server schema's `min(1)` requirement on an optional field: an empty string would fail validation, `undefined` is simply omitted.)

Add one test for this alongside the other URL-mode tests in `studio/src/panes/NewItemDialog.test.tsx`:

```typescript
it("sends the fetched page's URL as sourceUrl when creating the item", async () => {
  const fetchMock = fetchMockFor();
  vi.stubGlobal("fetch", fetchMock);
  const { getByRole, getByLabelText, getByText, findByDisplayValue } = renderWithStudioI18n(
    <NewItemDialog categories={[]} onCreated={vi.fn()} onCategoryCreated={vi.fn()} onCancel={vi.fn()} />,
  );
  fireEvent.click(getByRole("tab", { name: "Import from URL" }));
  fireEvent.change(getByLabelText(/^Category/), { target: { value: "electronics" } });
  fireEvent.change(getByLabelText(/^Product page URL/), { target: { value: "https://example.com/listing/1" } });
  fireEvent.click(getByText("Fetch page"));
  await findByDisplayValue("Vintage Desk Lamp");
  fireEvent.change(getByLabelText(/^Item name/), { target: { value: "vintage-desk-lamp" } });

  fireEvent.click(getByText("Create item & import photos"));
  await waitFor(() => {
    const importCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/images/import"));
    expect(importCall).toBeDefined();
  });

  const importCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/images/import"))!;
  const [, init] = importCall as [string, RequestInit];
  expect(JSON.parse(init.body as string)).toEqual({
    urls: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
    sourceUrl: "https://example.com/listing/1",
  });
});
```

Run: `pnpm vitest run studio/src/panes/NewItemDialog.test.tsx -t "sends the fetched page's URL as sourceUrl"`
Expected: PASS

- [ ] **Step 7: Add the paste-URL textarea and its own handler**

Add state near the other URL-mode state:

```typescript
const [pasteUrlsText, setPasteUrlsText] = useState("");
const [pasteError, setPasteError] = useState<string | null>(null);
```

Add the handler as a sibling to `fetchUrlPreview`/`toggleImage`:

```typescript
function addPastedUrls() {
  const candidates = pasteUrlsText
    .split(/[\n,]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const valid: string[] = [];
  for (const candidate of candidates) {
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        valid.push(parsed.toString());
      }
    } catch {
      // not a URL at all -- ignored, same as a non-http(s) scheme
    }
  }

  if (valid.length === 0) {
    setPasteError(t("newItem.url.pasteUrls.invalid"));
    return;
  }

  setPasteError(null);
  setPasteUrlsText("");
  setCandidateImages((prevImages) => {
    const { images, selected } = mergeCandidates(prevImages, selectedImagesRef.current, valid);
    setSelectedImages(selected);
    return images;
  });
  setPreviewFetched(true); // same flag a successful fetch sets -- one unlock condition, two ways to reach it
}
```

Render the textarea as its own block in the `mode === "url"` JSX, placed *after* the "Fetch page" field but *before* (i.e. as a sibling of, not nested inside) the `{previewFetched && createdIdPendingWarning === null && (...)}` block — it must not be inside that conditional, or it inherits the exact gate it exists to route around:

```tsx
{createdIdPendingWarning === null && (
  <label className="field">
    <span className="field-label">{t("newItem.url.pasteUrls.label")}</span>
    <textarea
      value={pasteUrlsText}
      onChange={(e) => setPasteUrlsText(e.target.value)}
      placeholder={t("newItem.url.pasteUrls.placeholder")}
      rows={2}
    />
    <Button type="button" variant="secondary" disabled={pasteUrlsText.trim() === ""} onClick={addPastedUrls}>
      {t("newItem.url.pasteUrls.add")}
    </Button>
    {pasteError && <span className="field-hint field-error">{pasteError}</span>}
  </label>
)}
```

(`createdIdPendingWarning === null` is kept as the one guard this block still needs — once an item has already been partially created and is waiting on a photo-import warning, adding more candidates to import makes no sense; every other gate is intentionally dropped.)

- [ ] **Step 8: Run the paste tests to verify they pass**

Run: `pnpm vitest run studio/src/panes/NewItemDialog.test.tsx -t "paste escape hatch"`
Expected: PASS (3 tests)

- [ ] **Step 9: Replace the single `noImages` message with the two conditional ones**

Find the existing:

```tsx
{candidateImages.length === 0 ? (
  <p className="field-hint">{t("newItem.url.noImages")}</p>
) : (
```

Replace with:

```tsx
{candidateImages.length === 0 ? (
  <p className="field-hint">
    {headlessFailureReason === "not-installed"
      ? t("newItem.url.deepImportUnavailable")
      : t("newItem.url.stillNoImages")}
  </p>
) : (
```

- [ ] **Step 10: Run the messaging tests to verify they pass**

Run: `pnpm vitest run studio/src/panes/NewItemDialog.test.tsx -t messaging`
Expected: PASS (3 tests)

- [ ] **Step 11: Fix a pre-existing test that asserts on the now-removed generic message**

Run the full file now (`pnpm vitest run studio/src/panes/NewItemDialog.test.tsx`) and `"creates the item with no import call when the page has no candidate photos"` will fail — not a regression, an expected consequence of Step 9 removing `newItem.url.noImages`. It currently does:

```typescript
await findByText(/No photos found/);
```

Its mock preview is `{ name: "Old Chair", images: [] }`, with no `usedHeadlessFallback`/`headlessFailureReason` at all — Task 8's `previewImportUrl` treats a missing/invalid `headlessFailureReason` as `null` (its own defaulting logic), which lands in the *second* messaging branch (§12), not the setup-hint one. Update the assertion to:

```typescript
await findByText(/couldn't find photos on this page automatically/i);
```

- [ ] **Step 12: Run the full file's suite to confirm zero regression**

Run: `pnpm vitest run studio/src/panes/NewItemDialog.test.tsx`
Expected: PASS — every pre-existing URL-mode test (including the mode-switch-during-fetch guard and the one just updated) still passes.

- [ ] **Step 13: Type-check and lint**

Run: `pnpm type-check && pnpm lint`
Expected: no errors.

- [ ] **Step 14: Manually verify in the running app**

Run: `pnpm studio`, open the New Item dialog, switch to URL-import mode. Confirm: (a) the paste textarea is visible before clicking "Fetch page"; (b) pasting `https://example.com/nonexistent.jpg` and clicking Add unlocks the name field and Create button; (c) typing a name, then pasting a URL, then fetching a real product page (or one that yields zero images) does not clear the typed name or the pasted selection; (d) creating an item via a fetched URL sends that URL as `sourceUrl` on the import call (check the Network tab).

- [ ] **Step 15: Commit**

```bash
git add studio/src/panes/NewItemDialog.tsx studio/src/panes/NewItemDialog.test.tsx studio/src/i18n/strings.en.ts studio/src/i18n/strings.zh.ts
git commit -m "$(cat <<'EOF'
feat(studio): add the URL-import paste escape hatch and fix a fetch/paste data-loss bug

The manual paste-URLs textarea sits outside the previewFetched gate and
sets that same flag on success, unlocking the name field and Create
button without ever running a fetch -- the guaranteed path for sites no
automated extraction will ever reliably beat. Also fixes a pre-existing
bug this newly exposes: fetchUrlPreview's success path used to replace
candidateImages/selectedImages outright and unconditionally overwrite
name, so a fetch resolving after (or during) a paste could silently
discard what the seller had already selected and typed. It now merges
instead, and only fills name when it's empty. Also wires the fetched
page's URL through to the images/import call as sourceUrl -- the
referer-threading support added earlier had no caller passing it until
now. Messaging when zero images are found now distinguishes "install the
optional deep-import step" from "this site blocks automated access or
needs login" instead of one generic message.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Proxy candidate thumbnails through the local server (fixes the hotlink broken-image bug)

**Files:**
- Modify: `studio/src/panes/NewItemDialog.tsx`
- Modify: `studio/src/panes/NewItemDialog.test.tsx`

**Interfaces:**
- Consumes: `fetchImportThumbnail(url, sourceUrl?, signal?)` (Task 8).
- Produces: no new exports — a new internal `ThumbnailImage` component replaces the bare `<img src={candidateUrl}>` in the picker grid.

Per spec §11.3: today's picker renders `<img src={candidateUrl}>` directly in the seller's browser, so any site with hotlink protection 403s it, showing a broken-image icon even though the same URL downloads fine server-side. This task fetches each thumbnail through the CSRF-safe proxy route (Task 7) and displays it as a blob URL instead — lazily (`IntersectionObserver`, replacing the native `loading="lazy"` a `fetch()`-based image can no longer benefit from) and cancellably (`AbortController`, so switching modes or re-fetching mid-load doesn't leave ~40 real upstream requests running for nothing, matching this component's existing `modeRef` discipline for the same class of problem).

- [ ] **Step 1: Write the failing tests**

This file mocks `global.fetch` directly (there is no separate mock of `previewImportUrl`/`fetchImportThumbnail` as functions — the thumbnail route is just another URL `fetchMockFor`'s router dispatches on, same as `/api/import-url/preview` and `/api/items`). Extend `fetchMockFor` once more (on top of Task 9's own extension, which added `usedHeadlessFallback`/`headlessFailureReason` to its `preview` parameter — this task's version below keeps those and adds thumbnail routing) to handle the thumbnail route, and stub `IntersectionObserver` locally since nothing in this file's existing setup provides one:

```typescript
// Extend fetchMockFor's parameters and body once more:
function fetchMockFor({
  preview = { name: "Vintage Desk Lamp", images: ["https://example.com/a.jpg", "https://example.com/b.jpg"] },
  createStatus = 201,
  createBody = { id: "electronics/vintage-desk-lamp" },
  importBody = { files: [], imported: 2, failed: [] },
  thumbnailBytes = new Blob(["fake-thumbnail-bytes"], { type: "image/jpeg" }),
}: {
  preview?: {
    name: string | null;
    images: string[];
    usedHeadlessFallback?: boolean;
    headlessFailureReason?: "not-installed" | "navigation-failed" | null;
  };
  createStatus?: number;
  createBody?: unknown;
  importBody?: unknown;
  thumbnailBytes?: Blob;
} = {}) {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/import-url/preview") return jsonResponse(preview);
    if (url === "/api/items") return jsonResponse(createBody, createStatus);
    if (url.endsWith("/images/import")) return jsonResponse(importBody);
    if (url === "/api/import-url/thumbnail") return new Response(thumbnailBytes, { status: 200 });
    throw new Error(`unexpected fetch: ${url}`);
  });
}

describe("URL-import thumbnail proxy", () => {
  let observedCallback: IntersectionObserverCallback | null = null;
  const OriginalIntersectionObserver = globalThis.IntersectionObserver;

  beforeEach(() => {
    observedCallback = null;
    // @ts-expect-error -- minimal test stub, not a full IntersectionObserver
    globalThis.IntersectionObserver = class {
      constructor(cb: IntersectionObserverCallback) {
        observedCallback = cb;
      }
      observe() {}
      disconnect() {}
    };
  });

  afterEach(() => {
    globalThis.IntersectionObserver = OriginalIntersectionObserver;
  });

  async function renderWithOneCandidate() {
    const fetchMock = fetchMockFor({ preview: { name: "Vintage Desk Lamp", images: ["https://example.com/a.jpg"] } });
    vi.stubGlobal("fetch", fetchMock);
    const result = renderWithStudioI18n(
      <NewItemDialog categories={[]} onCreated={vi.fn()} onCategoryCreated={vi.fn()} onCancel={vi.fn()} />,
    );
    fireEvent.click(result.getByRole("tab", { name: "Import from URL" }));
    fireEvent.change(result.getByLabelText(/^Product page URL/), {
      target: { value: "https://example.com/listing/1" },
    });
    fireEvent.click(result.getByText("Fetch page"));
    await result.findByDisplayValue("Vintage Desk Lamp");
    return { ...result, fetchMock };
  }

  it("does not fetch a thumbnail until it is reported as near the viewport", async () => {
    const { fetchMock } = await renderWithOneCandidate();

    expect(fetchMock.mock.calls.some(([input]) => String(input) === "/api/import-url/thumbnail")).toBe(false);

    observedCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], null as never);
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => String(input) === "/api/import-url/thumbnail")).toBe(true);
    });
  });

  it("renders the fetched blob as the thumbnail's image source", async () => {
    const createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake-url");
    const { getByRole } = await renderWithOneCandidate();

    observedCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], null as never);

    await waitFor(() => {
      expect(getByRole("img")).toHaveAttribute("src", "blob:fake-url");
    });
    expect(createObjectURLSpy).toHaveBeenCalled();
  });

  it("revokes the blob URL on unmount", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake-url");
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL");
    const { getByRole, unmount } = await renderWithOneCandidate();
    observedCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], null as never);
    await waitFor(() => expect(getByRole("img")).toHaveAttribute("src", "blob:fake-url"));

    unmount();

    expect(revokeSpy).toHaveBeenCalledWith("blob:fake-url");
  });

  it("aborts the in-flight thumbnail fetch when the mode is switched away mid-request", async () => {
    let capturedSignal: AbortSignal | undefined;
    const fetchMock = fetchMockFor({ preview: { name: "Vintage Desk Lamp", images: ["https://example.com/a.jpg"] } });
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/import-url/preview") {
        return jsonResponse({ name: "Vintage Desk Lamp", images: ["https://example.com/a.jpg"] });
      }
      if (url === "/api/import-url/thumbnail") {
        capturedSignal = init?.signal ?? undefined;
        return new Promise<Response>(() => {
          /* never resolves -- this test only cares whether it's aborted */
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getByRole, getByLabelText, getByText, findByDisplayValue } = renderWithStudioI18n(
      <NewItemDialog categories={[]} onCreated={vi.fn()} onCategoryCreated={vi.fn()} onCancel={vi.fn()} />,
    );
    fireEvent.click(getByRole("tab", { name: "Import from URL" }));
    fireEvent.change(getByLabelText(/^Product page URL/), { target: { value: "https://example.com/listing/1" } });
    fireEvent.click(getByText("Fetch page"));
    await findByDisplayValue("Vintage Desk Lamp");
    observedCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], null as never);
    await waitFor(() => expect(capturedSignal).toBeDefined());

    // Matches this file's existing mode-switch-during-fetch regression test's
    // approach: switch away mid-request via the "Item" tab.
    fireEvent.click(getByRole("tab", { name: "Item" }));

    expect(capturedSignal?.aborted).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run studio/src/panes/NewItemDialog.test.tsx -t "thumbnail proxy"`
Expected: FAIL — thumbnails are still plain `<img src={candidateUrl}>`.

- [ ] **Step 3: Implement the `ThumbnailImage` component**

Add near the top of `studio/src/panes/NewItemDialog.tsx`, alongside the other small helpers, and import `fetchImportThumbnail`:

```typescript
import { /* ...existing imports..., */ fetchImportThumbnail } from "../api";
```

```tsx
function ThumbnailImage({ src, sourceUrl }: { src: string; sourceUrl: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  const elementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    let cancelled = false;
    const controller = new AbortController();

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        observer.disconnect();
        fetchImportThumbnail(src, sourceUrl, controller.signal)
          .then((blob) => {
            if (cancelled) return;
            setBlobUrl(URL.createObjectURL(blob));
          })
          .catch(() => {
            if (!cancelled) setBroken(true);
          });
      },
      { rootMargin: "200px" },
    );
    observer.observe(element);

    return () => {
      cancelled = true;
      observer.disconnect();
      controller.abort();
    };
  }, [src, sourceUrl]);

  // Separate effect, keyed on blobUrl itself: revokes exactly the URL that
  // was actually created, whether that happens on unmount or because this
  // thumbnail's own src/sourceUrl changed and a new blob URL replaced it.
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  return (
    <div ref={elementRef} className={broken ? "url-picker-thumb-broken" : undefined}>
      {blobUrl && <img src={blobUrl} alt="" />}
    </div>
  );
}
```

- [ ] **Step 4: Replace the bare `<img>` in the thumb grid with `ThumbnailImage`**

Find:

```tsx
<img
  src={src}
  alt=""
  loading="lazy"
  className={brokenImages.has(src) ? "url-picker-thumb-broken" : undefined}
  onError={() =>
    setBrokenImages((prev) => new Set(prev).add(src))
  }
/>
```

Replace with:

```tsx
<ThumbnailImage src={src} sourceUrl={sourceUrl} />
```

Remove the now-unused `brokenImages` state (`const [brokenImages, setBrokenImages] = useState(...)`) and every reference to `setBrokenImages` (including the one inside `fetchUrlPreview`'s success path from Task 9's Step 4) — the "did this thumbnail fail" concept now lives entirely inside `ThumbnailImage`'s own local `broken` state, since each thumbnail owns its own fetch lifecycle.

- [ ] **Step 5: Run the thumbnail tests to verify they pass**

Run: `pnpm vitest run studio/src/panes/NewItemDialog.test.tsx -t "thumbnail proxy"`
Expected: PASS (4 tests)

- [ ] **Step 6: Run the full file's suite to confirm zero regression**

Run: `pnpm vitest run studio/src/panes/NewItemDialog.test.tsx`
Expected: PASS.

- [ ] **Step 7: Type-check and lint**

Run: `pnpm type-check && pnpm lint`
Expected: no errors — in particular, confirm nothing else in this file still references the removed `brokenImages`/`setBrokenImages`.

- [ ] **Step 8: Manually verify in the running app**

Run: `pnpm studio`, open the New Item dialog, switch to URL-import mode, and fetch a real product page from a site known to hotlink-protect its images. Confirm thumbnails now render (via the local proxy) instead of showing broken-image icons, and that scrolling a long candidate list only triggers network activity for thumbnails as they scroll into view (check the browser's Network tab).

- [ ] **Step 9: Commit**

```bash
git add studio/src/panes/NewItemDialog.tsx studio/src/panes/NewItemDialog.test.tsx
git commit -m "$(cat <<'EOF'
fix(studio): proxy URL-import thumbnails through the local server

Candidate thumbnails in the picker grid now fetch through the CSRF-safe
/api/import-url/thumbnail route and render as blob URLs, fixing broken-
image icons on any site with hotlink protection (the underlying URL was
always downloadable server-side -- only the seller's own browser loading
it directly was ever blocked). Lazy via IntersectionObserver (a fetch()
call has no native loading="lazy" equivalent) and cancellable via
AbortController, so switching modes or re-fetching mid-load doesn't leave
dozens of real upstream requests running for nothing.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Bilingual documentation updates

**Files:**
- Modify: `docs/CURRENT_FUNCTIONALITY.md`, `docs/CURRENT_FUNCTIONALITY_zh.md`
- Modify: `docs/TECH_REQUIREMENTS.md`, `docs/TECH_REQUIREMENTS_zh.md`
- Modify: `docs/DESIGN.md`, `docs/DESIGN_zh.md`
- Modify: `docs/SCRIPTS.md`, `docs/SCRIPTS_zh.md`

**Interfaces:** none (documentation only).

Per CLAUDE.md's Rule 2 (bilingual sync) and spec §16: every doc touched here gets its `_zh` counterpart updated in this same task, not a follow-up. No code changes in this task — do it last, once the actual shipped behavior (Tasks 1-10) is final, so the docs describe what was actually built rather than the original plan.

- [ ] **Step 1: Update `docs/CURRENT_FUNCTIONALITY.md`**

Find the existing "Import-from-URL mode" bullet inside the Create-pane description (the one starting "Import-from-URL mode: paste a product/listing page URL and Studio fetches it, guesses an item name..."). Append one sentence to it:

```
If the fetched page has no photos in its static HTML (common on JavaScript-rendered marketplaces), Studio automatically retries with a headless-Chromium render before giving up — and a "paste a photo link directly" box is always available as a manual fallback, independent of whether any fetch has succeeded.
```

Find the existing "**Import-from-URL is SSRF-hardened.**" paragraph and append at its end:

```
The same SSRF validation extends to the headless-render fallback: every request the rendered page's own JavaScript makes is checked against the identical address rules before being allowed through, asset downloads (images, fonts, stylesheets) are blocked outright since extraction only needs resolved URL strings, and WebSocket connections are blocked entirely. The headless fallback reuses the same Chromium install the catalog PDF export already needs (`npx playwright install chromium`) — no separate setup step, no new dependency. Known limitation: sites with enterprise-grade bot defense (Amazon, Costco) or that require a login (Facebook Marketplace) may still return nothing automatically; the manual paste-a-link fallback is the intended path for these.
```

- [ ] **Step 2: Mirror Step 1 into `docs/CURRENT_FUNCTIONALITY_zh.md`**

Find the corresponding Chinese bullet and paragraph (same structural location — this file mirrors the English one section-for-section) and add the equivalent text:

```
如果抓取到的页面静态 HTML 中没有照片（常见于 JavaScript 渲染的电商平台），Studio 会自动改用无头 Chromium 渲染后重试；无论抓取是否成功，"直接粘贴图片链接"的输入框始终可用，作为人工兜底方案。
```

```
无头渲染兜底同样延伸了这套 SSRF 校验：渲染页面自身 JavaScript 发出的每一个请求，在被放行前都会经过完全相同的地址校验规则；图片、字体、样式表等资源请求会被直接拦截，因为提取环节只需要解析出的 URL 字符串；WebSocket 连接会被完全阻止。无头兜底复用目录 PDF 导出已经需要的 Chromium 安装（`npx playwright install chromium`）——不需要额外的安装步骤，也不需要新的依赖。已知局限：具有企业级反爬能力的网站（Amazon、Costco）或需要登录的网站（Facebook Marketplace）可能仍然自动抓不到任何内容；手动粘贴链接正是为这类情况准备的兜底方案。
```

- [ ] **Step 3: Update `docs/TECH_REQUIREMENTS.md`**

Find the existing table row for `POST /api/import-url/preview` (in the Seller Studio §30 route table) and replace its description with:

```
SSRF-safe fetch (`scripts/lib/ssrfGuard.ts`) of a seller-supplied `{ url }`, then extracts (`scripts/lib/urlImport.ts`) a best-guess `name` and a filtered, deduped list of candidate photo `images` (absolute URLs) — nothing is downloaded or written yet. If the fast fetch finds zero images, retries once via an SSRF-guarded headless-Chromium render (`scripts/lib/headlessImport.ts`) before giving up. Response gains `usedHeadlessFallback: boolean` and `headlessFailureReason: "not-installed" \| "navigation-failed" \| null`. `400` with `{ error }` for a rejected/failed fetch (bad scheme, disallowed address, timeout, oversized body). A non-HTML response returns `{ name: null, images: [], usedHeadlessFallback: false, headlessFailureReason: null }` rather than parsing binary bytes as text.
```

Find the row (or add one, in the same table, immediately after) describing `POST /api/items/<category>/<item>/images/import` and add a note that its request body now accepts an optional `sourceUrl: string`, sent as the origin-only `Referer` on each download.

Add a new row to the same table for the new route:

```
| `POST /api/import-url/thumbnail` | Fetches one candidate image server-side (identical SSRF-guarded path, optional origin-only Referer from `sourceUrl`) and serves it back via a temp file (`FileResponse` + `onSent` cleanup) — a CSRF-safe proxy so the picker's thumbnails don't hit hotlink protection or require a bare `GET`-with-query-param route (which a foreign page could trigger blind via a plain `<img>` tag). `400` with `{ error }` on a failed fetch or non-image bytes. |
```

- [ ] **Step 4: Mirror Step 3 into `docs/TECH_REQUIREMENTS_zh.md`**

Update the corresponding Chinese route table (same §30-equivalent section) with the mirrored content:

```
对卖家提供的 `{ url }` 做 SSRF 安全抓取（`scripts/lib/ssrfGuard.ts`），再用 `scripts/lib/urlImport.ts` 提取出最佳猜测的 `name` 和经过过滤去重的候选照片 `images`（绝对 URL）——此时还不会下载或写入任何文件。如果快速抓取一张照片都没找到，会先通过 SSRF 加固的无头 Chromium 渲染（`scripts/lib/headlessImport.ts`）重试一次，再放弃。响应新增 `usedHeadlessFallback: boolean` 和 `headlessFailureReason: "not-installed" | "navigation-failed" | null`。抓取被拒绝或失败时返回 `400` 和 `{ error }`（协议不允许、地址被禁止、超时、响应体过大）。非 HTML 响应会返回 `{ name: null, images: [], usedHeadlessFallback: false, headlessFailureReason: null }`，而不会把二进制字节当文本解析。
```

```
| `POST /api/import-url/thumbnail` | 在服务端抓取单张候选图片（完全相同的 SSRF 加固路径，若提供了 `sourceUrl` 则附带仅含 origin 的 Referer），再通过临时文件（`FileResponse` + `onSent` 清理）返回——这是一个 CSRF 安全的代理，让选图网格里的缩略图不再触发防盗链，也避免使用"裸 GET + 查询参数"路由（这种路由可能被外部页面用一个普通的 `<img>` 标签盲发请求触发）。抓取失败或返回的不是图片字节时返回 `400` 和 `{ error }`。 |
```

- [ ] **Step 5: Update `docs/DESIGN.md`**

Find "## 22. Seller Studio, Export & Template Updates (pointer)" — this is a pointer section (detail lives in `TECH_REQUIREMENTS.md`/`CURRENT_FUNCTIONALITY.md`, per its own name), so add one short line rather than a full writeup:

```
URL-import's headless-Chromium fallback and its CSRF-safe thumbnail proxy are detailed in `docs/TECH_REQUIREMENTS.md` §30 and `docs/CURRENT_FUNCTIONALITY.md`; the shared `scripts/lib/chromiumLauncher.ts` module (used by both this feature and the catalog PDF export) is the single point where the `playwright` dependency is loaded.
```

- [ ] **Step 6: Mirror Step 5 into `docs/DESIGN_zh.md`**

Add the equivalent one-line pointer to the corresponding Chinese section:

```
URL 导入的无头 Chromium 兜底方案及其 CSRF 安全缩略图代理，详见 `docs/TECH_REQUIREMENTS.md` §30 与 `docs/CURRENT_FUNCTIONALITY.md`；共享模块 `scripts/lib/chromiumLauncher.ts`（本功能与目录 PDF 导出共用）是加载 `playwright` 依赖的唯一入口。
```

- [ ] **Step 7: Update `docs/SCRIPTS.md`**

Find the existing line: `> **Catalog PDF export** (Seller Studio's "Export PDF" button) renders via headless Chromium. One-time setup: \`npx playwright install chromium\`.` and extend it:

```
> **Catalog PDF export** (Seller Studio's "Export PDF" button) and **URL-import's deep-import fallback** (for JavaScript-rendered product pages the fast fetch can't read) both render via headless Chromium, sharing the same one-time setup: `npx playwright install chromium`. Skipping this step doesn't break either feature — PDF export shows a clear error, and URL-import silently falls back to its fast-path-only behavior with a hint pointing at this same command.
```

- [ ] **Step 8: Mirror Step 7 into `docs/SCRIPTS_zh.md`**

Find the corresponding line: `> **目录 PDF 导出**（Seller Studio 中的"导出 PDF"按钮）通过 headless Chromium 渲染。首次使用需要执行一次：\`npx playwright install chromium\`。` and extend it:

```
> **目录 PDF 导出**（Seller Studio 中的"导出 PDF"按钮）与 **URL 导入的深度导入兜底**（用于快速抓取读不到内容的 JavaScript 渲染商品页）都通过 headless Chromium 渲染，共用同一个一次性安装步骤：`npx playwright install chromium`。不执行这一步不会导致任何一个功能崩溃——PDF 导出会显示明确的错误提示，URL 导入则会静默回退到仅使用快速抓取路径的行为，并给出指向同一条命令的提示。
```

- [ ] **Step 9: Proofread both languages side by side**

Read through each of the eight edited files' changed section once more, in pairs (English file next to its `_zh` counterpart), confirming: every English addition has a Chinese counterpart saying the same thing (not just present, but matching in substance), no leftover placeholder text, and terminology stays consistent with each file's own existing glossary (e.g. however "headless" or "fallback" or "hotlink protection" were already rendered into Chinese elsewhere in `_zh` files, if at all — prefer consistency with any existing precedent over a fresh translation choice).

- [ ] **Step 10: Commit**

```bash
git add docs/CURRENT_FUNCTIONALITY.md docs/CURRENT_FUNCTIONALITY_zh.md docs/TECH_REQUIREMENTS.md docs/TECH_REQUIREMENTS_zh.md docs/DESIGN.md docs/DESIGN_zh.md docs/SCRIPTS.md docs/SCRIPTS_zh.md
git commit -m "$(cat <<'EOF'
docs: document the URL-import headless fallback, thumbnail proxy, and paste escape hatch

Bilingual updates (CLAUDE.md Rule 2) across CURRENT_FUNCTIONALITY.md,
TECH_REQUIREMENTS.md, DESIGN.md, and SCRIPTS.md: the two-tier fetch and
its known limitations, the new /api/import-url/thumbnail route contract,
the updated preview/import request-response shapes, and that the
headless fallback shares its one-time Chromium setup with the existing
catalog PDF export rather than needing a separate install step.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Plan-level verification

After Task 11's commit, run the full suite once more end to end before considering this plan done:

```bash
pnpm type-check && pnpm lint && pnpm test
```

Expected: all green. Then manually re-run the Task 9/Task 10 manual-verification steps once more in combination (paste a URL, fetch a page that needs the headless fallback, confirm thumbnails render and nothing gets silently discarded) since each was checked individually at the time but not necessarily together as the very last thing built.

