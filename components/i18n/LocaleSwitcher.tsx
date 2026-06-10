"use client";

import { siteConfig } from "@/content/config";
import { useLocale } from "./useLocale";

// Returns null when only one locale is configured — no visible UI in that case.
export function LocaleSwitcher() {
  const { availableLocales } = siteConfig.i18n;
  const { locale, setLocale } = useLocale();

  if (availableLocales.length <= 1) return null;

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Language switcher">
      {availableLocales.map((code) => (
        <button
          key={code}
          onClick={() => setLocale(code)}
          aria-pressed={locale === code}
          className={[
            "flex h-10 min-w-10 items-center justify-center rounded-lg px-2.5 text-xs font-medium uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            locale === code
              ? "bg-foreground text-background"
              : "text-foreground/60 hover:text-foreground",
          ].join(" ")}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
