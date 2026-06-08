import { siteConfig } from "@/content/config";
import type { Item } from "@/lib/content/types";

// ── Locale → Item field mapping ───────────────────────────────────────────────
// FIX Arch 3: replace the brittle `as keyof Item` template-literal cast with a
// typed, explicit map.  Benefits:
//   1. TypeScript verifies that every value is an actual keyof Item at
//      compile time — a typo in a locale key is a build error, not a silent
//      runtime fallback.
//   2. Adding a new locale requires one line here plus the matching fields on
//      the Item type; the pattern is immediately discoverable.
//   3. An unsupported locale code (e.g. "fr") returns undefined from the map
//      and cleanly falls through to the default-locale value.

type TranslatableField = "name" | "description";

const LOCALE_FIELD_MAP: Partial<
  Record<string, Record<TranslatableField, keyof Item>>
> = {
  zh: { name: "nameZh", description: "descriptionZh" },
  // Add further locales here, e.g.:
  // ja: { name: "nameJa", description: "descriptionJa" },
};

/**
 * Returns the localised value of `name` or `description` for the given locale.
 * Falls back to the default-locale (English) value when:
 *   - locale matches the default locale, OR
 *   - the locale has no entry in LOCALE_FIELD_MAP, OR
 *   - the translated value is empty or whitespace-only.
 */
export function getLocalizedField(
  item: Item,
  field: TranslatableField,
  locale: string,
): string {
  if (locale !== siteConfig.i18n.defaultLocale) {
    const fieldMap = LOCALE_FIELD_MAP[locale];
    if (fieldMap) {
      const localized = item[fieldMap[field]];
      if (typeof localized === "string" && localized.trim() !== "") {
        return localized;
      }
    }
  }
  return item[field];
}
