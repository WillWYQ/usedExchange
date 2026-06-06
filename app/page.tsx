import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/content/config";
import { loadCategories, loadAllItems } from "@/lib/content/loader";
import { CategoryGrid } from "@/components/category/CategoryGrid";
import { RecentlyListedSection } from "@/components/home/RecentlyListedSection";
import { RecentlyViewed } from "@/components/common/RecentlyViewed";

export async function generateMetadata(): Promise<Metadata> {
  const items = await loadAllItems();
  const ogImage = items[0]?.coverImage ?? (siteConfig.logo || undefined);

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
  const [categories, recentItems] = await Promise.all([
    loadCategories(),
    loadAllItems(),
  ]);

  const tagline = siteConfig.i18n.strings.heroTagline || siteConfig.tagline;

  return (
    <>
      {/* ── Hero ── */}
      <section className="mb-16 text-center">
        <h1 className="mb-3 text-4xl font-bold tracking-tight text-white sm:text-5xl">
          {siteConfig.name}
        </h1>
        <p className="mb-7 text-lg text-white/60">{tagline}</p>
        <Link
          href={siteConfig.hero.cta_href}
          className="inline-flex rounded-full bg-white px-7 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
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
          className="mb-4 text-xl font-semibold text-white"
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
