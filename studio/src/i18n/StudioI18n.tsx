// studio/src/i18n/StudioI18n.tsx
"use client";

import { createContext, useContext, useMemo, type ReactElement, type ReactNode } from "react";
import { render, type RenderResult } from "@testing-library/react";
import type { StudioI18nValue, StudioKey } from "./types";
import { resolveStudioStrings, format } from "./resolve";

const StudioI18nContext = createContext<StudioI18nValue | null>(null);

export function StudioI18nProvider({
  locale,
  overrides = {},
  children,
}: {
  locale: string;
  overrides?: Record<string, Record<string, string>>;
  children: ReactNode;
}) {
  const value = useMemo<StudioI18nValue>(() => {
    const dict = resolveStudioStrings(locale, overrides);
    return {
      locale,
      t: (key: StudioKey, params?: Record<string, string | number>) =>
        format(dict[key] ?? key, params),
    };
  }, [locale, overrides]);

  return (
    <StudioI18nContext.Provider value={value}>
      {children}
    </StudioI18nContext.Provider>
  );
}

export function useStudioT(): StudioI18nValue {
  const ctx = useContext(StudioI18nContext);
  if (!ctx) throw new Error("useStudioT must be used within StudioI18nProvider");
  return ctx;
}

/**
 * Test helper: renders `ui` inside a StudioI18nProvider so component tests can
 * assert on the built-in strings (English by default, same as the previously
 * hardcoded ones).
 */
export function renderWithStudioI18n(
  ui: ReactElement,
  opts: { locale?: string; overrides?: Record<string, Record<string, string>> } = {},
): RenderResult {
  const { locale = "en", overrides } = opts;
  return render(
    <StudioI18nProvider locale={locale} overrides={overrides}>
      {ui}
    </StudioI18nProvider>,
  );
}
