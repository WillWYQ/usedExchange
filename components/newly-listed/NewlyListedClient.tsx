"use client";

import { useState, useEffect, useMemo } from "react";
import type { Item } from "@/lib/content/types";
import { ItemGrid } from "@/components/item/ItemGrid";
import { useT } from "@/components/i18n/useT";

const STORAGE_KEY = "ue_newly_listed_last_visit";
const SESSION_KEY = "ue_newly_listed_session_active";

type Tab = "since-last-visit" | "today" | "this-week";

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function NewlyListedClient({ items }: { items: Item[] }) {
  const t = useT();
  const [activeTab, setActiveTab] = useState<Tab>("since-last-visit");
  const [lastVisit, setLastVisit] = useState<string | null>(null);
  const [isFirstVisit, setIsFirstVisit] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        setIsFirstVisit(true);
      }
      setLastVisit(stored);
      // Only update the last-visit timestamp once per browser session so that
      // navigating to an item detail and back doesn't clear the list.
      if (!sessionStorage.getItem(SESSION_KEY)) {
        localStorage.setItem(STORAGE_KEY, toLocalDateStr(new Date()));
        sessionStorage.setItem(SESSION_KEY, "1");
      }
    } catch {
      // Private browsing or quota — fall back to showing all items
    }
    setMounted(true);
  }, []);

  const { sinceLastVisitItems, todayItems, thisWeekItems } = useMemo(() => {
    const now = new Date();
    const todayStr = toLocalDateStr(now);

    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
    const weekStartStr = toLocalDateStr(weekStart);

    return {
      sinceLastVisitItems: lastVisit
        ? items.filter((i) => i.listedDate >= lastVisit)
        : items,
      todayItems: items.filter((i) => i.listedDate === todayStr),
      thisWeekItems: items.filter((i) => i.listedDate >= weekStartStr),
    };
  }, [items, lastVisit]);

  if (!mounted) return null;

  const tabs: { key: Tab; label: string; count: number }[] = [
    {
      key: "since-last-visit",
      label: t.newlyListedSinceLastVisit,
      count: sinceLastVisitItems.length,
    },
    { key: "today", label: t.newlyListedToday, count: todayItems.length },
    {
      key: "this-week",
      label: t.newlyListedThisWeek,
      count: thisWeekItems.length,
    },
  ];

  const tabItems: Record<Tab, Item[]> = {
    "since-last-visit": sinceLastVisitItems,
    today: todayItems,
    "this-week": thisWeekItems,
  };

  const currentItems = tabItems[activeTab];

  return (
    <div>
      {/* Tab bar */}
      <div
        className="mb-6 flex gap-2 overflow-x-auto pb-1"
        role="tablist"
        aria-label={t.newlyListed}
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.key)}
              className={[
                "shrink-0 whitespace-nowrap rounded-full border px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-foreground/20 text-foreground/60 hover:border-foreground/40 hover:text-foreground",
              ].join(" ")}
            >
              {tab.label} ({tab.count})
            </button>
          );
        })}
      </div>

      {/* First visit notice */}
      {isFirstVisit && activeTab === "since-last-visit" && (
        <p className="mb-4 rounded-lg bg-foreground/5 px-4 py-3 text-sm text-foreground/60">
          {t.newlyListedFirstVisit}
        </p>
      )}

      {/* Content */}
      {currentItems.length > 0 ? (
        <ItemGrid items={currentItems} browseAll />
      ) : (
        <p className="py-16 text-center text-foreground/40">
          {t.newlyListedNoneInPeriod}
        </p>
      )}
    </div>
  );
}
