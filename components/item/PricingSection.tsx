"use client";

import type { Price, PriceTier, Weight, Dimensions } from "@/lib/content/types";
import { resolveItemPrice } from "@/lib/utils/pricing";
import { useDistancePricingContext } from "@/components/pricing/DistancePricingContext";
import { LocationPriceBar } from "@/components/pricing/LocationPriceBar";
import { PricingTableToggle } from "./PricingTableToggle";
import { ShippingEstimator } from "./ShippingEstimator";

type PricingSectionProps = {
  price: Price;
  // Server-computed fallback tier (resolveItemPrice with source:"fallback").
  // Matches the hook's initial state so there is no hydration mismatch.
  initialResolvedTier: PriceTier | null;
  // Show struck-through previous price when price_reduced is true.
  previousLowestPrice?: number | null;
  // Passed through to ShippingEstimator — see DESIGN.md §21.
  weight?: Weight | null;
  dimensions?: Dimensions | null;
};

// Renders LocationPriceBar (geo/distance status) above PricingTableToggle (pricing).
// Distance state comes from the shared DistancePricingProvider (wrapping the
// item detail page) — see DistancePricingContext for why this no longer
// instantiates its own useGeolocation()/useDistancePricing() (it used to run
// alongside ContactSection's identical calls, requesting the browser's
// location twice from sibling components on the same page).
//
// SSG note: initialResolvedTier is computed server-side with { source:"fallback" },
// which matches the provider's initial hook state — no content flash on hydration.
export function PricingSection({
  price,
  initialResolvedTier,
  previousLowestPrice,
  weight = null,
  dimensions = null,
}: PricingSectionProps) {
  const { geoState, resolved, setManualMiles } = useDistancePricingContext();

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
        <p className="text-sm text-foreground/50">
          Was:{" "}
          <span className="line-through">
            {price.currency === "USD" ? "$" : price.currency + " "}
            {previousLowestPrice.toLocaleString()}
          </span>
        </p>
      )}

      <PricingTableToggle price={price} resolvedTier={resolvedTier} />

      <ShippingEstimator
        price={price}
        resolvedTier={resolvedTier}
        weight={weight}
        dimensions={dimensions}
      />
    </div>
  );
}
