// The UI string keys every enabled locale must resolve, either in its own
// translations entry or via the default locale's entry.
//
// Extracted from scripts/check-config.ts so scripts/lib/siteReadiness.ts can
// apply the same rule without importing that file — check-config.ts calls
// main() at module scope, so importing it would run the build checker as a
// side effect.

import type { UIStrings } from "@/lib/config/types";

export const REQUIRED_UI_STRING_KEYS: (keyof UIStrings)[] = [
  "home", "about", "browseAll",
  "recentlyListed", "recentlyViewed", "categoriesHeading",
  "contactSeller", "itemSold", "preferredPayment",
  "makeOffer", "yourOffer", "send", "belowMinimumOffer",
  "share", "copied", "linkCopied",
  "brand", "model", "age", "color", "dimensions", "weight",
  "originalSource", "originalPrice",
  "conditionNew", "conditionLikeNew", "conditionGood", "conditionFair", "conditionForParts",
  "statusAvailable", "statusPending", "statusReserved", "statusSold", "statusDraft",
  "filterShowSold", "filterPrice",
  "sortBy", "sortNewestFirst", "sortPriceLow", "sortPriceHigh", "sortConditionBest",
  "listed",
  "soldBanner",
  "soldArchiveTitle",
  "conditionGuideTitle",
  "conditionNewDesc", "conditionLikeNewDesc", "conditionGoodDesc",
  "conditionFairDesc", "conditionForPartsDesc",
  "detectingLocation", "fromSeller", "locationDetected",
  "enterManually", "distanceManualLabel", "distanceUnit", "distanceInputLabel",
  "apply", "pricesAtPickupRate", "enterDistance", "edit", "clear",
  "contactForPrice", "contactForPricingShort",
  "pricingLabelHeader", "pricingDistanceHeader", "pricingPriceHeader",
  "pickup", "obo", "hidePricingTiers", "viewAllPricingTiers",
  "menuOpen", "menuClose",
];
