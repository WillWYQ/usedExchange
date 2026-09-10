import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./chromiumLauncher", () => ({
  launchChromiumOrError: vi.fn(),
}));
vi.mock("./ssrfGuard", () => ({
  checkHostnameAllowed: vi.fn(),
}));

// headlessImport.ts deliberately keeps ONE warm Chromium cached in module
// scope for the life of the Studio process, so a plain top-level import
// would let a browser cached by one test satisfy getBrowser() in the next
// one -- every test after the first would then silently exercise the
// previous test's page/context instead of its own. vi.clearAllMocks()
// cannot fix that: it clears call history, not module state. Re-importing
// the module under test after vi.resetModules() gives each test a genuinely
// cold cache. The mock factories above re-run on each re-import, so the
// bindings below are rebound to that test's fresh mocks.
type LauncherModule = typeof import("./chromiumLauncher");
type GuardModule = typeof import("./ssrfGuard");
type HeadlessModule = typeof import("./headlessImport");

let launchChromiumOrError: LauncherModule["launchChromiumOrError"];
let checkHostnameAllowed: GuardModule["checkHostnameAllowed"];
let renderWithHeadlessBrowser: HeadlessModule["renderWithHeadlessBrowser"];

beforeEach(async () => {
  vi.resetModules();
  ({ launchChromiumOrError } = await import("./chromiumLauncher"));
  ({ checkHostnameAllowed } = await import("./ssrfGuard"));
  ({ renderWithHeadlessBrowser } = await import("./headlessImport"));
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

describe("renderWithHeadlessBrowser — request interception", () => {
  afterEach(() => vi.clearAllMocks());

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
