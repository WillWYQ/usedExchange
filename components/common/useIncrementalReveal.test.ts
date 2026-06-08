// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useIncrementalReveal } from "./useIncrementalReveal";

afterEach(cleanup);

// jsdom has no IntersectionObserver — stub one that records its callback so
// tests can fire intersection events manually, and exposes disconnect() calls
// so we can assert the hook re-attaches on sentinel remount.
type Callback = (entries: { isIntersecting: boolean }[]) => void;
let callbacks: Callback[] = [];
let disconnectCount = 0;

beforeEach(() => {
  callbacks = [];
  disconnectCount = 0;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: Callback) {
        callbacks.push(cb);
      }
      observe() {}
      disconnect() {
        disconnectCount += 1;
      }
    },
  );
});

function intersectAll() {
  for (const cb of callbacks) cb([{ isIntersecting: true }]);
}

const ITEMS = Array.from({ length: 60 }, (_, i) => i);

describe("useIncrementalReveal", () => {
  it("reveals only the first batch initially", () => {
    const { result } = renderHook(() => useIncrementalReveal(ITEMS, 24));
    expect(result.current.visibleItems).toEqual(ITEMS.slice(0, 24));
    expect(result.current.hasMore).toBe(true);
  });

  it("reveals the next batch when the sentinel intersects", () => {
    const { result } = renderHook(() => useIncrementalReveal(ITEMS, 24));
    act(() => result.current.sentinelRef(document.createElement("div")));

    act(() => intersectAll());
    expect(result.current.visibleItems).toEqual(ITEMS.slice(0, 48));
    expect(result.current.hasMore).toBe(true);
  });

  it("stops reporting hasMore once everything is revealed", () => {
    const { result } = renderHook(() => useIncrementalReveal(ITEMS, 24));
    act(() => result.current.sentinelRef(document.createElement("div")));

    act(() => intersectAll());
    act(() => intersectAll());
    expect(result.current.visibleItems).toEqual(ITEMS);
    expect(result.current.hasMore).toBe(false);
  });

  it("resets to the first batch when the source set changes", () => {
    const { result, rerender } = renderHook(
      ({ items }) => useIncrementalReveal(items, 24),
      { initialProps: { items: ITEMS } },
    );
    act(() => result.current.sentinelRef(document.createElement("div")));
    act(() => intersectAll());
    expect(result.current.visibleItems.length).toBe(48);

    const filtered = ITEMS.slice(0, 10);
    rerender({ items: filtered });
    expect(result.current.visibleItems).toEqual(filtered);
    expect(result.current.hasMore).toBe(false);
  });

  it("disconnects the previous observer when the sentinel remounts", () => {
    const { result } = renderHook(() => useIncrementalReveal(ITEMS, 24));
    const a = document.createElement("div");
    const b = document.createElement("div");

    act(() => result.current.sentinelRef(a));
    act(() => result.current.sentinelRef(b));
    expect(disconnectCount).toBeGreaterThanOrEqual(1);

    act(() => result.current.sentinelRef(null));
    expect(disconnectCount).toBeGreaterThanOrEqual(2);
  });
});
