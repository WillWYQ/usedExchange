import type { Price, PriceTier } from "@/lib/content/types";

type PricingTableProps = {
  price: Price;
  // The tier that matches the buyer's current distance (null = no tiers exist).
  resolvedTier: PriceTier | null;
};

// Presentational — no state, no "use client".
// Renders all price tiers as a table, visually accenting the resolved row.
// Shows "Contact for price" when price.tiers is empty.
export function PricingTable({ price, resolvedTier }: PricingTableProps) {
  if (price.tiers.length === 0) {
    return (
      <p className="text-sm text-white/50">
        Contact seller for pricing details.
      </p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-white/10 text-left text-xs text-white/40">
          <th className="pb-2 pr-4 font-normal">Label</th>
          <th className="pb-2 pr-4 font-normal">Distance</th>
          <th className="pb-2 text-right font-normal">Price</th>
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
                "border-b border-white/5 transition-colors",
                isResolved
                  ? "bg-white/10 font-semibold text-white"
                  : "text-white/60",
              ].join(" ")}
              aria-current={isResolved ? "true" : undefined}
            >
              <td className="py-2 pr-4">
                <span className="flex items-center gap-1.5">
                  {isResolved && (
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full bg-white"
                      aria-hidden="true"
                    />
                  )}
                  {tier.label || "—"}
                </span>
              </td>
              <td className="py-2 pr-4">
                <TierRange tier={tier} />
              </td>
              <td className="py-2 text-right">
                {price.currency === "USD" ? "$" : price.currency + " "}
                {tier.amount.toLocaleString()}
                {price.negotiable && (
                  <span className="ml-1 text-xs text-white/40">OBO</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TierRange({ tier }: { tier: PriceTier }) {
  const hasMin = tier.miles_min !== undefined && tier.miles_min > 0;
  const hasMax = tier.miles_max !== undefined;

  if (!hasMin && !hasMax) return <span className="text-white/40">Pickup</span>;
  if (!hasMin && hasMax) return <span>≤ {tier.miles_max} mi</span>;
  if (hasMin && !hasMax) return <span>{">"} {tier.miles_min} mi</span>;
  return (
    <span>
      {tier.miles_min} – {tier.miles_max} mi
    </span>
  );
}
