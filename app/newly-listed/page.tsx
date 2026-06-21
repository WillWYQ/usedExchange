import type { Metadata } from "next";
import { siteConfig } from "@/content/config";
import { loadBrowseAllPageData } from "@/lib/content/loader";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { getTranslations } from "@/lib/i18n/getTranslations";
import { NewlyListedClient } from "@/components/newly-listed/NewlyListedClient";

const t = getTranslations();

export const metadata: Metadata = {
  title: `${t.newlyListed} — ${siteConfig.name}`,
  description: `Newly listed second-hand items from ${siteConfig.name}.`,
  openGraph: {
    title: `${t.newlyListed} — ${siteConfig.name}`,
    description: `Newly listed second-hand items from ${siteConfig.name}.`,
  },
};

export default async function NewlyListedPage() {
  const { items } = await loadBrowseAllPageData();
  const activeItems = items.filter((i) => i.status !== "sold");

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: t.newlyListed },
        ]}
      />

      <header className="mb-6 mt-4">
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
          {t.newlyListed}
        </h1>
      </header>

      <NewlyListedClient items={activeItems} />
    </>
  );
}
