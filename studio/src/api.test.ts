// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fetchItems } from "./api";

describe("fetchItems", () => {
  it("returns items and locale metadata for a valid response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          items: [{ id: "a/b", name: "B" }],
          defaultLocale: "en",
          availableLocales: ["en", "zh"],
        }),
      })) as unknown as typeof fetch,
    );
    const result = await fetchItems();
    expect(result.items).toHaveLength(1);
    expect(result.defaultLocale).toBe("en");
    expect(result.availableLocales).toEqual(["en", "zh"]);
    vi.unstubAllGlobals();
  });

  it("throws when defaultLocale is missing or malformed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ items: [], availableLocales: ["en"] }),
      })) as unknown as typeof fetch,
    );
    await expect(fetchItems()).rejects.toThrow(/unreadable response/);
    vi.unstubAllGlobals();
  });

  it("throws when availableLocales is not an array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ items: [], defaultLocale: "en", availableLocales: "en" }),
      })) as unknown as typeof fetch,
    );
    await expect(fetchItems()).rejects.toThrow(/unreadable response/);
    vi.unstubAllGlobals();
  });
});
