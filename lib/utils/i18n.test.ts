import { vi, describe, it, expect } from "vitest";

// vi.mock is hoisted by Vitest above all imports, so the mock is in place
// before i18n.ts (which imports @/content/config at the module level) is loaded.
vi.mock("@/content/config", () => ({
  siteConfig: {
    i18n: {
      defaultLocale: "en",
      strings: {
        heroTagline: "Quality second-hand items",
        recentlyListed: "",
        browseAll: "",
        makeOffer: "",
        contactSeller: "",
        soldBanner: "",
      },
    },
  },
}));

import { getLocalizedField, t } from "./i18n";
import type { Item } from "@/lib/content/types";

// ── Fixture ───────────────────────────────────────────────────────────────────

/** Minimal Item-shaped object covering only the fields accessed by i18n utils. */
const baseItem = {
  name: "iPhone 14 Pro",
  description: "Great condition.",
  nameZh: "苹果手机",
  descriptionZh: "品相极佳。",
} as unknown as Item;

// ── getLocalizedField ─────────────────────────────────────────────────────────

describe("getLocalizedField", () => {
  describe("default locale (en)", () => {
    it("returns the English name", () => {
      expect(getLocalizedField(baseItem, "name", "en")).toBe("iPhone 14 Pro");
    });

    it("returns the English description", () => {
      expect(getLocalizedField(baseItem, "description", "en")).toBe(
        "Great condition.",
      );
    });
  });

  describe("supported translation locale (zh)", () => {
    it("returns the Chinese name when nameZh is non-empty", () => {
      expect(getLocalizedField(baseItem, "name", "zh")).toBe("苹果手机");
    });

    it("returns the Chinese description when descriptionZh is non-empty", () => {
      expect(getLocalizedField(baseItem, "description", "zh")).toBe(
        "品相极佳。",
      );
    });

    it("falls back to English name when nameZh is empty string", () => {
      const item = { ...baseItem, nameZh: "" } as unknown as Item;
      expect(getLocalizedField(item, "name", "zh")).toBe("iPhone 14 Pro");
    });

    it("falls back to English name when nameZh is whitespace-only", () => {
      const item = { ...baseItem, nameZh: "   " } as unknown as Item;
      expect(getLocalizedField(item, "name", "zh")).toBe("iPhone 14 Pro");
    });

    it("falls back to English description when descriptionZh is empty", () => {
      const item = { ...baseItem, descriptionZh: "" } as unknown as Item;
      expect(getLocalizedField(item, "description", "zh")).toBe(
        "Great condition.",
      );
    });
  });

  describe("unsupported locale", () => {
    it("falls back to English for an unsupported locale code ('fr')", () => {
      // "fr" has no entry in LOCALE_FIELD_MAP, so the English value is used.
      expect(getLocalizedField(baseItem, "name", "fr")).toBe("iPhone 14 Pro");
    });

    it("falls back to English for an empty locale string", () => {
      expect(getLocalizedField(baseItem, "name", "")).toBe("iPhone 14 Pro");
    });

    it("does NOT accidentally read a field via prototype-like locale names", () => {
      // A locale like "constructor" or "__proto__" must not cause unexpected
      // field access.  LOCALE_FIELD_MAP has no entry for these, so the guard
      // `if (fieldMap)` short-circuits and returns the English value.
      expect(getLocalizedField(baseItem, "name", "constructor")).toBe(
        "iPhone 14 Pro",
      );
    });
  });
});

// ── t ─────────────────────────────────────────────────────────────────────────

describe("t", () => {
  it("returns the configured string when it is non-empty", () => {
    expect(t("heroTagline", "fallback")).toBe("Quality second-hand items");
  });

  it("returns the fallback when the configured string is empty", () => {
    // recentlyListed is "" in the mock
    expect(t("recentlyListed", "Recently Listed")).toBe("Recently Listed");
  });

  it("returns '' when both the configured string and fallback are empty", () => {
    expect(t("recentlyListed", "")).toBe("");
  });

  it("returns '' when no fallback is provided and the configured string is empty", () => {
    expect(t("browseAll")).toBe("");
  });

  it("does not return the fallback when the configured string is non-empty", () => {
    // Make sure a truthy configured value is never overridden by the fallback
    expect(t("heroTagline", "should not appear")).toBe(
      "Quality second-hand items",
    );
  });
});
