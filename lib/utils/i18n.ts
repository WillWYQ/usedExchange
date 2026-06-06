import { siteConfig } from "@/content/config";
import type { Item } from "@/lib/content/types";

/**
 * Returns the localised value of `name` or `description` for the given locale.
 * Falls back to the default-locale (English) value when no translation exists.
 */
export function getLocalizedField(
  item: Item,
  field: "name" | "description",
  locale: string,
): string {
  if (locale !== siteConfig.i18n.defaultLocale) {
    const localeKey = `${field}_${locale}` as keyof Item;
    const localized = item[localeKey];
    if (typeof localized === "string" && localized.trim() !== "") {
      return localized;
    }
  }
  return item[field];
}

/**
 * Resolves a UI string key from siteConfig.i18n.strings.
 * Returns `fallback` when the configured string is empty.
 */
export function t(
  key: keyof typeof siteConfig.i18n.strings,
  fallback: string = "",
): string {
  return siteConfig.i18n.strings[key] || fallback;
}
