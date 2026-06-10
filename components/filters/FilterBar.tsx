"use client";

import type { Condition } from "@/lib/content/types";
import { SortSelect } from "./SortSelect";
import type { SortKey } from "./SortSelect";
import { useT } from "@/components/i18n/useT";

// ── PriceRangeSlider ─────────────────────────────────────────────────────────
// Dual-thumb range slider using two overlapping <input type="range"> elements.
// The native tracks are hidden; a custom track + highlight div is rendered beneath.
// Only the thumbs are pointer-interactive (pointer-events-none on input, auto on thumb).

type SliderProps = {
  bounds: [number, number];
  value: [number, number];
  onChange: (range: [number, number]) => void;
};

function PriceRangeSlider({ bounds, value, onChange }: SliderProps) {
  const [min, max] = bounds;
  const [lo, hi] = value;
  const range = max - min || 1; // guard div-by-zero
  const loFrac = (lo - min) / range;
  const hiFrac = (hi - min) / range;

  // When lo is in the upper half, bring the lo input on top so the lo thumb
  // stays grabbable when the two thumbs are close together.
  const loZ = lo > (min + max) / 2 ? 5 : 4;

  return (
    <div className="relative flex h-8 w-full items-center">
      {/* Custom track */}
      <div className="pointer-events-none absolute inset-x-0 h-1.5 rounded-full bg-foreground/15">
        <div
          className="absolute h-full rounded-full bg-foreground/60"
          style={{
            left: `${loFrac * 100}%`,
            right: `${(1 - hiFrac) * 100}%`,
          }}
        />
      </div>

      {/* Lo thumb — pointer-events on thumb only, not on track */}
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={lo}
        onChange={(e) => onChange([Math.min(+e.target.value, hi - 1), hi])}
        aria-label="Minimum price"
        className="pointer-events-none absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-foreground [&::-moz-range-track]:opacity-0 [&::-webkit-slider-runnable-track]:h-0 [&::-webkit-slider-runnable-track]:opacity-0 [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:active:cursor-grabbing"
        style={{ zIndex: loZ }}
      />

      {/* Hi thumb */}
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={hi}
        onChange={(e) => onChange([lo, Math.max(+e.target.value, lo + 1)])}
        aria-label="Maximum price"
        className="pointer-events-none absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-foreground [&::-moz-range-track]:opacity-0 [&::-webkit-slider-runnable-track]:h-0 [&::-webkit-slider-runnable-track]:opacity-0 [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:active:cursor-grabbing"
        style={{ zIndex: loZ === 5 ? 4 : 5 }}
      />
    </div>
  );
}

// ── FilterBar ────────────────────────────────────────────────────────────────
// Controlled component — all state lives in the caller (typically ItemGrid via
// useFilters). Pass the return value of useFilters spread into these props.

export type FilterBarProps = {
  availableConditions: Condition[];
  activeConditions: Set<Condition>;
  onToggleCondition: (c: Condition) => void;
  priceBounds: [number, number] | null;
  priceRange: [number, number] | null;
  onPriceRangeChange: (range: [number, number]) => void;
  showSold: boolean;
  onToggleShowSold: () => void;
  sortKey: SortKey;
  onSortKeyChange: (key: SortKey) => void;
};

export function FilterBar({
  availableConditions,
  activeConditions,
  onToggleCondition,
  priceBounds,
  priceRange,
  onPriceRangeChange,
  showSold,
  onToggleShowSold,
  sortKey,
  onSortKeyChange,
}: FilterBarProps) {
  const t = useT();
  const conditionLabels: Record<Condition, string> = {
    new: t.conditionNew,
    "like-new": t.conditionLikeNew,
    good: t.conditionGood,
    fair: t.conditionFair,
    "for-parts": t.conditionForParts,
  };
  const showSlider =
    priceBounds !== null &&
    priceRange !== null &&
    priceBounds[0] !== priceBounds[1];

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-foreground/5 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-3">
      {/* Condition chips — horizontally scrollable on mobile, wraps on larger screens */}
      {availableConditions.length > 0 && (
        <div
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
          role="group"
          aria-label="Filter by condition"
        >
          {availableConditions.map((c) => {
            const active = activeConditions.has(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => onToggleCondition(c)}
                aria-pressed={active}
                className={[
                  "shrink-0 whitespace-nowrap rounded-full border px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-foreground/20 text-foreground/60 hover:border-foreground/40 hover:text-foreground",
                ].join(" ")}
              >
                {conditionLabels[c]}
              </button>
            );
          })}
        </div>
      )}

      {/* Price range slider — hidden when no items have tiers or all same price */}
      {showSlider && (
        <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:min-w-44">
          <div className="flex items-center justify-between text-xs text-foreground/50">
            <span>{t.filterPrice}</span>
            <span>
              ${priceRange![0].toLocaleString()} – ${priceRange![1].toLocaleString()}
            </span>
          </div>
          <PriceRangeSlider
            bounds={priceBounds!}
            value={priceRange!}
            onChange={onPriceRangeChange}
          />
        </div>
      )}

      {/* Show sold toggle + sort — side by side on mobile, dissolve into the row on larger screens */}
      <div className="flex items-center justify-between gap-4 sm:contents">
        <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-foreground/60 hover:text-foreground">
          <input
            type="checkbox"
            checked={showSold}
            onChange={onToggleShowSold}
            className="h-5 w-5 cursor-pointer rounded accent-foreground focus-visible:ring-2 focus-visible:ring-foreground/50"
          />
          {t.filterShowSold}
        </label>

        {/* Sort — pushed to far right on larger screens */}
        <div className="sm:ml-auto">
          <SortSelect value={sortKey} onChange={onSortKeyChange} />
        </div>
      </div>
    </div>
  );
}
