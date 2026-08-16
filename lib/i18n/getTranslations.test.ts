import { describe, expect, it, vi } from "vitest";

vi.mock("@/content/config", () => ({
  siteConfig: {
    i18n: {
      defaultLocale: "en",
      availableLocales: ["en", "zh"],
      translations: {
        // pdfCoverHeading is deliberately given a value here that differs
        // from the real EN_FALLBACK.pdfCoverHeading ("Full Listing Catalog",
        // lib/i18n/translations.ts) so a test can prove defaultDict actually
        // wins over EN_FALLBACK, not just that "en" passes EN_FALLBACK through
        // unchanged (which pdfTocHeading's coincidentally-matching value can't
        // distinguish).
        en: { pdfTocHeading: "Table of Contents", pdfCoverHeading: "Mock Default Cover Heading" },
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

  it("prefers the default locale's dict over EN_FALLBACK for a key whose mocked value differs from the real fallback", () => {
    const t = getTranslationsForLocale("en");
    // The real EN_FALLBACK.pdfCoverHeading is "Full Listing Catalog" — if
    // defaultDict weren't actually overriding EN_FALLBACK (e.g. a merge-order
    // regression), this would come back as that real value instead.
    expect(t.pdfCoverHeading).toBe("Mock Default Cover Heading");
  });
});
