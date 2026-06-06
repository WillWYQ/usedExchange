"use client";

import type { Condition } from "@/lib/content/types";
import { SortSelect } from "./SortSelect";
import type { SortKey } from "./SortSelect";

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
    <div className="relative flex h-6 w-full items-center">
      {/* Custom track */}
      <div className="pointer-events-none absolute inset-x-0 h-1.5 rounded-full bg-white/15">
        <div
          className="absolute h-full rounded-full bg-white/60"
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
        className="pointer-events-none absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-moz-range-track]:opacity-0 [&::-webkit-slider-runnable-track]:h-0 [&::-webkit-slider-runnable-track]:opacity-0 [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:active:cursor-grabbing"
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
        className="pointer-events-none absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-moz-range-track]:opacity-0 [&::-webkit-slider-runnable-track]:h-0 [&::-webkit-slider-runnable-track]:opacity-0 [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:active:cursor-grabbing"
        style={{ zIndex: loZ === 5 ? 4 : 5 }}
      />
    </div>
  );
}

// ── FilterBar ────────────────────────────────────────────────────────────────
// Controlled component — all state lives in the caller (typically ItemGrid via
// useFilters). Pass the return value of useFilters spread into these props.

const CONDITION_LABELS: Record<Condition, string> = {
  new: "New",
  "like-new": "Like New",
  good: "Good",
  fair: "Fair",
  "for-parts": "For Parts",
};

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
  const showSlider =
    priceBounds !== null &&
    priceRange !== null &&
    priceBounds[0] !== priceBounds[1];

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl bg-white/5 px-4 py-3">
      {/* Condition chips */}
      {availableConditions.length > 0 && (
        <div
          className="flex flex-wrap gap-2"
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
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
                  active
                    ? "border-white bg-white text-black"
                    : "border-white/20 text-white/60 hover:border-white/40 hover:text-white",
                ].join(" ")}
              >
                {CONDITION_LABELS[c]}
              </button>
            );
          })}
        </div>
      )}

      {/* Price range slider — hidden when no items have tiers or all same price */}
      {showSlider && (
        <div className="flex min-w-44 flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs text-white/50">
            <span>Price</span>
            <span>
              ${priceRange![0]} – ${priceRange![1]}
            </span>
          </div>
          <PriceRangeSlider
            bounds={priceBounds!}
            value={priceRange!}
            onChange={onPriceRangeChange}
          />
        </div>
      )}

      {/* Show sold toggle */}
      <label className="flex cursor-pointer items-center gap-2 text-sm text-white/60 hover:text-white">
        <input
          type="checkbox"
          checked={showSold}
          onChange={onToggleShowSold}
          className="h-4 w-4 cursor-pointer rounded accent-white focus-visible:ring-2 focus-visible:ring-white/50"
        />
        Show sold
      </label>

      {/* Sort — pushed to far right */}
      <div className="ml-auto">
        <SortSelect value={sortKey} onChange={onSortKeyChange} />
      </div>
    </div>
  );
}
