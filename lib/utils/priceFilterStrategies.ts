import type { PriceFilterStrategy } from "@/lib/ui/types";

export type PriceFilterConfig = {
  strategy: PriceFilterStrategy;
  customBuckets?: number[];
};

export type PriceBoundsResult = {
  sliderBounds: [number, number];
  rawBounds: [number, number];
};

export type PriceBucket = {
  label: string;
  min: number;
  max: number;
};

// ── Bounds computation ──────────────────────────────────────────────────────

export function computePriceBounds(
  amounts: number[],
  config: PriceFilterConfig,
): PriceBoundsResult | null {
  if (amounts.length === 0) return null;

  const sorted = [...amounts].sort((a, b) => a - b);
  const rawMin = sorted[0]!;
  const rawMax = sorted[sorted.length - 1]!;
  const rawBounds: [number, number] = [rawMin, rawMax];

  switch (config.strategy) {
    case "percentile":
      return percentileBounds(sorted, rawBounds);
    case "iqr":
      return iqrBounds(sorted, rawBounds);
    case "logarithmic":
    case "preset-buckets":
    case "none":
    default:
      return { sliderBounds: rawBounds, rawBounds };
  }
}

function percentileBounds(
  sorted: number[],
  rawBounds: [number, number],
): PriceBoundsResult {
  if (sorted.length < 4) return { sliderBounds: rawBounds, rawBounds };

  const p5 = percentile(sorted, 0.05);
  const p95 = percentile(sorted, 0.95);

  if (p5 >= p95) return { sliderBounds: rawBounds, rawBounds };
  return { sliderBounds: [p5, p95], rawBounds };
}

function iqrBounds(
  sorted: number[],
  rawBounds: [number, number],
): PriceBoundsResult {
  if (sorted.length < 5) return { sliderBounds: rawBounds, rawBounds };

  const q1 = percentile(sorted, 0.25);
  const q3 = percentile(sorted, 0.75);
  const iqr = q3 - q1;

  if (iqr === 0) return { sliderBounds: rawBounds, rawBounds };

  const lowerFence = Math.max(q1 - 1.5 * iqr, rawBounds[0]);
  const upperFence = Math.min(q3 + 1.5 * iqr, rawBounds[1]);

  if (lowerFence >= upperFence) return { sliderBounds: rawBounds, rawBounds };
  return { sliderBounds: [lowerFence, upperFence], rawBounds };
}

// Linear interpolation percentile (same method as Excel PERCENTILE.INC).
function percentile(sorted: number[], p: number): number {
  const n = sorted.length;
  const k = p * (n - 1);
  const f = Math.floor(k);
  const c = Math.ceil(k);
  if (f === c) return sorted[f]!;
  return sorted[f]! + (sorted[c]! - sorted[f]!) * (k - f);
}

// ── Logarithmic mapping ────────────────────────────────────────────────────

export function linearToLog(value: number, min: number, max: number): number {
  if (min === max) return 0;
  return Math.log(value - min + 1) / Math.log(max - min + 1);
}

export function logToLinear(
  fraction: number,
  min: number,
  max: number,
): number {
  if (min === max) return min;
  return Math.pow(max - min + 1, fraction) + min - 1;
}

// ── Preset buckets ─────────────────────────────────────────────────────────

export function computePriceBuckets(
  amounts: number[],
  currency: string,
  customBoundaries?: number[],
): PriceBucket[] {
  if (amounts.length === 0) return [];

  const sorted = [...amounts].sort((a, b) => a - b);
  const dataMin = sorted[0]!;
  const dataMax = sorted[sorted.length - 1]!;

  const boundaries = customBoundaries
    ? [...customBoundaries].sort((a, b) => a - b)
    : autoBoundaries(dataMin, dataMax);

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);

  const buckets: PriceBucket[] = [];

  // First bucket: [0, boundaries[0])
  if (boundaries.length > 0 && boundaries[0]! > dataMin) {
    buckets.push({
      label: `< ${fmt(boundaries[0]!)}`,
      min: 0,
      max: boundaries[0]! - 1,
    });
  }

  // Middle buckets
  for (let i = 0; i < boundaries.length - 1; i++) {
    buckets.push({
      label: `${fmt(boundaries[i]!)} – ${fmt(boundaries[i + 1]!)}`,
      min: boundaries[i]!,
      max: boundaries[i + 1]! - 1,
    });
  }

  // Last bucket: [last boundary, Infinity)
  if (boundaries.length > 0) {
    const last = boundaries[boundaries.length - 1]!;
    buckets.push({
      label: `${fmt(last)}+`,
      min: last,
      max: Infinity,
    });
  }

  return buckets;
}

function autoBoundaries(dataMin: number, dataMax: number): number[] {
  const range = dataMax - dataMin;
  if (range === 0) return [];

  // Pick a "nice" step size that yields 3-5 buckets.
  const niceSteps = [5, 10, 25, 50, 100, 250, 500, 1000];
  let step = niceSteps[0]!;
  for (const s of niceSteps) {
    if (range / s >= 2 && range / s <= 6) {
      step = s;
      break;
    }
  }

  const start = Math.ceil(dataMin / step) * step;
  const boundaries: number[] = [];
  for (let b = start; b < dataMax; b += step) {
    if (b > dataMin) boundaries.push(b);
  }

  // Ensure at least 2 boundaries for meaningful buckets.
  if (boundaries.length < 2) {
    const mid = Math.round((dataMin + dataMax) / 2);
    return [mid];
  }

  return boundaries;
}
