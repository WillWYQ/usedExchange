import type { Metadata } from "next";
import { siteConfig } from "@/content/config";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { ProjectIntro } from "@/components/intro/ProjectIntro";

const ABOUT_DESCRIPTION =
  "About this site: it runs on UsedExchange, an open-source, file-driven, database-free storefront template for selling second-hand items.";

export const metadata: Metadata = {
  title: "About",
  description: ABOUT_DESCRIPTION,
  openGraph: {
    title: `About — ${siteConfig.name}`,
    description: ABOUT_DESCRIPTION,
  },
};

// Permanent home for the project introduction. Before the seller configures
// their store, the same content is shown at "/" instead (see app/page.tsx);
// once configured, "/" becomes the catalog and this page keeps the
// introduction reachable for visitors curious about the template.
export default function AboutPage() {
  return (
    <>
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "About" }]} />
      <div className="mt-4">
        <ProjectIntro />
      </div>
    </>
  );
}
