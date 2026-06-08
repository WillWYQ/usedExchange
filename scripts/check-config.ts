// scripts/check-config.ts — fail the build early if content/config.ts still
// has placeholder values that would silently ship to production.
//
// `siteConfig.baseUrl` feeds canonical URLs, Open Graph `url`, and JSON-LD
// `url`/`item` fields (see app/layout.tsx, app/[category]/[item]/page.tsx,
// lib/utils/jsonld.ts). `new URL(siteConfig.baseUrl)` does NOT throw for the
// shipped placeholder "https://your-domain.com" — it's a perfectly valid URL —
// so a seller who forgets to update it gets a successful build that quietly
// publishes wrong canonical/OG/JSON-LD URLs (an SEO footgun with no error to
// notice). Run this before every build to catch that class of mistake loudly.

import { siteConfig } from "@/content/config";

const PLACEHOLDER = "your-domain.com";

function main(): void {
  if (siteConfig.baseUrl.includes(PLACEHOLDER)) {
    console.error(
      `\n[check-config] siteConfig.baseUrl is still the placeholder ("${siteConfig.baseUrl}").\n` +
        `  Set it to your real deployed domain in content/config.ts before building for production —\n` +
        `  otherwise canonical URLs, Open Graph tags, and JSON-LD will all point at "${PLACEHOLDER}".\n`,
    );
    process.exit(1);
  }
}

main();
