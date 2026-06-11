import { describe, it, expect } from "vitest";
import { isShippingTier, resolveShippingPayer, canEstimateShipping } from "./shipping";
import type { Price, PriceTier, Weight, Dimensions } from "@/lib/content/types";
import type { SiteConfig } from "@/lib/config/types";

const tier = (label: string, amount: number, miles_min?: number, miles_max?: number): PriceTier => ({
  label,
  amount,
  miles_min,
  miles_max,
});

const price = (overrides: Partial<Price> = {}): Price => ({
  currency: "USD",
  tiers: [],
  negotiable: false,
  show_tiers: false,
  ...overrides,
});

const shippingConfig = (
  overrides: Partial<NonNullable<SiteConfig["shipping"]>> = {},
): NonNullable<SiteConfig["shipping"]> => ({
  enabled: true,
  proxyUrl: "https://shipping-rate-proxy.example.workers.dev",
  defaultPayer: "buyer",
  origin: { zip: "94103", country: "US" },
  ...overrides,
});

const weight: Weight = { value: 0.8, unit: "kg" };
const dimensions: Dimensions = { length: 45, width: 15, height: 15, unit: "cm" };

describe("isShippingTier", () => {
  it("returns false for null", () => {
    expect(isShippingTier(null)).toBe(false);
  });

  it("returns false for a tier with miles_max", () => {
    expect(isShippingTier(tier("Pickup", 15, undefined, 5))).toBe(false);
  });

  it("returns true for an open-ended tier (miles_max absent)", () => {
    expect(isShippingTier(tier("Shipping", 35, 30))).toBe(true);
  });
});

describe("resolveShippingPayer", () => {
  it("falls back to siteConfig default when item has no override", () => {
    expect(resolveShippingPayer(price(), shippingConfig({ defaultPayer: "seller" }))).toBe(
      "seller",
    );
  });

  it("uses the item-level override when present", () => {
    expect(
      resolveShippingPayer(
        price({ shipping_payer: "seller" }),
        shippingConfig({ defaultPayer: "buyer" }),
      ),
    ).toBe("seller");
  });
});

describe("canEstimateShipping", () => {
  const shippingTier = tier("Shipping", 35, 30);
  const pickupTier = tier("Pickup", 15, undefined, 5);

  it("is false when shipping config is absent", () => {
    expect(canEstimateShipping(undefined, weight, dimensions, shippingTier)).toBe(false);
  });

  it("is false when shipping is disabled", () => {
    expect(
      canEstimateShipping(shippingConfig({ enabled: false }), weight, dimensions, shippingTier),
    ).toBe(false);
  });

  it("is false when weight or dimensions are missing", () => {
    const config = shippingConfig();
    expect(canEstimateShipping(config, null, dimensions, shippingTier)).toBe(false);
    expect(canEstimateShipping(config, weight, null, shippingTier)).toBe(false);
  });

  it("is false when the resolved tier is not the open-ended shipping tier", () => {
    expect(canEstimateShipping(shippingConfig(), weight, dimensions, pickupTier)).toBe(false);
  });

  it("is true when all preconditions are met", () => {
    expect(canEstimateShipping(shippingConfig(), weight, dimensions, shippingTier)).toBe(true);
  });
});
