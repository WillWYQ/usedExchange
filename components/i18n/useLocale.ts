"use client";

import { useLocaleContext } from "./LocaleProvider";

// Returns the active locale string and a setter that persists to localStorage.
export function useLocale() {
  return useLocaleContext();
}
