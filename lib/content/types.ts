export type Condition = "new" | "like-new" | "good" | "fair" | "for-parts";

export type Status = "available" | "pending" | "reserved" | "sold" | "draft";

export type Dimensions = {
  length: number;
  width: number;
  height: number;
  unit: "cm" | "in";
};

export type Weight = {
  value: number;
  unit: "kg" | "lb";
};

// miles_max absent (key missing) = open-ended tier; matches Infinity distance.
// A large number (e.g. 99999) is NOT open-ended. See DESIGN.md §17.
export type PriceTier = {
  label: string;
  miles_min?: number;
  miles_max?: number;
  amount: number;
};

export type Price = {
  currency: string;
  tiers: PriceTier[];
  negotiable: boolean;
  // Whether buyers may expand the "View all pricing tiers" toggle on the item
  // detail page. Default false — sellers may not want buyers comparing tiers
  // (e.g. seeing that pickup is much cheaper than shipping).
  show_tiers: boolean;
  // Overrides siteConfig.shipping.defaultPayer for this item. See
  // lib/utils/shipping.ts and DESIGN.md §21.
  shipping_payer?: "seller" | "buyer";
};

// Full Item type — all camelCase fields from item.json with defaults applied by loader.
// reserved_for is intentionally excluded: it is private buyer info, never rendered.
export type Item = {
  // Slugs resolved by loader (not in item.json)
  categorySlug: string;
  itemSlug: string;

  // Identity
  name: string;
  description: string;
  condition: Condition;
  status: Status;

  // Pricing
  price: Price;
  noLowball: boolean;
  priceReduced: boolean;
  previousLowestPrice: number | null;
  minAcceptableOffer: number | null;

  // Item details
  brand: string;
  model: string;
  ageYears: number | null;
  dimensions: Dimensions | null;
  weight: Weight | null;
  color: string;
  quantity: number;

  // Provenance
  originalSource: string;
  originalLink: string;
  originalPrice: number | null;

  // Listing lifecycle
  listedDate: string; // ISO 8601; defaults to build date
  soldDate: string | null;

  // Contact preferences (item-level overrides; site config is the default)
  preferredPayment: string[];
  contactNote: string;

  // Payment links
  stripePaymentLink: string;
  venmoPaymentRequest: string;

  // Logistics
  pickupWindows: string[];
  youtubeLink: string;

  // Categorisation
  tags: string[];
  categoryOverride: string; // display-only; does not change URL or category routing

  // SEO
  metaDescription: string; // auto-generated from description if empty

  // Textbook-specific fields (gracefully ignored for non-textbooks)
  isbn: string;
  course: string;
  edition: string;
  semesterListed: string;

  // Internationalisation — shown when active locale matches
  nameZh: string;
  descriptionZh: string;

  // Resolved by loader: manifest[key] → CDN URL, or /items/{key} local fallback
  images: string[];
  coverImage: string | null;
};

export type Category = {
  slug: string;
  displayName: string; // from _category.json display_name, or auto-capitalised slug
  description: string;
  icon: string; // emoji; default ""
  sortOrder: number | null; // null = sort alphabetically after ordered group
  availableItemCount: number; // items with status "available" only
  coverImage: string | null; // first available item's cover image URL; null if none
};

// Geolocation hook state — see DESIGN.md §17.
// "idle" must be treated identically to "pending" in all rendering code.
export type GeolocationState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "granted"; lat: number; lng: number }
  | { status: "denied" }
  | { status: "unavailable" };

// Distance resolution result — passed to resolveItemPrice(). See DESIGN.md §17.
// "fallback" is returned when geo is idle/pending/denied/unavailable,
// and triggers the highest-price tier (open-ended or highest amount).
export type ResolvedDistance =
  | { source: "detected"; miles: number }
  | { source: "manual"; miles: number }
  | { source: "fallback" };
