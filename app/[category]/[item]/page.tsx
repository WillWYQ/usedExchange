import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { siteConfig } from "@/content/config";
import { loadCategories, loadItemsByCategory } from "@/lib/content/loader";
import { isValidSlug } from "@/lib/utils/slug";
import { resolveItemPrice } from "@/lib/utils/pricing";
import { formatAbsoluteDate } from "@/lib/utils/date";
import { DistancePricingProvider } from "@/components/pricing/DistancePricingContext";
import { buildProductJsonLd, buildBreadcrumbJsonLd } from "@/lib/utils/jsonld";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { StatusBadge } from "@/components/item/StatusBadge";
import { ConditionBadge } from "@/components/item/ConditionBadge";
import { ConditionGuide } from "@/components/item/ConditionGuide";
import { MetadataTable } from "@/components/item/MetadataTable";
import { PricingSection } from "@/components/item/PricingSection";
import { FreshnessLabel } from "@/components/item/FreshnessLabel";
import { QuantityBadge } from "@/components/item/QuantityBadge";
import { TextbookBadge } from "@/components/item/TextbookBadge";
import { MakeOfferButton } from "@/components/item/MakeOfferButton";
import { GalleryAdapter } from "@/components/ui-adapters/GalleryAdapter";
import { LocalizedItemContent } from "@/components/item/LocalizedItemContent";
import { ContactSection } from "@/components/contact/ContactSection";
import { ShareButton } from "@/components/common/ShareButton";
import { RecentlyViewed } from "@/components/common/RecentlyViewed";
import { JsonLd } from "@/components/common/JsonLd";

// Memoised per request so generateMetadata and the page share one parse pass.
const getPageData = cache(async (category: string, item: string) => {
  const [categories, items] = await Promise.all([
    loadCategories(),
    loadItemsByCategory(category),
  ]);
  const categoryMeta = categories.find((c) => c.slug === category) ?? null;
  const itemData = items.find((i) => i.itemSlug === item) ?? null;
  return { categoryMeta, itemData };
});

export async function generateStaticParams() {
  const categories = await loadCategories();
  const params: { category: string; item: string }[] = [];

  await Promise.all(
    categories.map(async (cat) => {
      // A malformed category folder name would already have been skipped by
      // loadCategories' own filtering in well-formed content trees, but a
      // non-slug-safe name (spaces, parens, non-ASCII) can still slip through
      // as a directory — guard here so we never emit a static path that won't
      // round-trip through Next's URL encoding.
      if (!isValidSlug(cat.slug)) {
        console.warn(`[generateStaticParams] skipping category with unsafe slug: "${cat.slug}"`);
        return;
      }
      const items = await loadItemsByCategory(cat.slug);
      for (const it of items) {
        if (!isValidSlug(it.itemSlug)) {
          console.warn(`[generateStaticParams] skipping item with unsafe slug: "${cat.slug}/${it.itemSlug}"`);
          continue;
        }
        params.push({ category: cat.slug, item: it.itemSlug });
      }
    }),
  );

  return params;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string; item: string }>;
}): Promise<Metadata> {
  const { category, item } = await params;
  const { itemData } = await getPageData(category, item);

  if (!itemData) return {};

  const description =
    itemData.metaDescription ||
    itemData.description.slice(0, 160) ||
    `${itemData.name} — ${siteConfig.name}`;

  const ogImage = itemData.coverImage ?? undefined;

  return {
    title: `${itemData.name} — ${siteConfig.name}`,
    description,
    openGraph: {
      title: itemData.name,
      description,
      type: "website",
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: itemData.name,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
      ...(siteConfig.meta.twitterHandle
        ? { site: siteConfig.meta.twitterHandle }
        : {}),
    },
    // Pinterest rich pin meta
    other: {
      ...(itemData.price.tiers[0]
        ? {
            "product:price:amount": String(itemData.price.tiers[0].amount),
            "product:price:currency": itemData.price.currency,
          }
        : {}),
      "og:availability":
        itemData.status === "available" ? "instock" : "out of stock",
    },
    alternates: {
      canonical: `${siteConfig.baseUrl}/${category}/${item}`,
    },
    metadataBase: new URL(siteConfig.baseUrl),
  };
}

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ category: string; item: string }>;
}) {
  const { category, item } = await params;
  const { categoryMeta, itemData } = await getPageData(category, item);

  if (!itemData) notFound();

  const isSold = itemData.status === "sold";

  // Server-side fallback tier for SSG initial render — no blank before JS hydration.
  const initialResolvedTier = resolveItemPrice(itemData.price, {
    source: "fallback",
  });

  // Single source of truth for the trail — Breadcrumb wants the last entry
  // href-less (rendered as plain text), JSON-LD wants every entry's href.
  const crumbTrail = [
    { label: "Home", href: "/" },
    { label: categoryMeta?.displayName ?? category, href: `/${category}` },
    { label: itemData.name, href: `/${category}/${item}` },
  ];

  const breadcrumbs = crumbTrail.map((c, i) =>
    i === crumbTrail.length - 1 ? { label: c.label } : c,
  );

  const jsonLdCrumbs = crumbTrail.map((c) => ({ name: c.label, href: c.href }));

  return (
    <DistancePricingProvider sellerLocation={siteConfig.location}>
      {/* JSON-LD structured data */}
      <JsonLd data={buildProductJsonLd(itemData, siteConfig.baseUrl)} />
      <JsonLd data={buildBreadcrumbJsonLd(jsonLdCrumbs, siteConfig.baseUrl)} />

      <Breadcrumb items={breadcrumbs} />

      {/* SOLD banner */}
      {isSold && (
        <div
          role="alert"
          className="mb-6 mt-2 rounded-xl border-0 bg-accent-soft/15 px-4 py-3 text-center text-sm font-semibold text-[#a8584a] dark:text-accent-soft"
        >
          {siteConfig.i18n.strings.soldBanner || "This item has been sold"}
          {itemData.soldDate && (
            <span className="ml-2 font-normal text-[#a8584a]/70 dark:text-accent-soft/70">
              {/* This is a Server Component rendered once at export time —
                  `toLocaleDateString()` would format using the CI runner's
                  locale/timezone (not the visitor's), the same class of bug
                  FreshnessLabel was built to avoid. formatAbsoluteDate parses
                  the YYYY-MM-DD components explicitly for a deterministic,
                  locale-stable result baked into the static HTML. */}
              on {formatAbsoluteDate(itemData.soldDate)}
            </span>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-10 lg:grid-cols-2">
        {/* Left column — gallery */}
        <div>
          <GalleryAdapter images={itemData.images} itemName={itemData.name} />
        </div>

        {/* Right column — details */}
        <div className="flex flex-col gap-5">
          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={itemData.status} />
            <span className="inline-flex items-center gap-1">
              <ConditionBadge condition={itemData.condition} />
              <ConditionGuide />
            </span>
            <QuantityBadge quantity={itemData.quantity} />
            {itemData.priceReduced && (
              <span className="inline-flex items-center rounded-full bg-accent-soft/20 px-2.5 py-0.5 text-xs font-medium text-[#a8584a] ring-1 ring-inset ring-accent-soft/40 dark:text-accent-soft">
                Price Reduced
              </span>
            )}
            {itemData.noLowball && (
              <span className="inline-flex items-center rounded-full bg-foreground/10 px-2.5 py-0.5 text-xs font-medium text-foreground/60 ring-1 ring-inset ring-foreground/20">
                Firm Price
              </span>
            )}
          </div>

          {/* Name — locale-aware via LocalizedItemContent; Freshness uses live clock */}
          <div className="flex flex-col gap-1">
            <LocalizedItemContent item={itemData} />
            <FreshnessLabel listedDate={itemData.listedDate} />
          </div>

          {/* Pricing section (client — owns geo state) */}
          <PricingSection
            price={itemData.price}
            initialResolvedTier={initialResolvedTier}
            previousLowestPrice={
              itemData.priceReduced ? itemData.previousLowestPrice : null
            }
          />

          {/* Make an Offer button — shown when negotiable AND min offer is set */}
          {itemData.price.negotiable && itemData.minAcceptableOffer !== null && (
            <MakeOfferButton
              itemName={itemData.name}
              minAcceptableOffer={itemData.minAcceptableOffer}
              currency={itemData.price.currency}
              resolvedTier={initialResolvedTier}
            />
          )}

          {/* Pay Deposit / Pay with Venmo buttons */}
          {(itemData.stripePaymentLink || itemData.venmoPaymentRequest) && (
            <div className="flex flex-wrap gap-2">
              {itemData.stripePaymentLink && (
                <a
                  href={itemData.stripePaymentLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-accent-soft/80 px-5 py-2 text-sm font-medium text-[#231f20] transition-colors hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft/50"
                >
                  Pay Deposit
                </a>
              )}
              {itemData.venmoPaymentRequest && (
                <a
                  href={itemData.venmoPaymentRequest}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-accent/80 px-5 py-2 text-sm font-medium text-[#f8f4ec] transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                >
                  Pay with Venmo
                </a>
              )}
            </div>
          )}

          {/* YouTube demo */}
          {itemData.youtubeLink && (
            <a
              href={itemData.youtubeLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-2 rounded-full border-0 px-4 py-2 text-sm text-foreground/60 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50"
            >
              ▶ Watch Demo
            </a>
          )}

          {/* Pickup windows */}
          {itemData.pickupWindows.length > 0 && (
            <div className="text-sm text-foreground/60">
              <span className="font-medium text-foreground/80">Available: </span>
              {itemData.pickupWindows.join(", ")}
            </div>
          )}
        </div>
      </div>

      {/* Description rendered inside LocalizedItemContent above (two-column right column) */}

      {/* Textbook section */}
      {(itemData.isbn || itemData.course) && (
        <div className="mt-6">
          <TextbookBadge
            course={itemData.course}
            edition={itemData.edition}
            isbn={itemData.isbn}
            semesterListed={itemData.semesterListed}
          />
        </div>
      )}

      {/* Metadata table */}
      <div className="mt-8">
        <MetadataTable item={itemData} />
      </div>

      {/* Tags */}
      {itemData.tags.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {itemData.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-full bg-foreground/5 px-3 py-1 text-xs text-foreground/50 ring-1 ring-inset ring-foreground/10"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Contact section */}
      <div className="mt-10 border-t-0 pt-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-foreground/40">
          Contact Seller
        </h2>
        <ContactSection
          item={itemData}
          preferredPayment={itemData.preferredPayment}
          contactNote={itemData.contactNote}
        />
      </div>

      {/* Share + Recently Viewed */}
      <div className="mt-8 flex items-center gap-3">
        <ShareButton title={itemData.name} />
      </div>

      {/* Records this item in sessionStorage; populates the strip on other pages */}
      <RecentlyViewed
        itemSlug={`${category}/${item}`}
        itemName={itemData.name}
        itemCoverImage={itemData.coverImage}
      />
    </DistancePricingProvider>
  );
}
