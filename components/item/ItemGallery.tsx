"use client";

import { useState } from "react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { clsx } from "clsx";

type ItemGalleryProps = {
  images: string[];
  itemName: string;
};

// Simple gallery: large main image + scrollable thumbnail strip.
// Used by GalleryAdapter when ui.gallery === "simple" (Phase 11 wires adapters).
export function ItemGallery({ images, itemName }: ItemGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (images.length === 0) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/30">
        No images
      </div>
    );
  }

  const activeImage = images[activeIndex]!;
  const hasPrev = activeIndex > 0;
  const hasNext = activeIndex < images.length - 1;

  function prev() {
    setActiveIndex((i) => Math.max(0, i - 1));
  }

  function next() {
    setActiveIndex((i) => Math.min(images.length - 1, i + 1));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowLeft") prev();
    if (e.key === "ArrowRight") next();
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Main image */}
      <div
        className="relative overflow-hidden rounded-2xl border border-white/10 bg-black"
        onKeyDown={handleKeyDown}
        tabIndex={0}
        aria-label={`Gallery image ${activeIndex + 1} of ${images.length}`}
        role="region"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={activeImage}
          alt={`${itemName} — image ${activeIndex + 1}`}
          className="aspect-[4/3] w-full object-contain"
        />

        {/* Prev / Next controls (shown only when > 1 image) */}
        {images.length > 1 && (
          <>
            <button
              onClick={prev}
              disabled={!hasPrev}
              aria-label="Previous image"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1.5 text-white/80 transition-opacity hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:opacity-0"
            >
              <IconChevronLeft size={20} />
            </button>
            <button
              onClick={next}
              disabled={!hasNext}
              aria-label="Next image"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1.5 text-white/80 transition-opacity hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:opacity-0"
            >
              <IconChevronRight size={20} />
            </button>

            {/* Image counter */}
            <span className="absolute bottom-2 right-3 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white/60">
              {activeIndex + 1} / {images.length}
            </span>
          </>
        )}
      </div>

      {/* Thumbnail strip (shown only when > 1 image) */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1" role="list" aria-label="Image thumbnails">
          {images.map((src, i) => (
            <button
              key={src}
              role="listitem"
              onClick={() => setActiveIndex(i)}
              aria-label={`View image ${i + 1}`}
              aria-current={i === activeIndex}
              className={clsx(
                "h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
                i === activeIndex
                  ? "border-white/60"
                  : "border-white/10 opacity-60 hover:opacity-100",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                aria-hidden="true"
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
