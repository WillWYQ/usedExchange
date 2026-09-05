// Declarative registry of config fields that may be missing in downstream
// content/config.ts after a template upgrade. Each entry describes:
//   - key:       the field name to search for in the config source text
//   - afterKey:  the field after which to insert (anchor for placement)
//   - lines:     the exact lines to inject (including comments and trailing comma)
//
// When update-site detects a missing key it splices the lines into the config
// file right after the line containing `afterKey`. The format intentionally
// matches the upstream content/config.ts style so the result looks hand-written.
//
// Add new entries here whenever a new optional config field is introduced.
// Keep entries in the order they appear in content/config.ts.

export type ConfigDefault = {
  key: string;
  afterKey: string;
  lines: string[];
};

export const CONFIG_DEFAULTS: ConfigDefault[] = [
  {
    key: "soldArchiveDisplayLimit",
    afterKey: "soldItemRetentionDays:",
    lines: [
      "  // /sold renders every sold item ever (it's a permanent, ever-growing static",
      "  // page in a fully-exported site — there's no pagination at request time).",
      "  // Cap how many of the most-recent sold items are rendered so the exported",
      "  // HTML and build time don't grow unbounded over years of use. Older items",
      "  // remain in content/ (and count toward the header total) — only the grid",
      "  // is capped. Set to 0 to render every item with no cap.",
      "  soldArchiveDisplayLimit: 200,",
    ],
  },
  {
    key: "priceFilterStrategy",
    afterKey: "itemCard:",
    lines: [
      "    // Price filter outlier strategy:",
      '    //   "none"           — raw min/max (default)',
      '    //   "percentile"     — slider clamped to P5/P95',
      '    //   "logarithmic"    — non-linear slider scale',
      '    //   "preset-buckets" — quick-tap price range buttons',
      '    //   "iqr"            — slider clamped via interquartile range',
      '    priceFilterStrategy: "none",',
      '    // Custom bucket boundaries for "preset-buckets" (optional).',
      '    // Example: [50, 100, 300] → "< $50", "$50–$100", "$100–$300", "$300+"',
      "    // priceFilterBuckets: [50, 100, 300],",
    ],
  },
  {
    key: "googleAnalyticsId",
    afterKey: "speedInsights:",
    lines: [
      '    googleAnalyticsId: "", // paste your GA4 Measurement ID, e.g. "G-XXXXXXXXXX" — leave empty to disable',
    ],
  },
  {
    key: "filterPriceBucketAll",
    afterKey: "filterPrice:",
    lines: [
      '        filterPriceBucketAll: "All prices",',
      '        filterPriceIncludesOutliers: "+ items outside range",',
    ],
  },
  {
    key: "pdfTocHeading",
    afterKey: "filterPriceIncludesOutliers:",
    lines: [
      "",
      "        // ── Catalog PDF export chrome ────────────────────────────────────────",
      '        pdfTocHeading: "Table of Contents",',
      '        pdfCoverHeading: "Full Listing Catalog",',
      '        pdfCoverMeta: "{itemCount} items across {categoryCount} categories",',
      '        pdfGeneratedOn: "Generated {date}",',
      '        pdfViewLiveListing: "View Live Listing",',
      '        pdfFooterPage: "Page",',
      '        pdfFooterOf: "of",',
      '        pdfAveragePriceLabel: "Highlighted price (average): {amount}",',
      '        pdfCategoryItemCount: "{count} items in this category",',
      '        condition: "Condition",',
    ],
  },
  {
    // Seller-contact accessibility strings — a separate entry (not merged into
    // the pdfTocHeading block above) so it also backfills into downstream
    // configs that already have the older PDF-chrome keys but not these.
    //
    // Anchor caveat: `condition:` is the last key of that PDF-chrome block, but
    // it is NOT globally unique — a commented-out locale example (and any real
    // second locale) also contains the substring. migrate-config takes the
    // FIRST match, which on the standard config layout is the default locale's
    // fallback block, i.e. the intended line. Two known limits, both benign:
    // a config whose second locale defines `condition:` above the default
    // block would anchor there, and a config carrying `pdfTocHeading` but an
    // older block without a `condition:` line finds no anchor and is skipped
    // with a warning. In every such case the keys simply stay absent and
    // getTranslationsForLocale's EN_FALLBACK merge supplies the English
    // defaults at runtime — the PDF renders correctly, the seller just has no
    // config line to translate.
    key: "pdfContactHeading",
    afterKey: "condition:",
    lines: [
      "",
      "        // ── Catalog PDF seller-contact accessibility ─────────────────────────",
      '        pdfContactHeading: "Contact the Seller",',
      '        pdfContactIntro: "Scan a code or use a link below to reach the seller.",',
      '        pdfContactScanHint: "Scan to connect",',
      '        pdfItemContactHeading: "Contact seller about this item",',
      '        pdfEmailAboutItem: "Email about this item",',
      '        pdfMessageOnDiscord: "Message on Discord",',
    ],
  },
];
