import { describe, it, expect } from "vitest";
import { haversineInMiles } from "./haversine";

describe("haversineInMiles", () => {
  it("returns 0 for identical coordinates", () => {
    expect(haversineInMiles(37.7749, -122.4194, 37.7749, -122.4194)).toBe(0);
  });

  it("San Francisco → Los Angeles ≈ 347 miles", () => {
    const dist = haversineInMiles(37.7749, -122.4194, 34.0522, -118.2437);
    expect(dist).toBeGreaterThan(340);
    expect(dist).toBeLessThan(360);
  });

  it("New York → Los Angeles ≈ 2445 miles", () => {
    const dist = haversineInMiles(40.7128, -74.006, 34.0522, -118.2437);
    expect(dist).toBeGreaterThan(2400);
    expect(dist).toBeLessThan(2500);
  });

  it("is symmetric", () => {
    const a = haversineInMiles(37.7749, -122.4194, 34.0522, -118.2437);
    const b = haversineInMiles(34.0522, -118.2437, 37.7749, -122.4194);
    expect(Math.abs(a - b)).toBeLessThan(0.0001);
  });

  it("nearby points (< 1 mile)", () => {
    // ~0.5 mile offset
    const dist = haversineInMiles(37.7749, -122.4194, 37.7821, -122.4194);
    expect(dist).toBeGreaterThan(0);
    expect(dist).toBeLessThan(1);
  });
});
