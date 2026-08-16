import { describe, expect, it, vi } from "vitest";

vi.mock("@/content/config", () => ({
  siteConfig: {
    i18n: {
      defaultLocale: "en",
      availableLocales: ["en", "zh"],
      translations: {
        en: { pdfTocHeading: "Table of Contents" },
        zh: { pdfTocHeading: "目錄" },
      },
    },
  },
}));

import { getTranslationsForLocale } from "./getTranslations";

describe("getTranslationsForLocale", () => {
  it("resolves the requested locale's override over the default locale", () => {
    const t = getTranslationsForLocale("zh");
    expect(t.pdfTocHeading).toBe("目錄");
  });

  it("falls back to the default locale's dict when the requested locale has no entry for a key", () => {
    const t = getTranslationsForLocale("zh");
    // "home" has no zh entry in this mock, only in EN_FALLBACK — must come
    // through unchanged from the real EN_FALLBACK import, not the mock.
    expect(t.home).toBe("Home");
  });

  it("resolves the default locale directly when asked for it", () => {
    const t = getTranslationsForLocale("en");
    expect(t.pdfTocHeading).toBe("Table of Contents");
  });
});
