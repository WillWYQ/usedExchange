import { siteConfig } from "@/content/config";
import { ContactSection } from "@/components/contact/ContactSection";

// Build timestamp is computed at static-export time (correct "last updated" value).
export function SiteFooter() {
  const buildDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <footer className="mt-16 border-t border-border bg-background/60 px-4 py-10 text-sm text-foreground/50">
      {/* Footer contact — no item context, no preferred payment or note */}
      <div className="mx-auto mb-6 flex max-w-2xl justify-center">
        <ContactSection preferredPayment={[]} contactNote="" />
      </div>

      <p className="text-center">
        {siteConfig.name} &middot; Last updated {buildDate}
      </p>
    </footer>
  );
}
