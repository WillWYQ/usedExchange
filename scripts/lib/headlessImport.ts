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
