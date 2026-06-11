import type { Price, PriceTier, Weight, Dimensions } from "@/lib/content/types";
import type { SiteConfig } from "@/lib/config/types";

// No "use client" — importable by both server and client components,
// matching the convention in lib/utils/pricing.ts.

export type ShippingPayer = "seller" | "buyer";

export type ShippingRate = {
  amount: number;
  currency: string;
  carrier: string;
  service: string;
  estimatedDays: number | null;
};

// The open-ended tier (miles_max absent) is the "ships to you" tier by
// existing convention (DESIGN.md §5/§17). Live rate estimation only applies
// to that tier — local-pickup tiers are unaffected.
export function isShippingTier(tier: PriceTier | null): boolean {
  return tier !== null && tier.miles_max === undefined;
}

export function resolveShippingPayer(
  price: Price,
  shipping: NonNullable<SiteConfig["shipping"]>,
): ShippingPayer {
  return price.shipping_payer ?? shipping.defaultPayer;
}

// All preconditions for a live rate lookup: feature enabled, item has
// weight + dimensions, and the resolved tier is the open-ended shipping tier.
export function canEstimateShipping(
  shipping: SiteConfig["shipping"],
  weight: Weight | null,
  dimensions: Dimensions | null,
  resolvedTier: PriceTier | null,
): boolean {
  return Boolean(shipping?.enabled && weight && dimensions && isShippingTier(resolvedTier));
}
