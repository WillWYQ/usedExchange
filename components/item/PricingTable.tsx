"use client";

import type { Price, PriceTier } from "@/lib/content/types";
import { useT } from "@/components/i18n/useT";

type PricingTableProps = {
  price: Price;
  // The tier that matches the buyer's current distance (null = no tiers exist).
  resolvedTier: PriceTier | null;
};

// Shows "Contact for price" when price.tiers is empty.
export function PricingTable({ price, resolvedTier }: PricingTableProps) {
  const t = useT();

  if (price.tiers.length === 0) {
    return (
      <p className="text-sm text-foreground/50">
        {t.contactForPrice}
      </p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-foreground/10 text-left text-xs text-foreground/40">
          <th className="pb-2 pr-4 font-normal">{t.pricingLabelHeader}</th>
          <th className="pb-2 pr-4 font-normal">{t.pricingDistanceHeader}</th>
          <th className="pb-2 text-right font-normal">{t.pricingPriceHeader}</th>
        </tr>
      </thead>
      <tbody>
        {price.tiers.map((tier, i) => {
          const isResolved =
            resolvedTier !== null &&
            tier.label === resolvedTier.label &&
            tier.amount === resolvedTier.amount;

          return (
            <tr
              key={i}
              className={[
                "border-b border-foreground/5 transition-colors",
                isResolved
                  ? "bg-foreground/10 font-semibold text-foreground"
                  : "text-foreground/60",
              ].join(" ")}
              aria-current={isResolved ? "true" : undefined}
            >
              <td className="py-2 pr-4">
                <span className="flex items-center gap-1.5">
                  {isResolved && (
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full bg-foreground"
                      aria-hidden="true"
                    />
                  )}
                  {tier.label || "—"}
                </span>
              </td>
              <td className="py-2 pr-4">
                <TierRange tier={tier} pickup={t.pickup} distanceUnit={t.distanceUnit} />
              </td>
              <td className="py-2 text-right">
                {price.currency === "USD" ? "$" : price.currency + " "}
                {tier.amount.toLocaleString()}
                {price.negotiable && (
                  <span className="ml-1 text-xs text-foreground/40">{t.obo}</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TierRange({
  tier,
  pickup,
  distanceUnit,
}: {
  tier: PriceTier;
  pickup: string;
  distanceUnit: string;
}) {
  const hasMin = tier.miles_min !== undefined && tier.miles_min > 0;
  const hasMax = tier.miles_max !== undefined;

  if (!hasMin && !hasMax) return <span className="text-foreground/40">{pickup}</span>;
  if (!hasMin && hasMax) return <span>≤ {tier.miles_max} {distanceUnit}</span>;
  if (hasMin && !hasMax) return <span>{">"} {tier.miles_min} {distanceUnit}</span>;
  return (
    <span>
      {tier.miles_min} – {tier.miles_max} {distanceUnit}
    </span>
  );
}
