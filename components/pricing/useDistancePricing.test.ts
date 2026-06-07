// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useDistancePricing } from "./useDistancePricing";
import type { GeolocationState } from "@/lib/content/types";

// Vitest doesn't auto-register RTL's cleanup without `test.globals: true`;
// renderHook mounts to the DOM, so without this, hooks from prior tests
// keep their effects/timers attached across tests in this file.
afterEach(cleanup);

const SELLER = { lat: 40.7128, lng: -74.006 }; // New York City Hall

// Hoisted to module scope so each renders with a STABLE object reference.
// useDistancePricing's effect depends on `geoState` by reference; an inline
// `{ status: "idle" }` literal inside the renderHook callback would be
// re-created on every render, re-triggering the effect → setResolved →
// re-render → new literal → infinite loop (observed as an OOM crash).
// In real usage geoState comes from useGeolocation()'s useState, which keeps
// a stable reference across renders that don't change status.
const IDLE: GeolocationState = { status: "idle" };
const PENDING: GeolocationState = { status: "pending" };
const DENIED: GeolocationState = { status: "denied" };
const UNAVAILABLE: GeolocationState = { status: "unavailable" };
const GRANTED_NEARBY: GeolocationState = { status: "granted", lat: 40.758, lng: -73.9855 }; // Times Square ≈ 3.3 mi
const GRANTED_FAR: GeolocationState = { status: "granted", lat: 34.0522, lng: -118.2437 }; // LA

describe("useDistancePricing", () => {
  it("starts at fallback before geolocation resolves", () => {
    const { result } = renderHook(() => useDistancePricing(SELLER, IDLE));
    expect(result.current.resolved).toEqual({ source: "fallback" });
  });

  it("stays at fallback while pending", () => {
    const { result } = renderHook(() => useDistancePricing(SELLER, PENDING));
    expect(result.current.resolved).toEqual({ source: "fallback" });
  });

  it("resolves to a detected distance once geo is granted", () => {
    const { result } = renderHook(() => useDistancePricing(SELLER, GRANTED_NEARBY));

    expect(result.current.resolved.source).toBe("detected");
    if (result.current.resolved.source === "detected") {
      expect(result.current.resolved.miles).toBeGreaterThan(2);
      expect(result.current.resolved.miles).toBeLessThan(5);
    }
  });

  it("denied geo resolves to fallback", () => {
    const { result } = renderHook(() => useDistancePricing(SELLER, DENIED));
    expect(result.current.resolved).toEqual({ source: "fallback" });
  });

  it("unavailable geo resolves to fallback", () => {
    const { result } = renderHook(() => useDistancePricing(SELLER, UNAVAILABLE));
    expect(result.current.resolved).toEqual({ source: "fallback" });
  });

  it("manual override takes precedence over a granted detected position", () => {
    const { result } = renderHook(() => useDistancePricing(SELLER, GRANTED_FAR));

    act(() => result.current.setManualMiles(10));
    expect(result.current.resolved).toEqual({ source: "manual", miles: 10 });
  });

  it("manual override of exactly 0 miles is valid (pickup rate)", () => {
    const { result } = renderHook(() => useDistancePricing(SELLER, DENIED));
    act(() => result.current.setManualMiles(0));
    expect(result.current.resolved).toEqual({ source: "manual", miles: 0 });
  });

  it("clearing the manual override (null) reverts to detected", () => {
    const { result } = renderHook(() => useDistancePricing(SELLER, GRANTED_NEARBY));

    act(() => result.current.setManualMiles(99));
    expect(result.current.resolved).toEqual({ source: "manual", miles: 99 });

    act(() => result.current.setManualMiles(null));
    expect(result.current.resolved.source).toBe("detected");
  });

  it("clearing the manual override reverts to fallback when geo was never granted", () => {
    const { result } = renderHook(() => useDistancePricing(SELLER, DENIED));

    act(() => result.current.setManualMiles(20));
    act(() => result.current.setManualMiles(null));
    expect(result.current.resolved).toEqual({ source: "fallback" });
  });

  it("re-resolves when geoState transitions from pending to granted", () => {
    const initialProps: { geo: GeolocationState } = { geo: PENDING };
    const { result, rerender } = renderHook(
      ({ geo }: { geo: GeolocationState }) => useDistancePricing(SELLER, geo),
      { initialProps },
    );
    expect(result.current.resolved).toEqual({ source: "fallback" });

    rerender({ geo: GRANTED_NEARBY });
    expect(result.current.resolved.source).toBe("detected");
  });
});
