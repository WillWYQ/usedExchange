import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { siteConfig } from "@/content/config";
import { loadCategories, loadItemsByCategory } from "@/lib/content/loader";
import { resolveItemPrice } from "@/lib/utils/pricing";
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
import { ItemGallery } from "@/components/item/ItemGallery";
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
      const items = await loadItemsByCategory(cat.slug);
      for (const it of items) {
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

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: categoryMeta?.displayName ?? category, href: `/${category}` },
    { label: itemData.name },
  ];

  const jsonLdCrumbs = [
    { name: "Home", href: "/" },
    { name: categoryMeta?.displayName ?? category, href: `/${category}` },
    { name: itemData.name, href: `/${category}/${item}` },
  ];

  return (
    <>
      {/* JSON-LD structured data */}
      <JsonLd data={buildProductJsonLd(itemData, siteConfig.baseUrl)} />
      <JsonLd data={buildBreadcrumbJsonLd(jsonLdCrumbs, siteConfig.baseUrl)} />

      <Breadcrumb items={breadcrumbs} />

      {/* SOLD banner */}
      {isSold && (
        <div
          role="alert"
          className="mb-6 mt-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm font-semibold text-red-300"
        >
          {siteConfig.i18n.strings.soldBanner || "This item has been sold"}
          {itemData.soldDate && (
            <span className="ml-2 font-normal text-red-300/70">
              on {new Date(itemData.soldDate).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-10 lg:grid-cols-2">
        {/* Left column — gallery */}
        <div>
          <ItemGallery images={itemData.images} itemName={itemData.name} />
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
              <span className="inline-flex items-center rounded-full bg-orange-500/20 px-2.5 py-0.5 text-xs font-medium text-orange-300 ring-1 ring-inset ring-orange-500/30">
                Price Reduced
              </span>
            )}
            {itemData.noLowball && (
              <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/60 ring-1 ring-inset ring-white/20">
                Firm Price
              </span>
            )}
          </div>

          {/* Name + freshness */}
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold text-white sm:text-3xl">
              {itemData.name}
            </h1>
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
                  className="inline-flex items-center gap-2 rounded-full bg-violet-600/80 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                >
                  Pay Deposit
                </a>
              )}
              {itemData.venmoPaymentRequest && (
                <a
                  href={itemData.venmoPaymentRequest}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-blue-600/80 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
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
              className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/60 transition-colors hover:border-white/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              ▶ Watch Demo
            </a>
          )}

          {/* Pickup windows */}
          {itemData.pickupWindows.length > 0 && (
            <div className="text-sm text-white/60">
              <span className="font-medium text-white/80">Available: </span>
              {itemData.pickupWindows.join(", ")}
            </div>
          )}
        </div>
      </div>

      {/* Description — full width below the two-column block */}
      {itemData.description && (
        <div className="prose prose-invert mt-8 max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {itemData.description}
          </ReactMarkdown>
        </div>
      )}

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
              className="inline-flex items-center rounded-full bg-white/5 px-3 py-1 text-xs text-white/50 ring-1 ring-inset ring-white/10"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Contact section */}
      <div className="mt-10 border-t border-white/10 pt-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/40">
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
    </>
  );
}
