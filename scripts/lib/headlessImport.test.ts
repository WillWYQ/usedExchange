import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./chromiumLauncher", () => ({
  launchChromiumOrError: vi.fn(),
}));
vi.mock("./ssrfGuard", () => ({
  checkHostnameAllowed: vi.fn(),
}));
vi.mock("./ssrfSafeProxy", () => ({
  getSsrfSafeProxy: vi.fn(),
}));

// headlessImport.ts deliberately keeps ONE warm Chromium cached in module
// scope for the life of the Studio process, so a plain top-level import
// would let a browser cached by one test satisfy getBrowser() in the next
// one -- every test after the first would then silently exercise the
// previous test's page/context instead of its own. vi.clearAllMocks()
// cannot fix that: it clears call history, not module state. Re-importing
// the module under test after vi.resetModules() gives each test a genuinely
// cold cache.
//
// resetModules() does NOT re-run the vi.mock factories above, though -- the
// same vi.fn() instances are handed back on every re-import. clearAllMocks()
// clears their call history but leaves the mockResolvedValueOnce QUEUE intact,
// so a test that queues two Once values and consumes one poisons the next test
// with the leftover. afterEach therefore uses resetAllMocks(), which drains
// those queues as well; each test sets the implementations it needs.
type LauncherModule = typeof import("./chromiumLauncher");
type GuardModule = typeof import("./ssrfGuard");
type ProxyModule = typeof import("./ssrfSafeProxy");
type HeadlessModule = typeof import("./headlessImport");

let launchChromiumOrError: LauncherModule["launchChromiumOrError"];
let checkHostnameAllowed: GuardModule["checkHostnameAllowed"];
let getSsrfSafeProxy: ProxyModule["getSsrfSafeProxy"];
let renderWithHeadlessBrowser: HeadlessModule["renderWithHeadlessBrowser"];

const PROXY_PORT = 45678;

beforeEach(async () => {
  vi.resetModules();
  ({ launchChromiumOrError } = await import("./chromiumLauncher"));
  ({ checkHostnameAllowed } = await import("./ssrfGuard"));
  ({ getSsrfSafeProxy } = await import("./ssrfSafeProxy"));
  ({ renderWithHeadlessBrowser } = await import("./headlessImport"));
  vi.mocked(getSsrfSafeProxy).mockResolvedValue({
    server: {} as never,
    port: PROXY_PORT,
  });
});

afterEach(() => {
  vi.resetAllMocks();
});

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

// isConnected() and the 'disconnected' event are TWO independent halves of the
// self-healing cache, so the fake exposes two independent levers: __setConnected
// flips only the synchronous check, __fireDisconnected fires only the event (and
// deliberately leaves isConnected() alone). A test that used one lever to move
// both would pass with either half of the production mechanism deleted.
function fakeBrowser(context: ReturnType<typeof fakeContext>, connected = true) {
  const listeners: Record<string, () => void> = {};
  let connectedNow = connected;
  return {
    isConnected: vi.fn(() => connectedNow),
    newContext: vi.fn().mockResolvedValue(context),
    on: vi.fn((event: string, cb: () => void) => {
      listeners[event] = cb;
    }),
    __fireDisconnected: () => listeners["disconnected"]?.(),
    __setConnected: (value: boolean) => {
      connectedNow = value;
    },
  };
}

describe("renderWithHeadlessBrowser — availability", () => {
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

  it("resolves navigation-failed rather than rejecting when context.close() itself rejects", async () => {
    // close() rejecting is most likely exactly when the browser died mid-render
    // -- the scenario the whole self-healing cache exists for. The finally block
    // runs after the catch, so an unguarded close() rejection escapes the
    // Promise<HeadlessRenderResult> contract entirely.
    vi.mocked(checkHostnameAllowed).mockResolvedValue({ allowed: true, address: "93.184.216.34", family: 4 });
    const page = fakePage({ content: vi.fn().mockRejectedValue(new Error("page crashed")) });
    const context = fakeContext(page);
    context.close = vi.fn().mockRejectedValue(new Error("Target page, context or browser has been closed"));
    vi.mocked(launchChromiumOrError).mockResolvedValue({ browser: fakeBrowser(context) as never });

    const result = await renderWithHeadlessBrowser("https://example.com", { timeoutMs: 5000 });

    expect(result).toEqual({ available: false, reason: "navigation-failed" });
  });

  it("still returns the rendered result when only context.close() rejects", async () => {
    vi.mocked(checkHostnameAllowed).mockResolvedValue({ allowed: true, address: "93.184.216.34", family: 4 });
    const page = fakePage();
    const context = fakeContext(page);
    context.close = vi.fn().mockRejectedValue(new Error("Target page, context or browser has been closed"));
    vi.mocked(launchChromiumOrError).mockResolvedValue({ browser: fakeBrowser(context) as never });

    const result = await renderWithHeadlessBrowser("https://example.com", { timeoutMs: 5000 });

    expect(result).toEqual({
      available: true,
      html: "<html><body>rendered</body></html>",
      finalUrl: "https://example.com/final",
    });
  });
});

describe("renderWithHeadlessBrowser — SSRF-pinning proxy wiring", () => {
  it("routes every context through the local SSRF-pinning forward proxy", async () => {
    vi.mocked(checkHostnameAllowed).mockResolvedValue({ allowed: true, address: "93.184.216.34", family: 4 });
    const page = fakePage();
    const context = fakeContext(page);
    const browser = fakeBrowser(context);
    vi.mocked(launchChromiumOrError).mockResolvedValue({ browser: browser as never });

    await renderWithHeadlessBrowser("https://example.com", { timeoutMs: 5000 });

    expect(browser.newContext).toHaveBeenCalledWith({
      proxy: { server: `http://127.0.0.1:${PROXY_PORT}` },
    });
  });

  it("fails closed — no context is created at all when the proxy cannot start", async () => {
    // A context created without the proxy would render with no authoritative
    // SSRF boundary. Degrading to "render anyway" here would be the single
    // worst possible failure mode, so this asserts the opposite.
    vi.mocked(checkHostnameAllowed).mockResolvedValue({ allowed: true, address: "93.184.216.34", family: 4 });
    vi.mocked(getSsrfSafeProxy).mockRejectedValue(new Error("EADDRINUSE"));
    const page = fakePage();
    const context = fakeContext(page);
    const browser = fakeBrowser(context);
    vi.mocked(launchChromiumOrError).mockResolvedValue({ browser: browser as never });

    const result = await renderWithHeadlessBrowser("https://example.com", { timeoutMs: 5000 });

    expect(result).toEqual({ available: false, reason: "navigation-failed" });
    expect(browser.newContext).not.toHaveBeenCalled();
  });
});

describe("renderWithHeadlessBrowser — request interception", () => {
  it("intercepts every request pattern, not a narrowed subset", async () => {
    // Narrowing "**/*" would silently disable interception for most traffic
    // while every handler-behaviour test below stayed green.
    const page = fakePage();
    const context = fakeContext(page);
    vi.mocked(launchChromiumOrError).mockResolvedValue({ browser: fakeBrowser(context) as never });

    await renderWithHeadlessBrowser("https://example.com", { timeoutMs: 5000 });

    expect(context.route).toHaveBeenCalledWith("**/*", expect.any(Function));
  });

  it("aborts asset-shaped resource types without ever checking their hostname", async () => {
    const page = fakePage();
    const context = fakeContext(page);
    vi.mocked(launchChromiumOrError).mockResolvedValue({ browser: fakeBrowser(context) as never });

    await renderWithHeadlessBrowser("https://example.com", { timeoutMs: 5000 });

    const routeHandler = context.route.mock.calls[0]![1] as (route: unknown) => Promise<void>;
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

    const routeHandler = context.route.mock.calls[0]![1] as (route: unknown) => Promise<void>;
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

    const routeHandler = context.route.mock.calls[0]![1] as (route: unknown) => Promise<void>;
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
    const wsHandler = context.routeWebSocket.mock.calls[0]![1] as (ws: unknown) => void;
    const connectToServer = vi.fn();
    wsHandler({ connectToServer });
    expect(connectToServer).not.toHaveBeenCalled();
  });
});

describe("renderWithHeadlessBrowser — self-healing cache", () => {
  it("relaunches when the cached browser fires 'disconnected', even while isConnected() still says true", async () => {
    // isConnected() deliberately keeps returning true here so the ONLY thing
    // that can clear the cache is the 'disconnected' listener. Delete that
    // listener from headlessImport.ts and this test goes red.
    vi.mocked(checkHostnameAllowed).mockResolvedValue({ allowed: true, address: "1.2.3.4", family: 4 });
    const deadContext = fakeContext(fakePage());
    const freshContext = fakeContext(fakePage());
    const deadBrowser = fakeBrowser(deadContext);
    const freshBrowser = fakeBrowser(freshContext);
    vi.mocked(launchChromiumOrError)
      .mockResolvedValueOnce({ browser: deadBrowser as never })
      .mockResolvedValueOnce({ browser: freshBrowser as never });

    await renderWithHeadlessBrowser("https://example.com", { timeoutMs: 5000 }); // caches deadBrowser
    deadBrowser.__fireDisconnected();
    await renderWithHeadlessBrowser("https://example.com", { timeoutMs: 5000 });

    expect(launchChromiumOrError).toHaveBeenCalledTimes(2);
    // The relaunch must actually be USED, not merely performed.
    expect(freshBrowser.newContext).toHaveBeenCalledTimes(1);
    expect(deadBrowser.newContext).toHaveBeenCalledTimes(1);
  });

  it("relaunches when the cached browser reports isConnected() === false with no event", async () => {
    // The belt-and-braces half: no 'disconnected' event is fired at all, so the
    // only thing that can force a relaunch is the synchronous isConnected() check.
    vi.mocked(checkHostnameAllowed).mockResolvedValue({ allowed: true, address: "1.2.3.4", family: 4 });
    const deadContext = fakeContext(fakePage());
    const freshContext = fakeContext(fakePage());
    const deadBrowser = fakeBrowser(deadContext);
    const freshBrowser = fakeBrowser(freshContext);
    vi.mocked(launchChromiumOrError)
      .mockResolvedValueOnce({ browser: deadBrowser as never })
      .mockResolvedValueOnce({ browser: freshBrowser as never });

    await renderWithHeadlessBrowser("https://example.com", { timeoutMs: 5000 });
    deadBrowser.__setConnected(false);
    await renderWithHeadlessBrowser("https://example.com", { timeoutMs: 5000 });

    expect(launchChromiumOrError).toHaveBeenCalledTimes(2);
    expect(freshBrowser.newContext).toHaveBeenCalledTimes(1);
  });

  it("reuses the warm browser when it is still connected", async () => {
    vi.mocked(checkHostnameAllowed).mockResolvedValue({ allowed: true, address: "1.2.3.4", family: 4 });
    const context = fakeContext(fakePage());
    const browser = fakeBrowser(context);
    vi.mocked(launchChromiumOrError).mockResolvedValue({ browser: browser as never });

    await renderWithHeadlessBrowser("https://example.com", { timeoutMs: 5000 });
    await renderWithHeadlessBrowser("https://example.com", { timeoutMs: 5000 });

    expect(launchChromiumOrError).toHaveBeenCalledTimes(1);
    expect(browser.newContext).toHaveBeenCalledTimes(2);
  });

  it("launches only one Chromium when two cold-cache renders overlap", async () => {
    // Without in-flight de-duplication both callers miss the cache, both launch,
    // and the second assignment orphans the first browser for the life of the
    // process -- nothing ever closes the warm cache.
    vi.mocked(checkHostnameAllowed).mockResolvedValue({ allowed: true, address: "1.2.3.4", family: 4 });
    const context = fakeContext(fakePage());
    const browser = fakeBrowser(context);
    let releaseLaunch: (value: { browser: never }) => void = () => {};
    const pendingLaunch = new Promise<{ browser: never }>((resolve) => {
      releaseLaunch = resolve;
    });
    vi.mocked(launchChromiumOrError).mockReturnValue(pendingLaunch);

    const first = renderWithHeadlessBrowser("https://example.com", { timeoutMs: 5000 });
    const second = renderWithHeadlessBrowser("https://example.com", { timeoutMs: 5000 });
    releaseLaunch({ browser: browser as never });
    await Promise.all([first, second]);

    expect(launchChromiumOrError).toHaveBeenCalledTimes(1);
    expect(browser.newContext).toHaveBeenCalledTimes(2);
  });
});
