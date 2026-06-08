"use client";

import { createContext, useContext, useMemo } from "react";
import type { GeolocationState, ResolvedDistance } from "@/lib/content/types";
import { useGeolocation } from "./useGeolocation";
import { useDistancePricing } from "./useDistancePricing";

type DistancePricingContextValue = {
  geoState: GeolocationState;
  resolved: ResolvedDistance;
  setManualMiles: (miles: number | null) => void;
};

// Default for consumers rendered outside a provider (e.g. ContactSection in
// SiteFooter, which has no `item` and therefore no use for distance pricing).
// Crucially this does NOT call useGeolocation — so a buyer browsing the site
// is never prompted for location permission just because the footer rendered.
const FALLBACK_VALUE: DistancePricingContextValue = {
  geoState: { status: "unavailable" },
  resolved: { source: "fallback" },
  setManualMiles: () => {},
};

const DistancePricingContext = createContext<DistancePricingContextValue | null>(null);

type DistancePricingProviderProps = {
  sellerLocation: { lat: number; lng: number };
  children: React.ReactNode;
};

/**
 * Instantiates the Geolocation API + distance resolution exactly once and
 * shares the result with every descendant via context.
 *
 * Without this, each of PricingSection / ContactSection / ItemGrid /
 * RecentlyListedSection independently called useGeolocation() +
 * useDistancePricing() — on the item detail page that meant two siblings
 * (PricingSection and ContactSection) requested the browser's location
 * simultaneously and could theoretically resolve to divergent `resolved`
 * values across renders. Wrap the page region that needs distance-aware
 * pricing in this provider once; every consumer then reads the same state.
 */
export function DistancePricingProvider({ sellerLocation, children }: DistancePricingProviderProps) {
  const geoState = useGeolocation();
  const { resolved, setManualMiles } = useDistancePricing(sellerLocation, geoState);

  const value = useMemo<DistancePricingContextValue>(
    () => ({ geoState, resolved, setManualMiles }),
    [geoState, resolved, setManualMiles],
  );

  return (
    <DistancePricingContext.Provider value={value}>
      {children}
    </DistancePricingContext.Provider>
  );
}

/**
 * Reads the shared distance-pricing state. Safe to call from anywhere —
 * components rendered outside a DistancePricingProvider (e.g. the footer's
 * item-less ContactSection) get FALLBACK_VALUE and never trigger geolocation.
 */
export function useDistancePricingContext(): DistancePricingContextValue {
  const ctx = useContext(DistancePricingContext);
  return ctx ?? FALLBACK_VALUE;
}
