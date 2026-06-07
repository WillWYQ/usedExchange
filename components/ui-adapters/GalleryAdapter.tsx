// ⚠️ DO NOT EDIT — auto-wired from content/config.ts ui.gallery
// To change the gallery style, set siteConfig.ui.gallery in content/config.ts
"use client";

import React from "react";
import { siteConfig } from "@/content/config";
import { ItemGallery } from "@/components/item/ItemGallery";
import { ImagesSlider } from "@/components/ui/images-slider";
import { ParallaxScroll } from "@/components/ui/parallax-scroll";
import { Carousel as AppleCarousel, Card as AppleCard } from "@/components/ui/apple-cards-carousel";
// carousel.tsx uses a default export; alias to avoid collision with apple-cards-carousel
import CarouselSlider from "@/components/ui/carousel";

type Props = {
  images: string[];
  itemName: string;
};

export function GalleryAdapter({ images, itemName }: Props) {
  const mode = siteConfig.ui.gallery;

  // Empty state — identical across all modes
  if (images.length === 0) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/30">
        No images
      </div>
    );
  }

  // ── apple-cards-carousel ──────────────────────────────────────────────────
  if (mode === "apple-cards-carousel") {
    const cards = images.map((src, i) => ({
      src,
      title: `${itemName} — ${i + 1}`,
      category: itemName,
      content: (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={`${itemName} image ${i + 1}`}
          className="w-full h-full object-contain"
        />
      ),
    }));

    const items = cards.map((card, i) => (
      <AppleCard key={card.src} card={card} index={i} layout />
    ));

    return <AppleCarousel items={items} />;
  }

  // ── images-slider ─────────────────────────────────────────────────────────
  if (mode === "images-slider") {
    return (
      <ImagesSlider images={images} className="rounded-2xl overflow-hidden aspect-[4/3]">
        {/* Slim label at the bottom so the slider has required children */}
        <div className="absolute bottom-4 left-4 rounded-full bg-black/50 px-3 py-1 text-sm text-white/80 backdrop-blur-sm">
          {itemName}
        </div>
      </ImagesSlider>
    );
  }

  // ── carousel (3-D slide carousel from carousel.tsx) ───────────────────────
  if (mode === "carousel") {
    const slides = images.map((src, i) => ({
      src,
      title: `Image ${i + 1}`,
      button: "View",
    }));
    return (
      <div className="w-full overflow-hidden rounded-2xl">
        <CarouselSlider slides={slides} />
      </div>
    );
  }

  // ── parallax-scroll ───────────────────────────────────────────────────────
  if (mode === "parallax-scroll") {
    return (
      <div className="rounded-2xl overflow-hidden">
        <ParallaxScroll images={images} className="rounded-2xl" />
      </div>
    );
  }

  // ── simple (default + unknown) ────────────────────────────────────────────
  return <ItemGallery images={images} itemName={itemName} />;
}
