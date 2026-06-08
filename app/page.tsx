import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { siteConfig } from "@/content/config";
import { loadHomePageData } from "@/lib/content/loader";
import { isTemplateConfigured } from "@/lib/utils/templateStatus";
import { CategoryGrid } from "@/components/category/CategoryGrid";
import { RecentlyListedSection } from "@/components/home/RecentlyListedSection";
import { RecentlyViewed } from "@/components/common/RecentlyViewed";
import { ProjectIntro } from "@/components/intro/ProjectIntro";

// Memoised per-request so generateMetadata and HomePage share one parse pass.
const getHomePageData = cache(loadHomePageData);

export async function generateMetadata(): Promise<Metadata> {
  // Before the seller configures their store, "/" shows the project intro —
  // describe that page rather than an (empty) catalog in metadata.
  if (!isTemplateConfigured()) {
    return {
      title: `${siteConfig.name} — UsedExchange template`,
      description:
        "An open-source, file-driven, database-free storefront template for selling second-hand items.",
    };
  }

  const { recentItems } = await getHomePageData();
  const ogImage = recentItems[0]?.coverImage ?? (siteConfig.logo || undefined);

  return {
    title: siteConfig.name,
    description: siteConfig.meta.description,
    openGraph: {
      title: siteConfig.name,
      description: siteConfig.meta.description,
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
  };
}

export default async function HomePage() {
  // Show the project introduction until the seller points baseUrl at a real
  // domain — see lib/utils/templateStatus.ts. Afterwards it lives at /about.
  if (!isTemplateConfigured()) {
    return <ProjectIntro />;
  }

  const { categories, recentItems } = await getHomePageData();

  const tagline = siteConfig.i18n.strings.heroTagline || siteConfig.tagline;

  return (
    <>
      {/* ── Hero ── */}
      <section className="mb-16 text-center">
        <h1 className="mb-3 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          {siteConfig.name}
        </h1>
        <p className="mb-7 text-lg text-foreground/60">{tagline}</p>
        <Link
          href={siteConfig.hero.cta_href}
          className="inline-flex rounded-full bg-foreground px-7 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {siteConfig.hero.cta_label}
        </Link>
      </section>

      {/* ── Category grid ── */}
      <section
        id="categories"
        aria-labelledby="categories-heading"
        className="mb-14"
      >
        <h2
          id="categories-heading"
          className="mb-4 text-xl font-semibold text-foreground"
        >
          Browse by Category
        </h2>
        <CategoryGrid categories={categories} />
      </section>

      {/* ── Recently listed (client — owns geo state) ── */}
      <div className="mb-14">
        <RecentlyListedSection items={recentItems} />
      </div>

      {/* ── Recently viewed (client — hidden on first visit) ── */}
      <RecentlyViewed />
    </>
  );
}
