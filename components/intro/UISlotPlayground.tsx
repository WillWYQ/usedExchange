"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils/index";
// Dynamic imports — each in its own chunk so only active variants load
const Spotlight = dynamic(
  () => import("@/components/ui/spotlight-new").then((m) => m.Spotlight),
  { ssr: false },
);
const Meteors = dynamic(
  () => import("@/components/ui/meteors").then((m) => m.Meteors),
  { ssr: false },
);
const CardSpotlightDyn = dynamic(
  () => import("@/components/ui/card-spotlight").then((m) => m.CardSpotlight),
  { ssr: false },
);
const WobbleCard = dynamic(
  () => import("@/components/ui/wobble-card").then((m) => m.WobbleCard),
  { ssr: false },
);
const CardContainer = dynamic(() =>
  import("@/components/ui/3d-card").then((m) => m.CardContainer),
);
const CardBody = dynamic(() =>
  import("@/components/ui/3d-card").then((m) => m.CardBody),
);
const BentoGrid = dynamic(() =>
  import("@/components/ui/bento-grid").then((m) => m.BentoGrid),
);
const ImagesSlider = dynamic(
  () => import("@/components/ui/images-slider").then((m) => m.ImagesSlider),
  { ssr: false },
);
const CarouselSlider = dynamic(
  () => import("@/components/ui/carousel"),
  { ssr: false },
);

type BgKey = "spotlight" | "aurora" | "meteors" | "grid-dot";
type GridKey = "simple" | "bento" | "focus";
type CardKey = "simple" | "glow" | "wobble" | "3d";
type GalleryKey = "simple" | "slider" | "carousel";

const BG_OPTIONS: { key: BgKey; label: string }[] = [
  { key: "spotlight", label: "Spotlight" },
  { key: "aurora", label: "Aurora" },
  { key: "meteors", label: "Meteors" },
  { key: "grid-dot", label: "Grid & dot" },
];

const GRID_OPTIONS: { key: GridKey; label: string }[] = [
  { key: "simple", label: "Simple grid" },
  { key: "bento", label: "Bento" },
  { key: "focus", label: "Focus cards" },
];

const CARD_OPTIONS: { key: CardKey; label: string }[] = [
  { key: "simple", label: "Minimal" },
  { key: "glow", label: "Glow" },
  { key: "wobble", label: "Wobble" },
  { key: "3d", label: "3D tilt" },
];

const GALLERY_OPTIONS: { key: GalleryKey; label: string }[] = [
  { key: "simple", label: "Thumbnails" },
  { key: "slider", label: "Slideshow" },
  { key: "carousel", label: "3D carousel" },
];

// SVG data-URI demo photos — load instantly with no network dependency.
// Coloured gradients convey "here are item photos" without relying on R2
// images being uploaded or local 1×1 placeholder PNGs being real photos.
function makeDemoPhoto(color1: string, color2: string, label: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='480' height='320'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%25' stop-color='${color1}'/><stop offset='100%25' stop-color='${color2}'/></linearGradient></defs><rect width='480' height='320' fill='url(%23g)'/><text x='240' y='170' fill='rgba(255,255,255,0.6)' font-family='system-ui,sans-serif' font-size='18' text-anchor='middle'>${label}</text></svg>`;
  return `data:image/svg+xml,${svg}`;
}

const GALLERY_IMAGES = [
  makeDemoPhoto("%23002af9", "%236d748d", "Photo 1"),
  makeDemoPhoto("%23a8bbd6", "%23d5a198", "Photo 2"),
  makeDemoPhoto("%23d5a198", "%23ecbfb6", "Photo 3"),
  makeDemoPhoto("%2352596b", "%23a8bbd6", "Photo 4"),
  makeDemoPhoto("%236d748d", "%23002af9", "Photo 5"),
];

const SPOTLIGHT_COLORS = ["#002af9", "#a8bbd6", "#d5a198", "#6d748d"];

function PillSwitcher({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-foreground/40">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {options.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            aria-pressed={value === opt.key}
            className={[
              "rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              value === opt.key
                ? "bg-gradient-to-r from-accent-soft to-accent text-[#f8f4ec]"
                : "bg-foreground/5 text-foreground/60 ring-1 ring-border hover:text-foreground",
            ].join(" ")}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SlotCardContent({ name, description }: { name: string; description: string }) {
  return (
    <div className="flex h-full flex-col gap-1.5 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground/40">{name}</p>
      <p className="text-sm leading-relaxed text-foreground/70">{description}</p>
    </div>
  );
}

function SlotCard({
  cardKey,
  name,
  description,
  index,
}: {
  cardKey: CardKey;
  name: string;
  description: string;
  index: number;
}) {
  const content = <SlotCardContent name={name} description={description} />;

  if (cardKey === "glow") {
    return (
      <CardSpotlightDyn
        radius={180}
        color={SPOTLIGHT_COLORS[index % SPOTLIGHT_COLORS.length]}
        className="h-full min-h-[90px] border-0 bg-foreground/5 p-0"
      >
        {content}
      </CardSpotlightDyn>
    );
  }

  if (cardKey === "wobble") {
    return (
      <WobbleCard
        containerClassName="h-full min-h-[90px] rounded-xl bg-foreground/5 ring-1 ring-border"
        className="p-0"
      >
        {content}
      </WobbleCard>
    );
  }

  if (cardKey === "3d") {
    return (
      <CardContainer containerClassName="py-0 h-full" className="h-full w-full">
        <CardBody className="h-full w-full rounded-xl bg-foreground/5 ring-1 ring-border">
          {content}
        </CardBody>
      </CardContainer>
    );
  }

  return (
    <div className="h-full min-h-[90px] rounded-xl bg-foreground/5 ring-1 ring-border">
      {content}
    </div>
  );
}

function BackgroundLayer({ bgKey }: { bgKey: BgKey }) {
  if (bgKey === "spotlight") {
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <Spotlight />
      </div>
    );
  }
  if (bgKey === "meteors") {
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <Meteors number={10} />
      </div>
    );
  }
  if (bgKey === "aurora") {
    return (
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Replicates the inner animated layer of AuroraBackground, confined to
            this box. invert(1) + white-stripe mask is how the original creates
            the coloured bands from a white/transparent gradient. */}
        <div
          className="absolute -inset-[10px] blur-[14px] opacity-60 will-change-transform dark:opacity-75"
          style={
            {
              backgroundImage:
                "repeating-linear-gradient(100deg,#fff 0%,#fff 7%,transparent 10%,transparent 12%,#fff 16%), repeating-linear-gradient(100deg,#002af9 10%,#a8bbd6 15%,#d5a198 20%,#ecbfb6 25%,#6d748d 30%)",
              backgroundSize: "300%, 200%",
              backgroundPosition: "50% 50%, 50% 50%",
              animation: "aurora 10s linear infinite",
              filter: "invert(1)",
              maskImage: "radial-gradient(ellipse at 60% 0%, black 30%, transparent 75%)",
            } as React.CSSProperties
          }
        />
      </div>
    );
  }
  if (bgKey === "grid-dot") {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, color-mix(in srgb, var(--foreground) 22%, transparent) 1.5px, transparent 1.5px)",
          backgroundSize: "28px 28px",
        }}
      />
    );
  }
  return null;
}

function CatalogPreview({
  bgKey,
  gridKey,
  cardKey,
  slots,
}: {
  bgKey: BgKey;
  gridKey: GridKey;
  cardKey: CardKey;
  slots: { name: string; description: string }[];
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  let gridContent: React.ReactNode;

  if (gridKey === "bento") {
    gridContent = (
      <BentoGrid className="max-w-none auto-rows-auto md:auto-rows-auto grid-cols-2 md:grid-cols-3 gap-3">
        {slots.map((slot, i) => (
          <div key={slot.name} className={i === 0 ? "col-span-2" : ""}>
            <SlotCard cardKey={cardKey} name={slot.name} description={slot.description} index={i} />
          </div>
        ))}
      </BentoGrid>
    );
  } else if (gridKey === "focus") {
    gridContent = (
      <div className="grid grid-cols-2 gap-3">
        {slots.map((slot, i) => (
          <div
            key={slot.name}
            className={cn(
              "transition-all duration-300 ease-out",
              hoveredIndex !== null && hoveredIndex !== i
                ? "scale-[0.97] opacity-50 blur-[2px]"
                : "",
            )}
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <SlotCard cardKey={cardKey} name={slot.name} description={slot.description} index={i} />
          </div>
        ))}
      </div>
    );
  } else {
    gridContent = (
      <div className="grid grid-cols-2 gap-3">
        {slots.map((slot, i) => (
          <SlotCard
            key={slot.name}
            cardKey={cardKey}
            name={slot.name}
            description={slot.description}
            index={i}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="relative min-h-[260px] overflow-hidden rounded-2xl bg-background p-4 ring-1 ring-border">
      <BackgroundLayer bgKey={bgKey} />
      <div className="relative z-10">{gridContent}</div>
    </div>
  );
}

function GalleryPreview({ galleryKey }: { galleryKey: GalleryKey }) {
  if (galleryKey === "slider") {
    return (
      <ImagesSlider
        images={GALLERY_IMAGES}
        className="aspect-video rounded-xl"
        autoplay
      >
        <div className="absolute bottom-4 left-4 rounded-full bg-background/50 px-3 py-1 text-xs text-foreground/70 backdrop-blur-sm">
          Sample photos
        </div>
      </ImagesSlider>
    );
  }

  if (galleryKey === "carousel") {
    const slides = GALLERY_IMAGES.map((src, i) => ({
      src,
      title: `Photo ${i + 1}`,
      button: "View",
    }));
    return (
      <div className="@container aspect-square w-full max-w-full overflow-hidden rounded-xl">
        <CarouselSlider slides={slides} />
      </div>
    );
  }

  return (
    <div className="flex gap-2 overflow-x-auto rounded-xl pb-1">
      {GALLERY_IMAGES.map((src, i) => (
        <div key={i} className="h-28 w-40 flex-shrink-0 overflow-hidden rounded-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={`Sample ${i + 1}`} className="h-full w-full object-cover" />
        </div>
      ))}
    </div>
  );
}

export function UISlotPlayground({
  slots,
}: {
  slots: { name: string; description: string }[];
}) {
  const [bgKey, setBgKey] = useState<BgKey>("spotlight");
  const [gridKey, setGridKey] = useState<GridKey>("simple");
  const [cardKey, setCardKey] = useState<CardKey>("simple");
  const [galleryKey, setGalleryKey] = useState<GalleryKey>("simple");

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="space-y-3 rounded-xl bg-foreground/5 p-4 ring-1 ring-border">
        <PillSwitcher
          label="Background"
          options={BG_OPTIONS}
          value={bgKey}
          onChange={(k) => setBgKey(k as BgKey)}
        />
        <PillSwitcher
          label="Item grid"
          options={GRID_OPTIONS}
          value={gridKey}
          onChange={(k) => setGridKey(k as GridKey)}
        />
        <PillSwitcher
          label="Item card"
          options={CARD_OPTIONS}
          value={cardKey}
          onChange={(k) => setCardKey(k as CardKey)}
        />
        <PillSwitcher
          label="Gallery"
          options={GALLERY_OPTIONS}
          value={galleryKey}
          onChange={(k) => setGalleryKey(k as GalleryKey)}
        />
      </div>

      {/* Catalog preview — background + grid + card */}
      <CatalogPreview bgKey={bgKey} gridKey={gridKey} cardKey={cardKey} slots={slots} />

      {/* Gallery preview */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground/40">
          Gallery — item photo viewer
        </p>
        <GalleryPreview galleryKey={galleryKey} />
      </div>
    </div>
  );
}
