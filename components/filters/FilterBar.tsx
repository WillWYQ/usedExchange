"use client";

import type { Condition } from "@/lib/content/types";
import type { PriceFilterStrategy } from "@/lib/ui/types";
import type { PriceBucket } from "@/lib/utils/priceFilterStrategies";
import { linearToLog, logToLinear } from "@/lib/utils/priceFilterStrategies";
import { SortSelect } from "./SortSelect";
import type { SortKey } from "./SortSelect";
import { useT } from "@/components/i18n/useT";

// ── PriceRangeSlider ─────────────────────────────────────────────────────────

type SliderProps = {
  bounds: [number, number];
  value: [number, number];
  onChange: (range: [number, number]) => void;
  logarithmic?: boolean;
};

const LOG_STEPS = 10000;

function PriceRangeSlider({
  bounds,
  value,
  onChange,
  logarithmic = false,
}: SliderProps) {
  const [min, max] = bounds;
  const [lo, hi] = value;

  // For logarithmic mode the native input operates on a virtual [0, LOG_STEPS]
  // integer scale; the visual track fractions and displayed values always use
  // real prices.
  const toSlider = (v: number) =>
    logarithmic ? Math.round(linearToLog(v, min, max) * LOG_STEPS) : v;
  const fromSlider = (s: number) =>
    logarithmic ? Math.round(logToLinear(s / LOG_STEPS, min, max)) : s;

  const inputMin = logarithmic ? 0 : min;
  const inputMax = logarithmic ? LOG_STEPS : max;

  const range = max - min || 1;
  const loFrac = logarithmic ? linearToLog(lo, min, max) : (lo - min) / range;
  const hiFrac = logarithmic ? linearToLog(hi, min, max) : (hi - min) / range;

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

      {/* Lo thumb */}
      <input
        type="range"
        min={inputMin}
        max={inputMax}
        step={1}
        value={toSlider(lo)}
        onChange={(e) => {
          const raw = fromSlider(+e.target.value);
          onChange([Math.min(raw, hi - 1), hi]);
        }}
        aria-label="Minimum price"
        className="pointer-events-none absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-foreground [&::-moz-range-track]:opacity-0 [&::-webkit-slider-runnable-track]:h-0 [&::-webkit-slider-runnable-track]:opacity-0 [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:active:cursor-grabbing"
        style={{ zIndex: loZ }}
      />

      {/* Hi thumb */}
      <input
        type="range"
        min={inputMin}
        max={inputMax}
        step={1}
        value={toSlider(hi)}
        onChange={(e) => {
          const raw = fromSlider(+e.target.value);
          onChange([lo, Math.max(raw, lo + 1)]);
        }}
        aria-label="Maximum price"
        className="pointer-events-none absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-foreground [&::-moz-range-track]:opacity-0 [&::-webkit-slider-runnable-track]:h-0 [&::-webkit-slider-runnable-track]:opacity-0 [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:active:cursor-grabbing"
        style={{ zIndex: loZ === 5 ? 4 : 5 }}
      />
    </div>
  );
}

// ── PriceBucketButtons ──────────────────────────────────────────────────────

function PriceBucketButtons({
  buckets,
  allLabel,
  priceRange,
  onSelect,
}: {
  buckets: PriceBucket[];
  allLabel: string;
  priceRange: [number, number] | null;
  onSelect: (range: [number, number] | null) => void;
}) {
  const isAll = priceRange === null;

  return (
    <div
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
      role="group"
      aria-label="Filter by price"
    >
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-pressed={isAll}
        className={[
          "shrink-0 whitespace-nowrap rounded-full border px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50",
          isAll
            ? "border-foreground bg-foreground text-background"
            : "border-foreground/20 text-foreground/60 hover:border-foreground/40 hover:text-foreground",
        ].join(" ")}
      >
        {allLabel}
      </button>
      {buckets.map((b) => {
        const active =
          !isAll && priceRange[0] === b.min && priceRange[1] === b.max;
        return (
          <button
            key={b.label}
            type="button"
            onClick={() => onSelect([b.min, b.max])}
            aria-pressed={active}
            className={[
              "shrink-0 whitespace-nowrap rounded-full border px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50",
              active
                ? "border-foreground bg-foreground text-background"
                : "border-foreground/20 text-foreground/60 hover:border-foreground/40 hover:text-foreground",
            ].join(" ")}
          >
            {b.label}
          </button>
        );
      })}
    </div>
  );
}

// ── FilterBar ────────────────────────────────────────────────────────────────

export type FilterBarProps = {
  availableConditions: Condition[];
  activeConditions: Set<Condition>;
  onToggleCondition: (c: Condition) => void;
  availableCourses: string[];
  activeCourse: string | null;
  onCourseChange: (course: string | null) => void;
  availableTags: string[];
  activeTags: Set<string>;
  onToggleTag: (tag: string) => void;
  priceBounds: [number, number] | null;
  rawPriceBounds: [number, number] | null;
  priceRange: [number, number] | null;
  onPriceRangeChange: (range: [number, number]) => void;
  priceFilterStrategy?: PriceFilterStrategy;
  priceBuckets?: PriceBucket[] | null;
  showSold: boolean;
  onToggleShowSold: () => void;
  sortKey: SortKey;
  onSortKeyChange: (key: SortKey) => void;
};

export function FilterBar({
  availableConditions,
  activeConditions,
  onToggleCondition,
  availableCourses,
  activeCourse,
  onCourseChange,
  availableTags,
  activeTags,
  onToggleTag,
  priceBounds,
  rawPriceBounds,
  priceRange,
  onPriceRangeChange,
  priceFilterStrategy = "none",
  priceBuckets,
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
    priceFilterStrategy !== "preset-buckets" &&
    priceBounds !== null &&
    priceRange !== null &&
    priceBounds[0] !== priceBounds[1];

  const showBuckets =
    priceFilterStrategy === "preset-buckets" &&
    priceBuckets != null &&
    priceBuckets.length > 0;

  // Show edge-inclusion hint when strategy clamps bounds and slider is at edge.
  const showOutlierHint =
    (priceFilterStrategy === "percentile" || priceFilterStrategy === "iqr") &&
    priceBounds !== null &&
    rawPriceBounds !== null &&
    priceRange !== null &&
    (priceBounds[0] !== rawPriceBounds[0] ||
      priceBounds[1] !== rawPriceBounds[1]) &&
    (priceRange[0] === priceBounds[0] || priceRange[1] === priceBounds[1]);

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-foreground/5 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-3">
      {/* Condition chips */}
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

      {/* Course chips (textbooks) — single-select; clicking the active chip clears it */}
      {availableCourses.length > 0 && (
        <div
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
          role="group"
          aria-label={t.filterCourse}
        >
          {availableCourses.map((course) => {
            const active = activeCourse === course;
            return (
              <button
                key={course}
                type="button"
                onClick={() => onCourseChange(active ? null : course)}
                aria-pressed={active}
                className={[
                  "shrink-0 whitespace-nowrap rounded-full border px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-foreground/20 text-foreground/60 hover:border-foreground/40 hover:text-foreground",
                ].join(" ")}
              >
                {course}
              </button>
            );
          })}
        </div>
      )}

      {/* Tag chips — multi-select: an item must match every active tag (AND) */}
      {availableTags.length > 0 && (
        <div
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
          role="group"
          aria-label={t.filterTags}
        >
          {availableTags.map((tag) => {
            const active = activeTags.has(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => onToggleTag(tag)}
                aria-pressed={active}
                className={[
                  "shrink-0 whitespace-nowrap rounded-full border px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-foreground/20 text-foreground/60 hover:border-foreground/40 hover:text-foreground",
                ].join(" ")}
              >
                #{tag}
              </button>
            );
          })}
        </div>
      )}

      {/* Price range slider */}
      {showSlider && (
        <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:min-w-44">
          <div className="flex items-center justify-between text-xs text-foreground/50">
            <span>
              {t.filterPrice}
              {showOutlierHint && (
                <span className="ml-1 text-foreground/40">
                  {t.filterPriceIncludesOutliers}
                </span>
              )}
            </span>
            <span>
              ${priceRange![0].toLocaleString()} – $
              {priceRange![1].toLocaleString()}
            </span>
          </div>
          <PriceRangeSlider
            bounds={priceBounds!}
            value={priceRange!}
            onChange={onPriceRangeChange}
            logarithmic={priceFilterStrategy === "logarithmic"}
          />
        </div>
      )}

      {/* Preset bucket buttons */}
      {showBuckets && (
        <PriceBucketButtons
          buckets={priceBuckets!}
          allLabel={t.filterPriceBucketAll}
          priceRange={priceRange}
          onSelect={(range) => {
            if (range === null && priceBounds) {
              onPriceRangeChange(priceBounds);
            } else if (range) {
              onPriceRangeChange(range);
            }
          }}
        />
      )}

      {/* Show sold toggle + sort */}
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

        <div className="sm:ml-auto">
          <SortSelect value={sortKey} onChange={onSortKeyChange} />
        </div>
      </div>
    </div>
  );
}
