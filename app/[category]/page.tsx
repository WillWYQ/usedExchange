import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { siteConfig } from "@/content/config";
import { loadCategories, loadItemsByCategory } from "@/lib/content/loader";
import { isValidSlug } from "@/lib/utils/slug";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { ItemGrid } from "@/components/item/ItemGrid";

// Memoised per request so generateMetadata and the page component share one parse pass.
const getPageData = cache(async (slug: string) => {
  const [categories, items] = await Promise.all([
    loadCategories(),
    loadItemsByCategory(slug),
  ]);
  const category = categories.find((c) => c.slug === slug) ?? null;
  return { category, items };
});

export async function generateStaticParams() {
  const categories = await loadCategories();
  return categories
    .filter((c) => {
      if (!isValidSlug(c.slug)) {
        console.warn(`[generateStaticParams] skipping category with unsafe slug: "${c.slug}"`);
        return false;
      }
      return true;
    })
    .map((c) => ({ category: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category: slug } = await params;
  const { category, items } = await getPageData(slug);

  const displayName = category?.displayName ?? slug;
  const description =
    category?.description || `Browse second-hand ${displayName} items.`;
  const ogImage =
    items.find((i) => i.status === "available")?.coverImage ?? undefined;

  return {
    title: `${displayName} — ${siteConfig.name}`,
    description,
    openGraph: {
      title: displayName,
      description,
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category: slug } = await params;
  const { category, items } = await getPageData(slug);

  // In static-export mode (the default — see content/config.ts), this branch is
  // unreachable: generateStaticParams is the sole source of truth for which paths
  // get written to disk, and `category` is non-null for every emitted slug (it's
  // derived from the same directory listing). The guard only matters in
  // deploymentMode "vercel", where `dynamicParams` allows on-demand rendering of
  // slugs that weren't pre-generated.
  if (siteConfig.deploymentMode === "vercel" && category === null) {
    notFound();
  }

  const displayName = category?.displayName ?? slug;
  const icon = category?.icon ?? "";
  const description = category?.description ?? "";
  const browseAllLabel = siteConfig.i18n.strings.browseAll || "Browse All";

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: displayName },
        ]}
      />

      {/* Category header */}
      <header className="mb-6 mt-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground sm:text-3xl">
          {icon && <span aria-hidden="true">{icon}</span>}
          {displayName}
        </h1>
        {description && (
          <p className="mt-1.5 text-foreground/60">{description}</p>
        )}
      </header>

      {/* Item grid with filter bar (client) or empty state */}
      {items.length === 0 ? (
        <p className="py-16 text-center text-foreground/40">
          No items currently available in this category.
        </p>
      ) : (
        <ItemGrid items={items} />
      )}

      {/* "Browse All" — prominent link in page body (distinct from header nav) */}
      <div className="mt-10 text-center">
        <Link
          href="/all"
          className="inline-flex rounded-full border border-foreground/20 px-5 py-2 text-sm text-foreground/60 transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50"
        >
          {browseAllLabel} →
        </Link>
      </div>
    </>
  );
}
