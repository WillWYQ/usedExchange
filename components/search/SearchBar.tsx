"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { siteConfig } from "@/content/config";
import { useSearch } from "./useSearch";

// Loaded via next/dynamic({ ssr: false }) from SiteHeader — no SSR bundle cost.
export function SearchBar() {
  const { query, search, results } = useSearch();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const placeholder = siteConfig.search.placeholder || "Search items…";

  // Close dropdown on outside click
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    search(e.target.value);
    setOpen(true);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  function navigate(categorySlug: string, itemSlug: string) {
    setOpen(false);
    router.push(`/${categorySlug}/${itemSlug}`);
  }

  const showDropdown = open && query.length > 0;

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="search"
        value={query}
        placeholder={placeholder}
        onChange={handleChange}
        onFocus={() => query && setOpen(true)}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-label="Search items"
        aria-expanded={showDropdown}
        aria-controls="search-results"
        aria-autocomplete="list"
        autoComplete="off"
        className="w-full rounded-full border border-foreground/20 bg-foreground/5 px-3 py-2.5 text-base text-foreground placeholder-foreground/40 outline-none transition-all focus:border-foreground/40 focus:bg-foreground/10 focus-visible:ring-1 focus-visible:ring-foreground/50 md:w-48 md:py-1 md:text-sm md:focus:w-64"
      />

      {showDropdown && (
        <ul
          id="search-results"
          role="listbox"
          aria-label="Search results"
          className="absolute right-0 top-full z-50 mt-1 w-full overflow-hidden rounded-xl border border-foreground/10 bg-background/95 shadow-2xl backdrop-blur-md sm:w-72"
        >
          {results.length === 0 ? (
            <li className="px-4 py-3 text-sm text-foreground/40">No results found</li>
          ) : (
            results.map((item) => (
              <li key={`${item.categorySlug}/${item.itemSlug}`} role="option" aria-selected={false}>
                <button
                  onClick={() => navigate(item.categorySlug, item.itemSlug)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-foreground/10 focus-visible:bg-foreground/10 focus-visible:outline-none"
                >
                  {/* Cover image thumbnail */}
                  {item.coverImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.coverImage}
                      alt=""
                      aria-hidden="true"
                      className="h-10 w-10 flex-shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-foreground/5 text-lg">
                      📦
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                    <p className="truncate text-xs text-foreground/40 capitalize">
                      {item.categorySlug.replace(/-/g, " ")}
                      {item.brand ? ` · ${item.brand}` : ""}
                    </p>
                  </div>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
