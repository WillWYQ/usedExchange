import type { Metadata } from "next";
import { siteConfig } from "@/content/config";
import { loadBrowseAllPageData } from "@/lib/content/loader";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { ItemGrid } from "@/components/item/ItemGrid";

export const metadata: Metadata = {
  title: `Browse All — ${siteConfig.name}`,
  description: `All available second-hand items listed by ${siteConfig.name}.`,
  openGraph: {
    title: `Browse All — ${siteConfig.name}`,
    description: `All available second-hand items listed by ${siteConfig.name}.`,
  },
};

export default async function BrowseAllPage() {
  // Single-pass load — parses every item exactly once and derives both the
  // visible cross-category item list and category metadata for the header count.
  const { items, categories } = await loadBrowseAllPageData();

  const browseAllLabel = siteConfig.i18n.strings.browseAll || "Browse All";

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: browseAllLabel },
        ]}
      />

      <header className="mb-6 mt-4">
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
          {browseAllLabel}
        </h1>
        <p className="mt-1.5 text-foreground/60">
          {items.length} item{items.length !== 1 ? "s" : ""} across{" "}
          {categories.length} categor{categories.length !== 1 ? "ies" : "y"}
        </p>
      </header>

      {/* browseAll={true} adds the category chip to each item card */}
      {items.length === 0 ? (
        <p className="py-16 text-center text-foreground/40">No items available.</p>
      ) : (
        <ItemGrid items={items} browseAll />
      )}
    </>
  );
}
