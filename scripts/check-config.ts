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
import { PLACEHOLDER_DOMAIN } from "@/lib/utils/templateStatus";
import type { UIStrings } from "@/lib/config/types";

// All keys that must be present for every enabled locale.
const REQUIRED_KEYS: (keyof UIStrings)[] = [
  "home", "about", "browseAll",
  "recentlyListed", "recentlyViewed",
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
  "enterManually", "distanceManualLabel", "distanceUnit",
  "apply", "pricesAtPickupRate", "enterDistance", "edit", "clear",
  "contactForPrice", "contactForPricingShort",
  "pricingLabelHeader", "pricingDistanceHeader", "pricingPriceHeader",
  "pickup", "obo", "hidePricingTiers", "viewAllPricingTiers",
  "menuOpen", "menuClose",
];

function main(): void {
  let failed = false;

  // ── Check 1: baseUrl placeholder ──────────────────────────────────────────
  if (siteConfig.baseUrl.includes(PLACEHOLDER_DOMAIN)) {
    console.error(
      `\n[check-config] siteConfig.baseUrl is still the placeholder ("${siteConfig.baseUrl}").\n` +
        `  Set it to your real deployed domain in content/config.ts before building for production —\n` +
        `  otherwise canonical URLs, Open Graph tags, and JSON-LD will all point at "${PLACEHOLDER_DOMAIN}".\n`,
    );
    failed = true;
  }

  // ── Check 2: translation completeness ────────────────────────────────────
  // Every locale in availableLocales must have a translations entry, and every
  // UIStrings key must be present in that entry (or in the default locale's
  // entry as a fallback). Missing keys mean the site silently shows English
  // text even when the user has selected another language.
  const { availableLocales, defaultLocale, translations } = siteConfig.i18n;
  const defaultDict = translations[defaultLocale] ?? {};

  for (const locale of availableLocales) {
    const dict = translations[locale] ?? {};
    const missing = REQUIRED_KEYS.filter(
      (k) => !dict[k] && !defaultDict[k],
    );

    if (!(locale in translations)) {
      console.error(
        `\n[check-config] Locale "${locale}" is listed in availableLocales but has no entry in i18n.translations.\n` +
          `  Add a translations.${locale} object to content/config.ts with all required keys.\n`,
      );
      failed = true;
    } else if (missing.length > 0) {
      console.error(
        `\n[check-config] translations.${locale} is missing ${missing.length} key(s): ${missing.join(", ")}.\n` +
          `  Fill them in under i18n.translations.${locale} in content/config.ts.\n`,
      );
      failed = true;
    }
  }

  if (failed) process.exit(1);
}

main();
