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
    // Anchor: the closing line of the commented-out `shipping` example block
    // ("  // },", single space — the ONLY line in content/config.ts matching
    // this exact text; the inner `origin` close is "  //   }," with extra
    // indentation, and a later match inside the commented zh translations
    // block is textually identical but comes after this one, so
    // `lines.findIndex`'s first-match semantics still land here). Splicing
    // right after it places the new block between the shipping example and
    // the "── Contact ──" section, exactly where it ships upstream.
    key: "notifications",
    afterKey: "// },",
    lines: [
      "",
      "  // ── Contact-form enquiry relay (optional) ─────────────────────────────────",
      "  // Disabled by default — zero impact on the site until configured. To",
      "  // enable: deploy workers/contact-form-proxy (see its README), paste its",
      "  // URL below, and set enabled: true. Adds an enquiry form to the item",
      "  // detail page so buyers can message you (via Discord, Telegram, or email)",
      "  // without seeing your contact details directly. See",
      "  // docs/FEATURES_ROADMAP.md §3.1.",
      "  notifications: {",
      "    enabled: false,",
      '    proxyUrl: "https://contact-form-proxy.<your-subdomain>.workers.dev",',
      "  },",
    ],
  },
  {
    key: "schedulingUrl",
    afterKey: "reveal_behavior:",
    lines: [
      '    // Calendly/Cal.com/Google Calendar appointment link — shows a "Schedule',
      '    // Viewing" button on item pages when set. Leave "" to disable.',
      '    schedulingUrl: "", // e.g. "https://calendly.com/your-handle/viewing"',
    ],
  },
  {
    key: "scheduleViewing",
    afterKey: "preferredPayment:",
    lines: [
      '        scheduleViewing: "Schedule Viewing",',
    ],
  },
  {
    // key is the full key+English-value pair, not the bare key name: the
    // commented-out zh translation example further down this file already
    // contains the bare string "enquiryFormHeading" (as `//   enquiryFormHeading:
    // "傳送詢問",`, documenting that it's translatable) — a bare-name existence
    // check would always find that comment and wrongly report the real,
    // active field as already present, even on a config missing it entirely.
    // The English value only appears in the real declaration, not the zh one.
    //
    // afterKey is the tail of belowMinimumOffer's value, not `belowMinimumOffer:`
    // itself — that key's string value lives on the following physical line
    // (`belowMinimumOffer:\n  "...",`), so anchoring on the key would splice
    // this block between the key and its own value and break the object
    // literal. This one string is unique in the file.
    key: 'enquiryFormHeading: "Send an Enquiry"',
    afterKey: "Please try a higher amount.",
    lines: [
      "",
      "        // ── Enquiry form (item detail page, optional — see the contact-form",
      "        // enquiry relay setting above) ────────────────────────────────────────",
      '        enquiryFormHeading: "Send an Enquiry",',
      '        enquiryNameLabel: "Your name",',
      '        enquiryContactLabel: "How can we reach you?",',
      '        enquiryContactPlaceholder: "Email, phone, or messaging handle",',
      '        enquiryMessageLabel: "Message",',
      '        enquiryMessagePlaceholder: "Ask a question or make an offer…",',
      '        enquiryOfferLabel: "Offer amount (optional)",',
      '        enquirySubmit: "Send Enquiry",',
      '        enquirySubmitting: "Sending…",',
      '        enquirySuccess: "Thanks! Your message has been sent to the seller.",',
      '        enquiryError: "Something went wrong. Please try again, or use the contact options above.",',
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
    // Shares its anchor with pdfTocHeading below. In the common case (only
    // this key is missing) it lands right after filterPriceIncludesOutliers,
    // matching the upstream layout. In the rare case a very old config is
    // missing both this and the whole PDF-chrome block in the same
    // migrate-config run, pdfTocHeading's later splice at the same anchor
    // pushes this line below its 11-line block instead — harmless, since
    // object key order carries no runtime meaning.
    key: "filterCourse",
    afterKey: "filterPriceIncludesOutliers:",
    lines: [
      '        filterCourse: "Course",',
    ],
  },
  {
    key: "filterTags",
    afterKey: "filterCourse:",
    lines: [
      '        filterTags: "Tags",',
    ],
  },
  {
    // "soldArchiveTitle:" also appears in a commented-out zh example further
    // down the file; findIndex's first-match semantics land on the real
    // (default-locale) line, same caveat already noted on pdfContactHeading
    // below for "condition:".
    key: "tagPageHeading",
    afterKey: "soldArchiveTitle:",
    lines: [
      '        tagPageHeading: "Tagged: {tag}",',
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
