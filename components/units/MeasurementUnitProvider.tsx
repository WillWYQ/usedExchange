"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { siteConfig } from "@/content/config";
import { resolveMeasurementUnit } from "@/lib/utils/units";
import type { MeasurementUnit } from "@/lib/utils/units";
import { useLocaleContext } from "@/components/i18n/LocaleProvider";

type MeasurementUnitContextValue = {
  unit: MeasurementUnit;
  setUnit: (unit: MeasurementUnit) => void;
};

const MeasurementUnitContext = createContext<MeasurementUnitContextValue>({
  unit: siteConfig.measurementUnit ?? "metric",
  setUnit: () => {},
});

const STORAGE_KEY = "measurement-unit";

export function MeasurementUnitProvider({ children }: { children: React.ReactNode }) {
  const { locale } = useLocaleContext();

  // Initial value matches server render — useEffect updates after hydration.
  const [unit, setUnitState] = useState<MeasurementUnit>(siteConfig.measurementUnit ?? "metric");

  // On mount and whenever locale changes: use localStorage preference if set,
  // otherwise fall back to the locale-based / site-wide config default.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "metric" || stored === "imperial") {
        setUnitState(stored);
      } else {
        setUnitState(resolveMeasurementUnit(locale, siteConfig));
      }
    } catch {
      setUnitState(resolveMeasurementUnit(locale, siteConfig));
    }
  }, [locale]);

  const setUnit = useCallback((next: MeasurementUnit) => {
    setUnitState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage unavailable (private browsing) — state-only update
    }
  }, []);

  return (
    <MeasurementUnitContext.Provider value={{ unit, setUnit }}>
      {children}
    </MeasurementUnitContext.Provider>
  );
}

export function useMeasurementUnitContext() {
  return useContext(MeasurementUnitContext);
}
