// Server-side translation resolver — safe to call in Server Components and
// scripts. For client components, use useT() from components/i18n/useT.ts.
//
// Always resolves against the default locale because Server Components render
// once at export time, before the visitor's locale preference is known.
// Client-side locale switching is handled by useT() after hydration.

import { siteConfig } from "@/content/config";
import type { UIStrings } from "@/lib/config/types";
import { EN_FALLBACK } from "./translations";

export function getTranslations(): UIStrings {
  const { defaultLocale, translations } = siteConfig.i18n;
  const defaultDict = translations[defaultLocale] ?? {};
  return { ...EN_FALLBACK, ...defaultDict };
}
