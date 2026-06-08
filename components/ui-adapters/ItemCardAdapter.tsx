// ⚠️ DO NOT EDIT — auto-wired from content/config.ts ui.itemCard
// To change the card effect, set siteConfig.ui.itemCard in content/config.ts
"use client";

import React from "react";
import dynamic from "next/dynamic";
import { siteConfig } from "@/content/config";
import type { Item, PriceTier } from "@/lib/content/types";
import { ItemCard } from "@/components/item/ItemCard";

// Only one card variant is ever active (siteConfig.ui.itemCard is a build-time
// constant), so each is dynamically imported into its own chunk — the unused
// variants (and their dependencies, e.g. three.js via card-spotlight's
// canvas-reveal-effect) are never bundled into the page.
const CardSpotlight = dynamic(
  () => import("@/components/ui/card-spotlight").then((m) => m.CardSpotlight),
  { ssr: false },
);
const CardContainer = dynamic(() =>
  import("@/components/ui/3d-card").then((m) => m.CardContainer),
);
const CardBody = dynamic(() =>
  import("@/components/ui/3d-card").then((m) => m.CardBody),
);
const WobbleCard = dynamic(() =>
  import("@/components/ui/wobble-card").then((m) => m.WobbleCard),
);
const DirectionAwareHover = dynamic(() =>
  import("@/components/ui/direction-aware-hover").then(
    (m) => m.DirectionAwareHover,
  ),
);
const GlareCard = dynamic(() =>
  import("@/components/ui/glare-card").then((m) => m.GlareCard),
);

type Props = {
  item: Item;
  resolvedPrice: PriceTier | null;
  showCategoryChip?: boolean;
};

export function ItemCardAdapter({ item, resolvedPrice, showCategoryChip = false }: Props) {
  const mode = siteConfig.ui.itemCard;
  const card = <ItemCard item={item} resolvedPrice={resolvedPrice} showCategoryChip={showCategoryChip} />;

  switch (mode) {
    case "card-spotlight":
      return (
        <CardSpotlight className="rounded-xl p-0 overflow-hidden" radius={300}>
          {card}
        </CardSpotlight>
      );

    case "3d-card":
      return (
        <CardContainer containerClassName="py-0" className="inter-var">
          <CardBody className="rounded-xl overflow-hidden">
            {card}
          </CardBody>
        </CardContainer>
      );

    case "wobble-card":
      return (
        <WobbleCard containerClassName="rounded-xl overflow-hidden" className="p-0">
          {card}
        </WobbleCard>
      );

    case "glare-card":
      return (
        <GlareCard className="rounded-xl overflow-hidden p-0">
          {card}
        </GlareCard>
      );

    case "direction-aware-hover": {
      // DirectionAwareHover requires an image URL; fall back to simple when cover absent.
      const imageUrl = item.coverImage;
      if (!imageUrl) return card;
      return (
        <DirectionAwareHover imageUrl={imageUrl} className="rounded-xl w-full h-full cursor-pointer">
          {/* Children are shown as an overlay label on hover */}
          <p className="font-semibold text-sm text-foreground line-clamp-2">{item.name}</p>
        </DirectionAwareHover>
      );
    }

    // card-hover-effect: the HoverEffect component renders its own anchor array and
    // is not suitable as a single-card wrapper. Use a subtle ring-on-hover CSS effect.
    case "card-hover-effect":
      return (
        <div className="transition-all duration-200 hover:ring-2 hover:ring-foreground/30 rounded-xl">
          {card}
        </div>
      );

    // evervault-card: EvervaultCard accepts only text/className, not arbitrary children.
    // Render a subtle encrypted-text overlay on hover instead.
    case "evervault-card":
      return (
        <div className="group relative rounded-xl overflow-hidden">
          {card}
          <div
            className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-violet-500/10 to-transparent rounded-xl"
            aria-hidden
          />
        </div>
      );

    default: // "simple" + any unknown value → silent fallback
      return card;
  }
}
