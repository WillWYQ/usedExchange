import type { SiteConfig } from "@/lib/config/types";
import type { Dimensions, Weight } from "@/lib/content/types";

export type MeasurementUnit = "metric" | "imperial";

const CM_PER_IN = 2.54;
const KG_PER_LB = 0.45359237;

// No "use client" — importable by both server and client components.

export function convertLength(value: number, from: "cm" | "in", to: "cm" | "in"): number {
  if (from === to) return value;
  return from === "in" ? value * CM_PER_IN : value / CM_PER_IN;
}

export function convertWeight(value: number, from: "kg" | "lb", to: "kg" | "lb"): number {
  if (from === to) return value;
  return from === "lb" ? value * KG_PER_LB : value / KG_PER_LB;
}

// Resolves the display unit system for a locale: per-locale override
// (i18n.localeMeasurementUnits) falls back to the site-wide measurementUnit.
export function resolveMeasurementUnit(locale: string, config: SiteConfig): MeasurementUnit {
  return config.i18n.localeMeasurementUnits?.[locale] ?? config.measurementUnit ?? "metric";
}

// Rounds to 2 decimals, trimming trailing zeros (e.g. 12.50 -> 12.5, 12.00 -> 12).
function roundForDisplay(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatDimensions(dimensions: Dimensions, targetSystem: MeasurementUnit): string {
  const targetUnit = targetSystem === "imperial" ? "in" : "cm";
  const { length, width, height, unit } = dimensions;
  const convert = (value: number) => roundForDisplay(convertLength(value, unit, targetUnit));
  return `${convert(length)} × ${convert(width)} × ${convert(height)} ${targetUnit}`;
}

export function formatWeight(weight: Weight, targetSystem: MeasurementUnit): string {
  const targetUnit = targetSystem === "imperial" ? "lb" : "kg";
  return `${roundForDisplay(convertWeight(weight.value, weight.unit, targetUnit))} ${targetUnit}`;
}
