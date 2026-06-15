import { describe, it, expect } from "vitest";
import {
  convertLength,
  convertWeight,
  formatDimensions,
  formatWeight,
  resolveMeasurementUnit,
} from "./units";
import type { SiteConfig } from "@/lib/config/types";
import type { Dimensions, Weight } from "@/lib/content/types";

describe("convertLength", () => {
  it("returns the same value when units match", () => {
    expect(convertLength(10, "cm", "cm")).toBe(10);
    expect(convertLength(10, "in", "in")).toBe(10);
  });

  it("converts in -> cm and cm -> in", () => {
    expect(convertLength(1, "in", "cm")).toBeCloseTo(2.54, 5);
    expect(convertLength(2.54, "cm", "in")).toBeCloseTo(1, 5);
  });
});

describe("convertWeight", () => {
  it("returns the same value when units match", () => {
    expect(convertWeight(5, "kg", "kg")).toBe(5);
    expect(convertWeight(5, "lb", "lb")).toBe(5);
  });

  it("converts lb -> kg and kg -> lb", () => {
    expect(convertWeight(1, "lb", "kg")).toBeCloseTo(0.45359237, 5);
    expect(convertWeight(0.45359237, "kg", "lb")).toBeCloseTo(1, 5);
  });
});

function config(
  measurementUnit: "metric" | "imperial",
  localeMeasurementUnits?: Partial<Record<string, "metric" | "imperial">>,
): SiteConfig {
  return {
    measurementUnit,
    i18n: {
      defaultLocale: "en",
      availableLocales: ["en"],
      showLocaleSwitcher: false,
      translations: {},
      localeMeasurementUnits,
    },
  } as unknown as SiteConfig;
}

describe("resolveMeasurementUnit", () => {
  it("falls back to the global measurementUnit when no per-locale override exists", () => {
    expect(resolveMeasurementUnit("en", config("metric"))).toBe("metric");
    expect(resolveMeasurementUnit("zh", config("imperial"))).toBe("imperial");
  });

  it("uses the per-locale override when present", () => {
    const c = config("metric", { en: "imperial" });
    expect(resolveMeasurementUnit("en", c)).toBe("imperial");
    expect(resolveMeasurementUnit("zh", c)).toBe("metric");
  });
});

describe("formatDimensions", () => {
  const dims: Dimensions = { length: 10, width: 5, height: 2, unit: "cm" };

  it("renders the stored unit unchanged when it matches the target system", () => {
    expect(formatDimensions(dims, "metric")).toBe("10 × 5 × 2 cm");
  });

  it("converts to the target system and rounds to 2 decimals", () => {
    expect(formatDimensions(dims, "imperial")).toBe("3.94 × 1.97 × 0.79 in");
  });
});

describe("formatWeight", () => {
  const weight: Weight = { value: 2, unit: "kg" };

  it("renders the stored unit unchanged when it matches the target system", () => {
    expect(formatWeight(weight, "metric")).toBe("2 kg");
  });

  it("converts to the target system and rounds to 2 decimals", () => {
    expect(formatWeight(weight, "imperial")).toBe("4.41 lb");
  });
});
