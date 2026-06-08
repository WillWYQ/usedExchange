// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useSearch } from "./useSearch";
import type { SearchIndexEntry } from "@/lib/search/index";

afterEach(cleanup);

const ENTRIES: SearchIndexEntry[] = [
  {
    categorySlug: "electronics",
    itemSlug: "iphone-13",
    name: "iPhone 13",
    brand: "Apple",
    model: "13",
    description: "Lightly used phone",
    tags: [],
    course: "",
    isbn: "",
    edition: "",
  } as unknown as SearchIndexEntry,
];

function mockFetchOnce(entries: SearchIndexEntry[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(entries),
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useSearch debounce race", () => {
  it("returns results even if the index becomes ready while a debounced query is in flight", async () => {
    vi.useFakeTimers();
    mockFetchOnce(ENTRIES);

    const { result } = renderHook(() => useSearch());

    // Query is issued before the index finishes loading.
    act(() => {
      result.current.search("iphone");
    });

    // Index load promise resolves and flips state to "ready" — this happens
    // asynchronously, so flush microtasks under fake timers.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Now let the debounce timer (150ms) fire — it must read the *current*
    // ready state, not the stale "loading" snapshot captured at schedule time.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(result.current.results.length).toBeGreaterThan(0);
    expect(result.current.results[0]?.itemSlug).toBe("iphone-13");
  });

  it("clears the debounce timer on unmount without throwing", async () => {
    vi.useFakeTimers();
    mockFetchOnce(ENTRIES);

    const { result, unmount } = renderHook(() => useSearch());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => {
      result.current.search("iphone");
    });

    unmount();

    expect(() => {
      act(() => {
        vi.advanceTimersByTime(150);
      });
    }).not.toThrow();
  });
});
