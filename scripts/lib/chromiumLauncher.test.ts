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
