import { siteConfig } from "@/content/config";

// The starter value shipped in content/config.ts. As long as a seller hasn't
// replaced it with their real domain, the site is still in "template" state —
// see scripts/check-config.ts, which fails the production build on the same
// signal. Both places must agree on this string.
export const PLACEHOLDER_DOMAIN = "your-domain.com";

/**
 * True once the seller has pointed `baseUrl` at a real domain. Used to decide
 * whether `/` shows the project-introduction page (template / pre-setup) or
 * the seller's actual storefront (configured) — see app/page.tsx and
 * app/about/page.tsx.
 */
export function isTemplateConfigured(): boolean {
  return !siteConfig.baseUrl.includes(PLACEHOLDER_DOMAIN);
}
