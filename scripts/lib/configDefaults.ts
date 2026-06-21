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
    key: "filterPriceBucketAll",
    afterKey: "filterPrice:",
    lines: [
      '        filterPriceBucketAll: "All prices",',
      '        filterPriceIncludesOutliers: "+ items outside range",',
    ],
  },
];
