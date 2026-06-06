import { siteConfig } from "@/content/config";

// Build timestamp is computed at static-export time (correct "last updated" value).
// ContactSection slot wired in Phase 10.
export function SiteFooter() {
  const buildDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <footer className="mt-16 border-t border-white/10 bg-black/60 px-4 py-10 text-center text-sm text-white/50">
      {/* ContactSection slot — Phase 10 */}

      <p className="mt-4">
        {siteConfig.name} &middot; Last updated {buildDate}
      </p>
    </footer>
  );
}
