"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { siteConfig } from "@/content/config";

type LocaleContextValue = {
  locale: string;
  setLocale: (locale: string) => void;
};

const LocaleContext = createContext<LocaleContextValue>({
  locale: siteConfig.i18n.defaultLocale,
  setLocale: () => {},
});

const STORAGE_KEY = "locale";

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const { defaultLocale, availableLocales } = siteConfig.i18n;

  const [locale, setLocaleState] = useState<string>(defaultLocale);

  // Hydrate from localStorage on mount (client-only; server renders defaultLocale).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && availableLocales.includes(stored)) {
        setLocaleState(stored);
      }
    } catch {
      // localStorage unavailable (e.g. SSR safety, private browsing) — no-op
    }
  }, [availableLocales]);

  const setLocale = useCallback(
    (next: string) => {
      if (!availableLocales.includes(next)) return;
      setLocaleState(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // no-op
      }
    },
    [availableLocales],
  );

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocaleContext() {
  return useContext(LocaleContext);
}
