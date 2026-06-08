"use client";

import { useState } from "react";
import type { Price, PriceTier } from "@/lib/content/types";
import { PricingTable } from "./PricingTable";

type PricingTableToggleProps = {
  price: Price;
  // Live-updated as geo/distance changes; does NOT reset the expand/collapse state.
  resolvedTier: PriceTier | null;
};

// Wraps PricingTable with an expand / collapse toggle.
//
// Collapsed (default): shows only the resolved tier row summary + toggle button.
// Expanded:            shows the full PricingTable + collapse button.
//
// The expanded/collapsed state is intentionally preserved when resolvedTier changes
// (i.e. when the buyer's distance updates) so the buyer's deliberate choice persists.
export function PricingTableToggle({ price, resolvedTier }: PricingTableToggleProps) {
  const [expanded, setExpanded] = useState(false);
  const hasTiers = price.tiers.length > 0;

  // When there's only one tier, there's nothing to toggle — just show the table.
  if (!hasTiers || price.tiers.length === 1) {
    return <PricingTable price={price} resolvedTier={resolvedTier} />;
  }

  return (
    <div className="flex flex-col gap-2">
      {expanded ? (
        <>
          <PricingTable price={price} resolvedTier={resolvedTier} />
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-expanded={true}
            className="self-start text-xs text-foreground/40 underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50"
          >
            Hide pricing tiers ↑
          </button>
        </>
      ) : (
        <>
          {/* Collapsed summary: resolved tier price */}
          <div className="flex items-baseline gap-2">
            {resolvedTier !== null ? (
              <>
                <span className="text-2xl font-bold text-foreground">
                  {price.currency === "USD" ? "$" : price.currency + " "}
                  {resolvedTier.amount.toLocaleString()}
                </span>
                {price.negotiable && (
                  <span className="text-sm text-foreground/50">OBO</span>
                )}
                {resolvedTier.label && (
                  <span className="text-sm text-foreground/40">({resolvedTier.label})</span>
                )}
              </>
            ) : (
              <span className="text-foreground/50">Contact seller for pricing</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-expanded={false}
            className="self-start text-xs text-foreground/40 underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50"
          >
            View all pricing tiers ({price.tiers.length}) ↓
          </button>
        </>
      )}
    </div>
  );
}
