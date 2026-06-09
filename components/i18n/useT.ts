"use client";

import { siteConfig } from "@/content/config";
import type { UIStrings } from "@/lib/config/types";
import { EN_FALLBACK } from "@/lib/i18n/translations";
import { useLocale } from "./useLocale";

export function useT(): UIStrings {
  const { locale } = useLocale();
  const { defaultLocale, translations } = siteConfig.i18n;

  // Resolution order: active locale → default locale → built-in EN fallback.
  // Partial<UIStrings> means any key may be absent; spread merges from the
  // least specific to most specific so the most specific key wins.
  const defaultDict = translations[defaultLocale] ?? {};
  const activeDict = locale !== defaultLocale ? (translations[locale] ?? {}) : {};

  return { ...EN_FALLBACK, ...defaultDict, ...activeDict };
}
