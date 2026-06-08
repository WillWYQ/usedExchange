"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AdaptiveImage } from "@/components/common/AdaptiveImage";

const STORAGE_KEY = "ue_recently_viewed";
const MAX_ITEMS = 5;

type ViewedEntry = {
  slug: string;        // "{categorySlug}/{itemSlug}" — used to build the href
  name: string;
  coverImage: string | null;
};

type RecentlyViewedProps = {
  // When set, the component records this item in sessionStorage on mount.
  // Used by the item detail page (Phase 9). Format: "{categorySlug}/{itemSlug}".
  itemSlug?: string;
  itemName?: string;
  itemCoverImage?: string | null;
};

function readEntries(): ViewedEntry[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ViewedEntry[]) : [];
  } catch {
    return [];
  }
}

function saveEntries(entries: ViewedEntry[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Quota exceeded or private-mode restriction — fail silently.
  }
}

export function RecentlyViewed({ itemSlug, itemName, itemCoverImage }: RecentlyViewedProps) {
  const [entries, setEntries] = useState<ViewedEntry[]>([]);

  useEffect(() => {
    const existing = readEntries();

    if (itemSlug && itemName !== undefined) {
      // Record the current item, deduplicate, cap at MAX_ITEMS.
      const newEntry: ViewedEntry = {
        slug: itemSlug,
        name: itemName,
        coverImage: itemCoverImage ?? null,
      };
      const updated = [
        newEntry,
        ...existing.filter((e) => e.slug !== itemSlug),
      ].slice(0, MAX_ITEMS);
      saveEntries(updated);
      // Omit the current item from the strip shown on its own detail page.
      setEntries(updated.filter((e) => e.slug !== itemSlug));
    } else {
      setEntries(existing);
    }
    // itemSlug / itemName are stable per page render; exhaustive deps would re-run unnecessarily.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (entries.length === 0) return null;

  return (
    <section aria-labelledby="recently-viewed-heading" className="mt-10">
      <h2
        id="recently-viewed-heading"
        className="mb-3 text-xs font-medium uppercase tracking-widest text-foreground/40"
      >
        Recently Viewed
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {entries.map((entry) => {
          const parts = entry.slug.split("/");
          const catSlug = parts[0] ?? "";
          const itSlug = parts[1] ?? "";
          return (
            <Link
              key={entry.slug}
              href={`/${catSlug}/${itSlug}`}
              className="group shrink-0 focus-visible:outline-none"
              aria-label={entry.name}
            >
              <div className="relative h-20 w-20 overflow-hidden rounded-lg bg-foreground/5 ring-1 ring-foreground/10 transition-all group-hover:ring-foreground/30 group-focus-visible:ring-2 group-focus-visible:ring-foreground">
                {entry.coverImage ? (
                  <AdaptiveImage
                    src={entry.coverImage}
                    alt={entry.name}
                    fill
                    className="object-cover"
                    sizes="80px"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xl text-foreground/20">
                    📦
                  </div>
                )}
              </div>
              <p className="mt-1 w-20 truncate text-xs text-foreground/50 transition-colors group-hover:text-foreground/80">
                {entry.name}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
