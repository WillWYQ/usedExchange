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
  // Caps how many sold items render on /sold (0 = no cap). See content/config.ts.
  soldArchiveDisplayLimit: number;

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

  // Shipping calculator (optional — see DESIGN.md §21)
  // Absent or enabled: false → ShippingEstimator renders nothing; zero impact.
  shipping?: {
    enabled: boolean;
    // Cloudflare Worker proxy URL (holds the carrier API key server-side).
    proxyUrl: string;
    // Who pays for shipping by default; per-item override via price.shipping_payer.
    defaultPayer: "seller" | "buyer";
    origin: {
      zip: string;
      country: string; // ISO 3166-1 alpha-2, e.g. "US"
    };
  };

  // Internationalisation
  i18n: {
    defaultLocale: string;
    availableLocales: string[];
    showLocaleSwitcher: boolean;
    // Per-locale UI string overrides. Keys must match UIStrings.
    // The default locale's entry is the source-of-truth; other locales
    // fall back to it for any missing key. Add one entry per locale listed
    // in availableLocales — check-config validates completeness at build time.
    translations: Record<string, Partial<UIStrings>>;
  };
};

// All UI labels that can be localised. Every key must have a value in the
// default locale's translations entry; other locales may omit keys and will
// fall back to the default locale value.
export type UIStrings = {
  // Navigation
  home: string;
  about: string;
  browseAll: string;

  // Section headings
  recentlyListed: string;
  recentlyViewed: string;
  categoriesHeading: string;

  // Contact
  contactSeller: string;
  itemSold: string;
  preferredPayment: string;

  // Make-offer form
  makeOffer: string;
  yourOffer: string;
  send: string;
  belowMinimumOffer: string;

  // Share button
  share: string;
  copied: string;
  linkCopied: string;

  // Item metadata table labels
  brand: string;
  model: string;
  age: string;
  color: string;
  dimensions: string;
  weight: string;
  originalSource: string;
  originalPrice: string;

  // Condition badge labels
  conditionNew: string;
  conditionLikeNew: string;
  conditionGood: string;
  conditionFair: string;
  conditionForParts: string;

  // Status badge labels
  statusAvailable: string;
  statusPending: string;
  statusReserved: string;
  statusSold: string;
  statusDraft: string;

  // Filter bar
  filterShowSold: string;
  filterPrice: string;
  sortBy: string;
  sortNewestFirst: string;
  sortPriceLow: string;
  sortPriceHigh: string;
  sortConditionBest: string;

  // Freshness label
  listed: string;

  // Page titles and banners (used in server-rendered markup)
  soldBanner: string;
  soldArchiveTitle: string;

  // Condition guide panel
  conditionGuideTitle: string;
  conditionNewDesc: string;
  conditionLikeNewDesc: string;
  conditionGoodDesc: string;
  conditionFairDesc: string;
  conditionForPartsDesc: string;

  // Location / distance price bar
  detectingLocation: string;
  fromSeller: string;
  locationDetected: string;
  enterManually: string;
  distanceManualLabel: string;
  distanceUnit: string;
  distanceInputLabel: string;
  apply: string;
  pricesAtPickupRate: string;
  enterDistance: string;
  edit: string;
  clear: string;

  // Pricing table
  contactForPrice: string;
  contactForPricingShort: string;
  pricingLabelHeader: string;
  pricingDistanceHeader: string;
  pricingPriceHeader: string;
  pickup: string;
  obo: string;
  hidePricingTiers: string;
  viewAllPricingTiers: string;

  // Shipping estimator (optional — see DESIGN.md §21)
  shippingEstimateLabel: string;
  shippingZipPlaceholder: string;
  shippingCalculating: string;
  shippingUnavailable: string;
  shippingIncludedBySeller: string;
  shippingEstimateSuffix: string;

  // Mobile nav drawer
  menuOpen: string;
  menuClose: string;
};
