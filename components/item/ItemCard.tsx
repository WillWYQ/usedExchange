// Server component for Phase 5/6. Phase 12 converts this to "use client" and
// wraps the title in useLocale() + getLocalizedField() for i18n runtime switching.
import Link from "next/link";
import type { Item, PriceTier } from "@/lib/content/types";
import { AdaptiveImage } from "@/components/common/AdaptiveImage";
import { ConditionBadge } from "./ConditionBadge";
import { StatusBadge } from "./StatusBadge";

type ItemCardProps = {
  item: Item;
  resolvedPrice: PriceTier | null;
  // When true, renders an "Items in: {category}" chip linking to the category page.
  // Used by the Browse All page (Phase 8b).
  showCategoryChip?: boolean;
};

export function ItemCard({ item, resolvedPrice, showCategoryChip = false }: ItemCardProps) {
  const href = `/${item.categorySlug}/${item.itemSlug}`;
  const isSold = item.status === "sold";

  return (
    <Link
      href={href}
      className="group relative flex flex-col overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/10 transition-all duration-200 hover:bg-white/10 hover:ring-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
    >
      {/* Cover image */}
      <div className="relative aspect-square overflow-hidden bg-white/5">
        {item.coverImage ? (
          <AdaptiveImage
            src={item.coverImage}
            alt={item.name}
            fill
            className={[
              "object-cover transition-transform duration-300 group-hover:scale-105",
              isSold ? "opacity-50" : "",
            ].join(" ")}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl text-white/20">
            📦
          </div>
        )}

        {/* Sold overlay */}
        {isSold && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/50"
            aria-hidden="true"
          >
            <span className="rounded-full bg-red-700 px-3 py-1 text-xs font-bold uppercase tracking-widest text-white">
              Sold
            </span>
          </div>
        )}

        {/* Price-reduced chip */}
        {item.priceReduced && !isSold && (
          <div className="absolute left-2 top-2">
            <span className="rounded-full bg-amber-500/90 px-2 py-0.5 text-xs font-semibold text-black">
              Price Reduced
            </span>
          </div>
        )}
      </div>

      {/* Text content */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        {/* Category chip (Browse All page) */}
        {showCategoryChip && (
          <span className="w-fit rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">
            {item.categoryOverride || item.categorySlug}
          </span>
        )}

        {/* Item name */}
        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-white">
          {item.name}
        </h3>

        {/* Condition + Status badges */}
        <div className="flex flex-wrap gap-1">
          <ConditionBadge condition={item.condition} />
          {item.status !== "available" && <StatusBadge status={item.status} />}
        </div>

        {/* Resolved price */}
        <div className="mt-auto pt-1 text-sm">
          {resolvedPrice !== null ? (
            <div className="flex flex-wrap items-baseline gap-1.5">
              <span className="font-semibold text-white">
                ${resolvedPrice.amount}
              </span>
              {item.price.negotiable && (
                <span className="text-xs text-white/50">OBO</span>
              )}
            </div>
          ) : (
            <span className="text-white/40">Contact for price</span>
          )}
        </div>
      </div>
    </Link>
  );
}
