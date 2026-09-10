// SSRF-guarded headless-Chromium fallback for Studio's URL-import feature.
// Runs only when the plain-HTTP fetch (scripts/lib/urlImport.ts +
// scripts/lib/ssrfGuard.ts) finds zero photo candidates -- most sites
// never reach this module at all. See
// docs/superpowers/specs/2026-09-08-studio-url-import-reliability-design.md §6.

import type { Browser, BrowserContext } from "playwright";
import { launchChromiumOrError } from "./chromiumLauncher";
import { checkHostnameAllowed } from "./ssrfGuard";
import { getSsrfSafeProxy } from "./ssrfSafeProxy";

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
// The in-flight LAUNCH is cached too, not just the launched browser. Without
// this, two renders that both miss a cold cache each call
// launchChromiumOrError(); the second assignment to cachedBrowser silently
// orphans the first Chromium, which nothing ever closes and which therefore
// leaks for the life of the Studio process.
let launchInFlight: Promise<{ browser: Browser } | { error: string }> | null = null;

async function getBrowser(): Promise<{ browser: Browser } | { error: string }> {
  if (cachedBrowser && cachedBrowser.isConnected()) {
    return { browser: cachedBrowser };
  }
  if (!launchInFlight) {
    launchInFlight = launchChromiumOrError()
      .then((launch) => {
        if ("error" in launch) return launch;
        const launched = launch.browser;
        cachedBrowser = launched;
        // Proactive self-healing: a browser that dies between requests (crash,
        // OOM-kill) is detected the moment it happens, not just discovered the
        // next time something tries to use it. isConnected() above is the
        // belt-and-braces synchronous check for the gap between "it
        // disconnected" and "this listener fired".
        launched.on("disconnected", () => {
          if (cachedBrowser === launched) cachedBrowser = null;
        });
        return { browser: launched };
      })
      // launchChromiumOrError is documented never to throw, but this function's
      // callers convert only its typed { error } case -- a rejection here would
      // otherwise escape renderWithHeadlessBrowser's Promise contract.
      .catch(() => ({ error: "Headless browser launch failed." }))
      .finally(() => {
        launchInFlight = null;
      });
  }
  return launchInFlight;
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
    // The authoritative SSRF boundary. Obtained BEFORE the context exists and
    // deliberately not caught here: if the proxy cannot start, this throws, the
    // catch below returns navigation-failed, and no context is ever created --
    // rendering with an unproxied context would be the one unacceptable
    // degradation. See ssrfSafeProxy.ts for what route() alone cannot cover
    // (redirect hops, address pinning, WebSocket CONNECTs).
    const proxy = await getSsrfSafeProxy();
    context = await browser.newContext({
      proxy: { server: `http://127.0.0.1:${proxy.port}` },
    });
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
    // finally runs AFTER the catch above, so an unguarded rejection here would
    // escape uncaught and break the Promise<HeadlessRenderResult> contract --
    // and close() is most likely to reject precisely when the browser has died
    // mid-render, the exact case the catch exists to absorb.
    await context?.close().catch(() => {});
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

/** Test-only teardown for the warm-instance cache. Production deliberately
 *  never closes it (see above), but a real-Chromium test that left one running
 *  would keep the test runner's process alive. */
export async function __closeHeadlessBrowserForTests(): Promise<void> {
  const browser = cachedBrowser;
  cachedBrowser = null;
  launchInFlight = null;
  if (!browser) return;
  await browser.close().catch(() => {});
}
