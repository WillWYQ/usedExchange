import type { Metadata } from "next";
import { siteConfig } from "@/content/config";
import { loadSoldItems } from "@/lib/content/loader";
import type { Item } from "@/lib/content/types";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { AdaptiveImage } from "@/components/common/AdaptiveImage";
import { ConditionBadge } from "@/components/item/ConditionBadge";

export const metadata: Metadata = {
  title: `Sold Archive — ${siteConfig.name}`,
  description: `Previously sold items from ${siteConfig.name}.`,
  openGraph: {
    title: `Sold Archive — ${siteConfig.name}`,
    description: `Previously sold items from ${siteConfig.name}.`,
  },
};

// Simple sold-item card: cover image, name, condition, sold date, category chip.
// No pricing, no contact, no filter bar — read-only archive (DESIGN.md §10.5).
function SoldItemCard({ item }: { item: Item }) {
  const soldDateStr = item.soldDate ?? item.listedDate;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/10">
      {/* Cover image */}
      <div className="relative aspect-square overflow-hidden bg-white/5">
        {item.coverImage ? (
          <AdaptiveImage
            src={item.coverImage}
            alt={item.name}
            fill
            className="object-cover opacity-50"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl text-white/20">
            📦
          </div>
        )}
        {/* Sold overlay badge */}
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/40"
          aria-hidden="true"
        >
          <span className="rounded-full bg-red-700 px-3 py-1 text-xs font-bold uppercase tracking-widest text-white">
            Sold
          </span>
        </div>
      </div>

      {/* Text content */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        {/* Category chip */}
        <span className="w-fit rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">
          {item.categoryOverride || item.categorySlug}
        </span>

        {/* Item name */}
        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-white">
          {item.name}
        </h3>

        {/* Condition badge */}
        <ConditionBadge condition={item.condition} />

        {/* Sold date */}
        {soldDateStr && (
          <p className="mt-auto text-xs text-white/40">Sold {soldDateStr}</p>
        )}
      </div>
    </div>
  );
}

export default async function SoldArchivePage() {
  // loadSoldItems() returns ALL sold items regardless of soldItemRetentionDays.
  // Sorted by soldDate desc (falls back to listedDate).
  const items = await loadSoldItems();

  // /sold is a permanent, ever-growing static page (no pagination at request
  // time in a fully-exported site) — cap how many render so build time and
  // page weight don't grow unbounded over years of use. The header count
  // intentionally reflects the *total*, not the capped grid, so the seller
  // can see their full sales history at a glance.
  const limit = siteConfig.soldArchiveDisplayLimit;
  const visibleItems = limit > 0 ? items.slice(0, limit) : items;

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Sold Archive" },
        ]}
      />

      <header className="mb-6 mt-4">
        <h1 className="text-2xl font-bold text-white sm:text-3xl">
          Sold Archive
        </h1>
        <p className="mt-1.5 text-white/60">
          {items.length} item{items.length !== 1 ? "s" : ""} sold
        </p>
      </header>

      {items.length === 0 ? (
        <p className="py-16 text-center text-white/40">
          No sold items yet.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {visibleItems.map((item) => (
              <SoldItemCard
                key={`${item.categorySlug}/${item.itemSlug}`}
                item={item}
              />
            ))}
          </div>
          {visibleItems.length < items.length && (
            <p className="mt-6 text-center text-sm text-white/40">
              Showing the {visibleItems.length} most recently sold items
              ({items.length - visibleItems.length} older items not shown).
            </p>
          )}
        </>
      )}
    </>
  );
}
