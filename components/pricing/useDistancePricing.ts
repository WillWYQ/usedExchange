"use client";

import { useState, useEffect } from "react";
import type { GeolocationState, ResolvedDistance } from "@/lib/content/types";
import { haversineInMiles } from "@/lib/utils/haversine";

type UseDistancePricingResult = {
  resolved: ResolvedDistance;
  // Pass null to clear a manual override and revert to detected / fallback.
  setManualMiles: (miles: number | null) => void;
};

// Converts a geolocation state into a ResolvedDistance for use with
// resolveItemPrice(). Always starts at { source: "fallback" } so components
// can render fallback prices before geo resolves — no blank or loading state.
// Callers always import resolveItemPrice directly from lib/utils/pricing (not re-exported here).
export function useDistancePricing(
  sellerLocation: { lat: number; lng: number },
  geoState: GeolocationState,
): UseDistancePricingResult {
  const [manualMiles, setManualMilesState] = useState<number | null>(null);
  const [resolved, setResolved] = useState<ResolvedDistance>({ source: "fallback" });

  const { lat: sellerLat, lng: sellerLng } = sellerLocation;

  useEffect(() => {
    if (manualMiles !== null) {
      setResolved({ source: "manual", miles: manualMiles });
      return;
    }

    if (geoState.status === "granted") {
      const miles = haversineInMiles(sellerLat, sellerLng, geoState.lat, geoState.lng);
      setResolved({ source: "detected", miles });
      return;
    }

    // idle | pending | denied | unavailable → show highest-price tier
    setResolved({ source: "fallback" });
  }, [geoState, manualMiles, sellerLat, sellerLng]);

  return {
    resolved,
    setManualMiles: setManualMilesState,
  };
}
