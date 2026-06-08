// ⚠️ DO NOT EDIT — auto-wired from content/config.ts ui.itemGrid
// To change the grid layout, set siteConfig.ui.itemGrid in content/config.ts
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { siteConfig } from "@/content/config";
import type { Item, PriceTier } from "@/lib/content/types";
import { ItemCardAdapter } from "./ItemCardAdapter";
import { BentoGrid } from "@/components/ui/bento-grid";
import { LayoutGrid } from "@/components/ui/layout-grid";
import { ConditionBadge } from "@/components/item/ConditionBadge";
import { useLocale } from "@/components/i18n/useLocale";
import { getLocalizedField } from "@/lib/utils/i18n";
import { cn } from "@/lib/utils/index";

type Props = {
  items: Item[];
  resolvedPrices: Map<string, PriceTier | null>;
  browseAll?: boolean;
};

function itemKey(item: Item) {
  return `${item.categorySlug}/${item.itemSlug}`;
}

export function ItemGridAdapter({ items, resolvedPrices, browseAll = false }: Props) {
  const mode = siteConfig.ui.itemGrid;
  const { locale } = useLocale();
  const price = (item: Item) => resolvedPrices.get(itemKey(item)) ?? null;

  if (items.length === 0) return null;

  // ── bento-grid ─────────────────────────────────────────────────────────────
  // BentoGrid is a styled container div; pass ItemCardAdapters directly as children.
  if (mode === "bento-grid") {
    return (
      <BentoGrid className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 md:auto-rows-auto auto-rows-auto">
        {items.map((item) => (
          <ItemCardAdapter
            key={itemKey(item)}
            item={item}
            resolvedPrice={price(item)}
            showCategoryChip={browseAll}
          />
        ))}
      </BentoGrid>
    );
  }

  // ── layout-grid ────────────────────────────────────────────────────────────
  // LayoutGrid expects { id, thumbnail, className, content }[]. We normalise items
  // into this format, spreading cards across two alternating span patterns.
  if (mode === "layout-grid") {
    const cards = items.map((item, i) => ({
      id: i + 1,
      thumbnail: item.coverImage ?? "",
      className: i % 5 === 0 ? "md:col-span-2" : "",
      content: (
        <div className="p-1">
          <p className="font-bold text-base text-foreground">
            {getLocalizedField(item, "name", locale)}
          </p>
          <p className="flex items-center gap-1.5 font-normal text-sm text-foreground/70">
            <ConditionBadge condition={item.condition} />
            {price(item) ? `· $${price(item)!.amount}` : ""}
          </p>
        </div>
      ),
    }));
    return (
      <div className="w-full">
        <LayoutGrid cards={cards} />
      </div>
    );
  }

  // ── focus-cards ────────────────────────────────────────────────────────────
  // FocusCards takes { title, src }[] and blurs non-hovered cards. Since the
  // Aceternity component does not support navigation, we replicate the blur/focus
  // behaviour with Link wrappers so each card remains navigable.
  if (mode === "focus-cards") {
    return <FocusCardsGrid items={items} resolvedPrices={resolvedPrices} browseAll={browseAll} />;
  }

  // ── simple (default) ───────────────────────────────────────────────────────
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <ItemCardAdapter
          key={itemKey(item)}
          item={item}
          resolvedPrice={price(item)}
          showCategoryChip={browseAll}
        />
      ))}
    </div>
  );
}

// FocusCards-style grid with navigation — replicates the blur/focus hover effect
// from Aceternity's FocusCards whilst preserving Link-based navigation.
function FocusCardsGrid({ items, resolvedPrices, browseAll }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);
  const price = (item: Item) => resolvedPrices.get(itemKey(item)) ?? null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto w-full">
      {items.map((item, index) => (
        <Link
          key={itemKey(item)}
          href={`/${item.categorySlug}/${item.itemSlug}`}
          onMouseEnter={() => setHovered(index)}
          onMouseLeave={() => setHovered(null)}
          className={cn(
            "rounded-xl overflow-hidden transition-all duration-300 ease-out block",
            hovered !== null && hovered !== index ? "blur-sm scale-[0.98]" : "",
          )}
          aria-label={item.name}
        >
          <ItemCardAdapter
            item={item}
            resolvedPrice={price(item)}
            showCategoryChip={browseAll}
          />
        </Link>
      ))}
    </div>
  );
}
