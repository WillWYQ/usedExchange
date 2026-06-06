import { describe, it, expect } from "vitest";
import { haversineInMiles } from "./haversine";

describe("haversineInMiles", () => {
  // ── identity ────────────────────────────────────────────────────────────────

  it("returns 0 for identical coordinates", () => {
    expect(haversineInMiles(37.7749, -122.4194, 37.7749, -122.4194)).toBe(0);
  });

  // ── known real-world distances ───────────────────────────────────────────────

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

  // ── symmetry ────────────────────────────────────────────────────────────────

  it("is symmetric (A→B == B→A)", () => {
    const a = haversineInMiles(37.7749, -122.4194, 34.0522, -118.2437);
    const b = haversineInMiles(34.0522, -118.2437, 37.7749, -122.4194);
    expect(Math.abs(a - b)).toBeLessThan(0.0001);
  });

  // ── short distances ──────────────────────────────────────────────────────────

  it("nearby points (< 1 mile)", () => {
    // ~0.5 mile offset
    const dist = haversineInMiles(37.7749, -122.4194, 37.7821, -122.4194);
    expect(dist).toBeGreaterThan(0);
    expect(dist).toBeLessThan(1);
  });

  // ── extreme / boundary distances ─────────────────────────────────────────────

  it("antipodal points on the equator span half the Earth's circumference (~12,437 mi)", () => {
    // (0°N, 0°E) to (0°N, 180°E): exactly half the equatorial circumference
    const dist = haversineInMiles(0, 0, 0, 180);
    expect(dist).toBeGreaterThan(12_000);
    expect(dist).toBeLessThan(13_000);
  });

  it("North Pole to South Pole spans the same half-circumference (~12,437 mi)", () => {
    const dist = haversineInMiles(90, 0, -90, 0);
    expect(dist).toBeGreaterThan(12_000);
    expect(dist).toBeLessThan(13_000);
  });

  it("antipodal distance equals North-to-South-Pole distance (all are half-circumference)", () => {
    const equatorial = haversineInMiles(0, 0, 0, 180);
    const polar = haversineInMiles(90, 0, -90, 0);
    // Both are half the great-circle circumference; should agree within rounding
    expect(Math.abs(equatorial - polar)).toBeLessThan(1);
  });
});
