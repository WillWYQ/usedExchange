import type { UIConfig } from "@/lib/ui/types";

export type Platform =
  | {
      type: string;
      value: string;
      qr_image?: never;
      label?: string;
    }
  | {
      type: string;
      value?: string;
      qr_image: string;
      label: string;
    };

export type SiteConfig = {
  // Identity
  name: string;
  tagline: string;
  logo: string;

  // Deployment
  deploymentMode: "static" | "vercel";
  baseUrl: string;

  // Image storage
  imageStorage: {
    provider: "cloudflare-r2" | "vercel-blob" | "local";
  };

  // Seller location (required — no default; must be configured before deploy)
  location: {
    lat: number;
    lng: number;
    label: string;
  };

  // Content defaults
  currency: string;
  recentlyListedCount: number;
  soldItemRetentionDays: number;

  // Contact
  contact: {
    reveal_behavior: "click" | "always";
    platforms: Platform[];
  };

  // Home page
  hero: {
    cta_label: string;
    cta_href: string;
  };

  // SEO
  meta: {
    description: string;
    twitterHandle: string;
  };

  // UI Component Slots
  ui: UIConfig;

  // Dark mode
  darkMode: "media" | "class";

  // Analytics
  analytics: {
    vercel: boolean;
    speedInsights: boolean;
  };

  // Full-text search
  search: {
    enabled: boolean;
    placeholder: string;
  };

  // Sitemap
  sitemap: {
    enabled: boolean;
  };

  // Internationalisation
  i18n: {
    defaultLocale: string;
    availableLocales: string[];
    showLocaleSwitcher: boolean;
    strings: {
      heroTagline: string;
      recentlyListed: string;
      browseAll: string;
      makeOffer: string;
      contactSeller: string;
      soldBanner: string;
    };
  };
};
