import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { siteConfig } from "@/content/config";
import { loadTagIndex } from "@/lib/content/loader";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { ItemGrid } from "@/components/item/ItemGrid";
import { getTranslations } from "@/lib/i18n/getTranslations";

// Memoised per request so generateMetadata and the page component share one
// loadTagIndex() pass (which itself is a single loadAllItemsRaw() parse —
// see lib/content/loader.ts).
const getPageData = cache(async (slug: string) => {
  const index = await loadTagIndex();
  return index.get(slug) ?? null;
});

// The index's keys are exactly the valid, collision-free, isValidSlug-safe
// tag routes — see loadTagIndex's own doc comment for why that filtering
// lives there rather than here (it must happen in the same pass that groups
// items by tag).
export async function generateStaticParams() {
  const index = await loadTagIndex();
  return [...index.keys()].map((slug) => ({ tag: slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tag: string }>;
}): Promise<Metadata> {
  const { tag: slug } = await params;
  const entry = await getPageData(slug);

  const tagName = entry?.tag ?? slug;
  const description = `Items tagged "${tagName}", listed by ${siteConfig.name}.`;

  return {
    title: `#${tagName} — ${siteConfig.name}`,
    description,
    openGraph: {
      title: `#${tagName}`,
      description,
    },
  };
}

export default async function TagPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag: slug } = await params;
  const entry = await getPageData(slug);

  // In static-export mode (the default), generateStaticParams is the sole
  // source of truth for which paths get written to disk, so `entry` is
  // non-null for every emitted slug. This guard only matters in
  // deploymentMode "vercel", where dynamicParams allows on-demand rendering
  // of a slug that wasn't pre-generated (e.g. it never matched a visible
  // item's tag, or its slug collided with another tag's — see loadTagIndex).
  if (siteConfig.deploymentMode === "vercel" && entry === null) {
    notFound();
  }

  const tagName = entry?.tag ?? slug;
  const items = entry?.items ?? [];
  const t = getTranslations();

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: `#${tagName}` },
        ]}
      />

      <header className="mb-6 mt-4">
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
          {t.tagPageHeading.replace("{tag}", tagName)}
        </h1>
        <p className="mt-1.5 text-foreground/60">
          {items.length} item{items.length !== 1 ? "s" : ""}
        </p>
      </header>

      {/* browseAll={true} adds the category chip to each item card, since
          tags span every category. */}
      {items.length === 0 ? (
        <p className="py-16 text-center text-foreground/40">
          No items match this tag.
        </p>
      ) : (
        <ItemGrid items={items} browseAll />
      )}
    </>
  );
}
