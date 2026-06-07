"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Fuse from "fuse.js";
import type { SearchIndexEntry } from "@/lib/search/index";

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; fuse: Fuse<SearchIndexEntry> }
  | { status: "error" };

export type SearchResult = SearchIndexEntry & { score: number };

export function useSearch() {
  const [searchState, setSearchState] = useState<SearchState>({ status: "idle" });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the index once on mount — graceful if the file is absent (e.g. pnpm dev
  // without a prior build) per TECH_REQUIREMENTS.md §22.1.
  useEffect(() => {
    setSearchState({ status: "loading" });

    fetch("/search-index.json")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<SearchIndexEntry[]>;
      })
      .then((entries) => {
        const fuse = new Fuse(entries, {
          keys: ["name", "brand", "model", "description", "tags", "course", "isbn", "edition"],
          threshold: 0.3,
          includeScore: true,
          ignoreLocation: true,
        });
        setSearchState({ status: "ready", fuse });
      })
      .catch(() => {
        // 404 or parse error → treat as empty index, no crash
        setSearchState({ status: "error" });
      });
  }, []);

  const search = useCallback(
    (q: string) => {
      setQuery(q);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (!q.trim()) {
        setResults([]);
        return;
      }

      debounceRef.current = setTimeout(() => {
        if (searchState.status !== "ready") return;
        const raw = searchState.fuse.search(q, { limit: 8 });
        setResults(
          raw.map((r) => ({ ...r.item, score: r.score ?? 1 })),
        );
      }, 150);
    },
    [searchState],
  );

  return { query, search, results, ready: searchState.status === "ready" };
}
