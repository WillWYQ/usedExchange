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
        className="w-40 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-sm text-white placeholder-white/40 outline-none transition-all focus:w-56 focus:border-white/40 focus:bg-white/10 focus-visible:ring-1 focus-visible:ring-white/50 sm:w-48 sm:focus:w-64"
      />

      {showDropdown && (
        <ul
          id="search-results"
          role="listbox"
          aria-label="Search results"
          className="absolute right-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-xl border border-white/10 bg-black/95 shadow-2xl backdrop-blur-md"
        >
          {results.length === 0 ? (
            <li className="px-4 py-3 text-sm text-white/40">No results found</li>
          ) : (
            results.map((item) => (
              <li key={`${item.categorySlug}/${item.itemSlug}`} role="option" aria-selected={false}>
                <button
                  onClick={() => navigate(item.categorySlug, item.itemSlug)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
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
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white/5 text-lg">
                      📦
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{item.name}</p>
                    <p className="truncate text-xs text-white/40 capitalize">
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
