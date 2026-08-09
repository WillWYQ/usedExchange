import { describe, expect, it } from "vitest";
import { displayName, coverImageUrl } from "./itemDisplay";
import type { StudioItem } from "./api";

function item(over: Partial<StudioItem> = {}): StudioItem {
  return {
    id: "electronics/desk-lamp",
    categorySlug: "electronics",
    itemSlug: "desk-lamp",
    name: "Desk Lamp",
    status: "available",
    currency: "USD",
    lowestTierAmount: 20,
    imageCount: 1,
    coverImage: "cover.jpg",
    localizedNames: { en: "Desk Lamp", zh: "台灯" },
    tags: [],
    listedDate: "2026-01-01",
    ...over,
  };
}

describe("displayName", () => {
  it("uses the requested locale when available", () => {
    expect(displayName(item(), "zh")).toBe("台灯");
  });

  it("falls back to the default name when the locale is missing", () => {
    expect(displayName(item({ localizedNames: { en: "Desk Lamp" } }), "zh")).toBe("Desk Lamp");
  });
});

describe("coverImageUrl", () => {
  it("encodes the category, item slug, and filename into the API path", () => {
    expect(coverImageUrl(item())).toBe(
      "/api/items/electronics/desk-lamp/images/cover.jpg",
    );
  });

  it("returns null when there is no cover image", () => {
    expect(coverImageUrl(item({ coverImage: null }))).toBeNull();
  });
});
