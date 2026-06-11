"use client";

import { useState } from "react";
import type { Price, PriceTier, Weight, Dimensions } from "@/lib/content/types";
import { siteConfig } from "@/content/config";
import { useT } from "@/components/i18n/useT";
import { useShippingRate } from "@/components/pricing/useShippingRate";
import { canEstimateShipping, resolveShippingPayer } from "@/lib/utils/shipping";

type ShippingEstimatorProps = {
  price: Price;
  resolvedTier: PriceTier | null;
  weight: Weight | null;
  dimensions: Dimensions | null;
};

// Optional ZIP-based shipping estimate. Renders nothing when
// siteConfig.shipping is absent/disabled, the item lacks weight/dimensions,
// or the resolved tier isn't the open-ended "shipping" tier — see
// canEstimateShipping() in lib/utils/shipping.ts. See DESIGN.md §21.
export function ShippingEstimator({
  price,
  resolvedTier,
  weight,
  dimensions,
}: ShippingEstimatorProps) {
  const t = useT();
  const { shipping } = siteConfig;
  const [zip, setZip] = useState("");

  const eligible = canEstimateShipping(shipping, weight, dimensions, resolvedTier);

  // Hooks must run unconditionally — fall back to zero-value parcel inputs
  // when ineligible; fetchRate is never called in that case.
  const { state, fetchRate } = useShippingRate(
    shipping?.proxyUrl ?? "",
    weight ?? { value: 0, unit: "kg" },
    dimensions ?? { length: 0, width: 0, height: 0, unit: "cm" },
    shipping?.origin.country ?? "US",
    price.currency || siteConfig.currency,
  );

  if (!eligible || !shipping) return null;

  if (resolveShippingPayer(price, shipping) === "seller") {
    return <p className="text-sm text-foreground/60">{t.shippingIncludedBySeller}</p>;
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <label className="flex items-center gap-2">
        <span className="text-foreground/60">{t.shippingEstimateLabel}</span>
        <input
          type="text"
          inputMode="numeric"
          value={zip}
          onChange={(e) => setZip(e.target.value)}
          onBlur={() => fetchRate(zip)}
          onKeyDown={(e) => e.key === "Enter" && fetchRate(zip)}
          placeholder={t.shippingZipPlaceholder}
          className="w-28 rounded border border-foreground/15 bg-transparent px-2 py-1"
        />
      </label>

      {state.status === "loading" && (
        <p className="text-foreground/40">{t.shippingCalculating}</p>
      )}
      {state.status === "ready" && (
        <p className="font-medium">
          + {state.rate.currency === "USD" ? "$" : state.rate.currency + " "}
          {state.rate.amount.toLocaleString()} {t.shippingEstimateSuffix}
          {state.rate.estimatedDays !== null &&
            ` (${state.rate.carrier} ${state.rate.service}, ~${state.rate.estimatedDays}d)`}
        </p>
      )}
      {state.status === "error" && (
        <p className="text-foreground/40">{t.shippingUnavailable}</p>
      )}
    </div>
  );
}
