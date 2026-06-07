"use client";

import { siteConfig } from "@/content/config";
import type { Price, PriceTier } from "@/lib/content/types";
import { resolveItemPrice } from "@/lib/utils/pricing";
import { useGeolocation } from "@/components/pricing/useGeolocation";
import { useDistancePricing } from "@/components/pricing/useDistancePricing";
import { LocationPriceBar } from "@/components/pricing/LocationPriceBar";
import { PricingTableToggle } from "./PricingTableToggle";

type PricingSectionProps = {
  price: Price;
  // Server-computed fallback tier (resolveItemPrice with source:"fallback").
  // Matches the hook's initial state so there is no hydration mismatch.
  initialResolvedTier: PriceTier | null;
  // Show struck-through previous price when price_reduced is true.
  previousLowestPrice?: number | null;
};

// Owns all geolocation + distance state for the item detail page.
// Renders LocationPriceBar (geo/distance status) above PricingTableToggle (pricing).
//
// SSG note: initialResolvedTier is computed server-side with { source:"fallback" },
// which matches this component's initial hook state — no content flash on hydration.
export function PricingSection({
  price,
  initialResolvedTier,
  previousLowestPrice,
}: PricingSectionProps) {
  const geoState = useGeolocation();
  const { resolved, setManualMiles } = useDistancePricing(siteConfig.location, geoState);

  const resolvedTier = resolveItemPrice(price, resolved) ?? initialResolvedTier;

  return (
    <div className="flex flex-col gap-4">
      <LocationPriceBar
        geoState={geoState}
        resolved={resolved}
        onManualMiles={setManualMiles}
      />

      {/* Struck-through previous price — shown alongside current when price_reduced */}
      {previousLowestPrice !== null && previousLowestPrice !== undefined && resolvedTier && (
        <p className="text-sm text-white/50">
          Was:{" "}
          <span className="line-through">
            {price.currency === "USD" ? "$" : price.currency + " "}
            {previousLowestPrice.toLocaleString()}
          </span>
        </p>
      )}

      <PricingTableToggle price={price} resolvedTier={resolvedTier} />
    </div>
  );
}
