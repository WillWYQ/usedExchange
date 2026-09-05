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

  // Default price tiers written into every new item.json created by `pnpm create-item`.
  // Each tier must have a `label` and `amount` (set to 0 as a placeholder).
  // Tiers with `miles_max` are local pickup tiers; tiers without are shipping tiers.
  // When absent, a built-in 3-tier default (pickup ≤5mi / 6–15mi / Shipping) is used.
  defaultPriceTiers?: Array<{
    label: string;
    miles_min?: number;
    miles_max?: number;
    amount: number;
  }>;
  // Caps how many sold items render on /sold (0 = no cap). See content/config.ts.
  // Optional per Iron Rule 8: read with `?? 200` in app/sold/page.tsx, and
  // migrate-config can splice it into older configs (scripts/lib/configDefaults.ts).
  soldArchiveDisplayLimit?: number;
  // Default unit system: "metric" (cm/kg) | "imperial" (in/lb).
  // Sets the dimensions.unit/weight.unit defaults `pnpm create-item` writes
  // into new item.json files, and the fallback display unit for
  // dimensions/weight on item pages (see lib/utils/units.ts). Per-item
  // dimensions/weight are always stored in whatever unit the seller entered
  // and converted for display — this only controls the target unit.
  measurementUnit?: "metric" | "imperial";

  // Contact
  contact: {
    reveal_behavior: "click" | "always";
    platforms: Platform[];
    // External scheduling link (Calendly/Cal.com/Google Calendar appointment
    // page). When set, item detail pages show a "Schedule Viewing" button
    // that opens it in a new tab. Optional per Iron Rule 8 — omit or leave
    // "" to disable; no default is injected because there's no universally
    // sensible URL (see scripts/lib/configDefaults.ts, which splices in an
    // empty-string placeholder for downstream configs).
    schedulingUrl?: string;
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
    // GA4 Measurement ID (e.g. "G-XXXXXXXXXX"). Leave unset/empty to disable.
    googleAnalyticsId?: string;
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

  // Contact-form enquiry relay (optional — see docs/FEATURES_ROADMAP.md §3.1)
  // Absent or enabled: false → EnquiryForm renders nothing; zero impact.
  notifications?: {
    enabled: boolean;
    // Cloudflare Worker proxy URL (holds the Discord/Telegram/Resend secret
    // server-side). See workers/contact-form-proxy/README.md.
    proxyUrl: string;
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
    // Per-locale override of `measurementUnit` (see lib/utils/units.ts).
    // E.g. { en: "imperial" } shows in/lb for English visitors while other
    // locales fall back to the top-level `measurementUnit`. Optional —
    // omit entirely for a single global unit system.
    localeMeasurementUnits?: Partial<Record<string, "metric" | "imperial">>;
  };

  // Seller Studio — optional override of built-in UI strings.
  // Any locale with a built-in Studio dictionary ships with the template.
  // This field lets sellers add strings for locales the template doesn't
  // ship, or override individual keys. Optional per Iron Rule 8: read with
  // `?? {}` in the studio API handler.
  studio?: {
    translations?: Record<string, Record<string, string>>;
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

  // Pickup scheduling link button (app/[category]/[item]/page.tsx) — shown
  // only when siteConfig.contact.schedulingUrl is set.
  scheduleViewing: string;

  // Make-offer form
  makeOffer: string;
  yourOffer: string;
  send: string;
  belowMinimumOffer: string;

  // Enquiry form (components/contact/EnquiryForm.tsx) — item detail page
  // only, shown when siteConfig.notifications is enabled with a proxyUrl
  enquiryFormHeading: string;
  enquiryNameLabel: string;
  enquiryContactLabel: string;
  enquiryContactPlaceholder: string;
  enquiryMessageLabel: string;
  enquiryMessagePlaceholder: string;
  enquiryOfferLabel: string;
  enquirySubmit: string;
  enquirySubmitting: string;
  enquirySuccess: string;
  enquiryError: string;

  // Share button
  share: string;
  copied: string;
  linkCopied: string;

  // Flyer button (components/item/FlyerButton.tsx)
  downloadFlyer: string;
  generatingFlyer: string;
  flyerDownloaded: string;
  flyerLoadError: string;
  flyerGenerateError: string;
  flyerUnsupported: string;

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
  // Course filter chips on category pages — shown only when the category has
  // items with a non-empty `course` field (textbooks).
  filterCourse: string;
  // Tag filter chips on category pages — shown only when the item set has at
  // least one non-empty `tags` entry. Multi-select (AND matching); see
  // components/filters/useFilters.ts.
  filterTags: string;
  filterPriceBucketAll: string;
  filterPriceIncludesOutliers: string;
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
  // Tag filter page (/tags/[tag]) heading — "{tag}" is replaced with the
  // canonical (un-slugified) tag string, e.g. "Tagged: CS101".
  tagPageHeading: string;

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

  // Newly Listed page
  newlyListed: string;
  newlyListedSinceLastVisit: string;
  newlyListedToday: string;
  newlyListedThisWeek: string;
  newlyListedFirstVisit: string;
  newlyListedNoneInPeriod: string;

  // Catalog PDF export chrome (Seller Studio, scripts/lib/pdfCatalog/template.ts)
  pdfTocHeading: string;
  pdfCoverHeading: string;
  pdfCoverMeta: string;
  pdfGeneratedOn: string;
  pdfViewLiveListing: string;
  pdfFooterPage: string;
  pdfFooterOf: string;
  pdfAveragePriceLabel: string;
  pdfCategoryItemCount: string;
  condition: string;

  // Catalog PDF seller-contact accessibility (scripts/lib/pdfCatalog/contactLinks.ts)
  pdfContactHeading: string;
  pdfContactIntro: string;
  pdfContactScanHint: string;
  pdfItemContactHeading: string;
  pdfEmailAboutItem: string;
  pdfMessageOnDiscord: string;
};
