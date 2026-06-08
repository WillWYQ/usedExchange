import { siteConfig } from "@/content/config";

// The starter value shipped in content/config.ts. As long as a seller hasn't
// replaced it with their real domain, the site is still in "template" state —
// see scripts/check-config.ts, which fails the production build on the same
// signal. Both places must agree on this string.
export const PLACEHOLDER_DOMAIN = "your-domain.com";

// The template's own showcase deployment — demonstrates UsedExchange itself
// rather than a seller's storefront. Even though its baseUrl is a real
// domain, "/" should keep showing ProjectIntro instead of switching to the
// catalog view.
export const DEMO_DOMAIN = "usedexchangeproject.willsleep.dev";

/**
 * True once the seller has pointed `baseUrl` at a real domain. Used to decide
 * whether `/` shows the project-introduction page (template / pre-setup, or
 * the template's own demo deployment) or the seller's actual storefront
 * (configured) — see app/page.tsx and app/about/page.tsx.
 */
export function isTemplateConfigured(): boolean {
  return (
    !siteConfig.baseUrl.includes(PLACEHOLDER_DOMAIN) &&
    !siteConfig.baseUrl.includes(DEMO_DOMAIN)
  );
}
