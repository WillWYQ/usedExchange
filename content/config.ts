import type { SiteConfig } from "@/lib/config/types";

// ⚠️ This file lives in content/ — it is the ONLY TypeScript file sellers ever edit.
// All values must be static, serialisable constants. No Node.js APIs (fs, path, process.env).
// Seller coordinates and contact handles are intentionally public (embedded in the static bundle).

export const siteConfig: SiteConfig = {
  // ── Identity ─────────────────────────────────────────────────────────────
  name: "UsedExchange",
  tagline: "Quality second-hand items — local pickup preferred.",
  logo: "/logo.svg", // path in /public, or "" for text logo
  // logo: "", // path in /public, or "" for text logo

  // ── Deployment ───────────────────────────────────────────────────────────
  deploymentMode: "static", // "static" (GitHub Pages / any host) | "vercel"
  baseUrl: "https://usedexchangeproject.willsleep.dev", // update before first deploy
  // baseUrl: "https://your-domain.com", // update before first deploy

  // ── Image Storage ─────────────────────────────────────────────────────────
  imageStorage: {
    provider: "cloudflare-r2",
    // "cloudflare-r2" → upload to Cloudflare R2 (recommended, zero egress cost)
    //                   set CF_R2_* env vars in .env.local
    // "vercel-blob"   → upload to Vercel Blob CDN; set BLOB_READ_WRITE_TOKEN
    // "local"         → copy to public/items/ (local dev and self-hosted builds)
  },

  // ── Seller location ───────────────────────────────────────────────────────
  // Used for distance-based price tier resolution.
  // Find coords: maps.google.com → right-click → "What's here?"
  // These are embedded in the built site and visible in page source.
  location: {
    lat: 37.7749,
    lng: -122.4194,
    label: "San Francisco, CA",
  },

  // ── Content defaults ──────────────────────────────────────────────────────
  currency: "USD",
  recentlyListedCount: 6,
  soldItemRetentionDays: 3, // 0 = keep forever; -1 = hide immediately
  // /sold renders every sold item ever (it's a permanent, ever-growing static
  // page in a fully-exported site — there's no pagination at request time).
  // Cap how many of the most-recent sold items are rendered so the exported
  // HTML and build time don't grow unbounded over years of use. Older items
  // remain in content/ (and count toward the header total) — only the grid
  // is capped. Set to 0 to render every item with no cap.
  soldArchiveDisplayLimit: 200,

  // ── Shipping calculator (optional) ─────────────────────────────────────────
  // Disabled by default — zero impact on the site until configured.
  // To enable: deploy workers/shipping-rate-proxy (see its README), then set
  // enabled: true and proxyUrl to your Worker's URL. Only affects items whose
  // resolved price tier is "open-ended" (no miles_max — the "Shipping" tier).
  // See DESIGN.md §21 for the full architecture.
  // shipping: {
  //   enabled: true,
  //   proxyUrl: "https://shipping-rate-proxy.<your-subdomain>.workers.dev",
  //   defaultPayer: "buyer", // "seller" | "buyer" — who pays for shipping by default
  //   origin: {
  //     zip: "94103",
  //     country: "US", // ISO 3166-1 alpha-2
  //   },
  // },

  // ── Contact ───────────────────────────────────────────────────────────────
  contact: {
    reveal_behavior: "click", // "click" | "always"
    platforms: [
      { type: "email", value: "you@example.com" },
      { type: "instagram", value: "your_handle" },
      { type: "discord", value: "123456789012345678" },
      // { type: "wechat", qr_image: "/contact/wechat-qr.png", label: "WeChat" },
    ],
  },

  // ── Home page ─────────────────────────────────────────────────────────────
  hero: {
    cta_label: "Browse Items",
    cta_href: "#categories",
  },

  // ── SEO ───────────────────────────────────────────────────────────────────
  meta: {
    description: "Personal second-hand marketplace.",
    twitterHandle: "",
  },

  // ── UI Component Slots ────────────────────────────────────────────────────
  // See DESIGN.md §18 for the full list of options per slot.
  ui: {
    background: "none",
    itemGrid: "simple",
    gallery: "simple",
    itemCard: "simple",
  },

  // ── Analytics ─────────────────────────────────────────────────────────────
  analytics: {
    vercel: false, // enable only on Vercel deployments
    speedInsights: false,
  },

  // ── Full-text search ──────────────────────────────────────────────────────
  search: {
    enabled: true,
    placeholder: "Search items...",
  },

  // ── Sitemap ───────────────────────────────────────────────────────────────
  sitemap: {
    enabled: true,
  },

  // ── Internationalisation ──────────────────────────────────────────────────
  // To add a language:
  //   1. Add its code to availableLocales (e.g. "zh", "ja", "ko").
  //   2. Add a matching entry under translations with every key translated.
  //   3. Run /translate-items to batch-fill name_zh / description_zh in item.json.
  //
  // The build will fail (check-config) if a locale is listed in availableLocales
  // but its translations entry is missing or has incomplete keys.
  i18n: {
    defaultLocale: "en",
    availableLocales: ["en"],
    showLocaleSwitcher: true,
    translations: {
      en: {
        // ── Navigation ──────────────────────────────────────────────────────
        home: "Home",
        about: "About",
        browseAll: "Browse All",

        // ── Section headings ────────────────────────────────────────────────
        recentlyListed: "Recently Listed",
        recentlyViewed: "Recently Viewed",
        categoriesHeading: "Browse by Category",

        // ── Contact ─────────────────────────────────────────────────────────
        contactSeller: "Contact Seller",
        itemSold: "Item sold",
        preferredPayment: "Preferred payment",

        // ── Make-offer form ─────────────────────────────────────────────────
        makeOffer: "Make an Offer",
        yourOffer: "Your offer",
        send: "Send",
        belowMinimumOffer:
          "That offer is below the minimum we can accept. Please try a higher amount.",

        // ── Share button ────────────────────────────────────────────────────
        share: "Share",
        copied: "Copied!",
        linkCopied: "Link copied!",

        // ── Item metadata labels ─────────────────────────────────────────────
        brand: "Brand",
        model: "Model",
        age: "Age",
        color: "Color",
        dimensions: "Dimensions",
        weight: "Weight",
        originalSource: "Original Source",
        originalPrice: "Original Price",

        // ── Condition badge labels ───────────────────────────────────────────
        conditionNew: "New",
        conditionLikeNew: "Like New",
        conditionGood: "Good",
        conditionFair: "Fair",
        conditionForParts: "For Parts",

        // ── Status badge labels ──────────────────────────────────────────────
        statusAvailable: "Available",
        statusPending: "Pending",
        statusReserved: "Reserved",
        statusSold: "Sold",
        statusDraft: "Draft",

        // ── Filter / sort bar ────────────────────────────────────────────────
        filterShowSold: "Show sold",
        filterPrice: "Price",
        sortBy: "Sort by",
        sortNewestFirst: "Newest first",
        sortPriceLow: "Price: low → high",
        sortPriceHigh: "Price: high → low",
        sortConditionBest: "Condition: best first",

        // ── Freshness label ──────────────────────────────────────────────────
        listed: "Listed",

        // ── Page titles and banners ──────────────────────────────────────────
        soldBanner: "This item has been sold",
        soldArchiveTitle: "Sold Archive",

        // ── Condition guide panel ────────────────────────────────────────────
        conditionGuideTitle: "Condition Guide",
        conditionNewDesc: "Unopened, unused. Original packaging intact.",
        conditionLikeNewDesc: "Used briefly. No visible wear. May be without original box.",
        conditionGoodDesc: "Normal signs of use. Fully functional. Minor cosmetic marks.",
        conditionFairDesc: "Visible wear or light damage. Works as expected.",
        conditionForPartsDesc: "Not fully functional. Sold as-is for repair or parts.",

        // ── Location / distance price bar ────────────────────────────────────
        detectingLocation: "Detecting location…",
        fromSeller: "from seller",
        locationDetected: "Location detected",
        enterManually: "Enter manually",
        distanceManualLabel: "(manual)",
        distanceUnit: "mi",
        distanceInputLabel: "Distance in miles",
        apply: "Apply",
        pricesAtPickupRate: "Prices shown at pickup rate",
        enterDistance: "Enter distance",
        edit: "Edit",
        clear: "Clear",

        // ── Pricing table ────────────────────────────────────────────────────
        contactForPrice: "Contact seller for pricing details.",
        contactForPricingShort: "Contact seller for pricing",
        pricingLabelHeader: "Label",
        pricingDistanceHeader: "Distance",
        pricingPriceHeader: "Price",
        pickup: "Pickup",
        obo: "OBO",
        hidePricingTiers: "Hide pricing tiers",
        viewAllPricingTiers: "View all pricing tiers",

        // ── Shipping estimator ───────────────────────────────────────────────
        shippingEstimateLabel: "Estimated shipping",
        shippingZipPlaceholder: "ZIP code",
        shippingCalculating: "Calculating shipping…",
        shippingUnavailable: "Shipping estimate unavailable",
        shippingIncludedBySeller: "Free shipping (included by seller)",
        shippingEstimateSuffix: "shipping",

        // ── Mobile nav drawer ────────────────────────────────────────────────
        menuOpen: "Open menu",
        menuClose: "Close menu",
      },

      // ── Add other locales below ────────────────────────────────────────────
      // zh: {
      //   home: "首頁",
      //   about: "關於",
      //   browseAll: "瀏覽全部",
      //   recentlyListed: "最新上架",
      //   recentlyViewed: "最近瀏覽",
      //   categoriesHeading: "依分類瀏覽",
      //   contactSeller: "聯繫賣家",
      //   itemSold: "已售出",
      //   preferredPayment: "偏好付款方式",
      //   makeOffer: "出價",
      //   yourOffer: "您的出價",
      //   send: "送出",
      //   belowMinimumOffer: "出價低於最低可接受價格，請提高金額。",
      //   share: "分享",
      //   copied: "已複製！",
      //   linkCopied: "連結已複製！",
      //   brand: "品牌",
      //   model: "型號",
      //   age: "使用年限",
      //   color: "顏色",
      //   dimensions: "尺寸",
      //   weight: "重量",
      //   originalSource: "購買來源",
      //   originalPrice: "原始售價",
      //   conditionNew: "全新",
      //   conditionLikeNew: "近全新",
      //   conditionGood: "良好",
      //   conditionFair: "一般",
      //   conditionForParts: "零件用",
      //   statusAvailable: "在售",
      //   statusPending: "待確認",
      //   statusReserved: "已保留",
      //   statusSold: "已售出",
      //   statusDraft: "草稿",
      //   filterShowSold: "顯示已售",
      //   filterPrice: "價格",
      //   sortBy: "排序方式",
      //   sortNewestFirst: "最新上架",
      //   sortPriceLow: "價格：由低到高",
      //   sortPriceHigh: "價格：由高到低",
      //   sortConditionBest: "狀態：最佳優先",
      //   listed: "刊登",
      //   soldBanner: "此商品已售出",
      //   soldArchiveTitle: "已售出紀錄",
      //   conditionGuideTitle: "狀態說明",
      //   conditionNewDesc: "未開封，全新未使用。原始包裝完整。",
      //   conditionLikeNewDesc: "短暫使用。無明顯磨損。可能無原裝包裝。",
      //   conditionGoodDesc: "正常使用痕跡。功能完整。輕微外觀瑕疵。",
      //   conditionFairDesc: "明顯磨損或輕微損傷。功能正常。",
      //   conditionForPartsDesc: "功能不完整。原樣出售，供維修或取件用。",
      //   detectingLocation: "正在偵測位置…",
      //   fromSeller: "距離賣家",
      //   locationDetected: "已偵測到位置",
      //   enterManually: "手動輸入",
      //   distanceManualLabel: "（手動）",
      //   distanceUnit: "英里",
      //   distanceInputLabel: "距離（英里）",
      //   apply: "套用",
      //   pricesAtPickupRate: "顯示自取價格",
      //   enterDistance: "輸入距離",
      //   edit: "編輯",
      //   clear: "清除",
      //   contactForPrice: "請聯繫賣家詢問價格。",
      //   contactForPricingShort: "請聯繫賣家詢問價格",
      //   pricingLabelHeader: "方案",
      //   pricingDistanceHeader: "距離",
      //   pricingPriceHeader: "售價",
      //   pickup: "自取",
      //   obo: "可議價",
      //   hidePricingTiers: "隱藏費率",
      //   viewAllPricingTiers: "查看所有費率",
      //   shippingEstimateLabel: "預估運費",
      //   shippingZipPlaceholder: "郵遞區號",
      //   shippingCalculating: "運費計算中…",
      //   shippingUnavailable: "無法取得運費估算",
      //   shippingIncludedBySeller: "免運費（賣家負擔）",
      //   shippingEstimateSuffix: "運費",
      //   menuOpen: "開啟選單",
      //   menuClose: "關閉選單",
      // },
    },
  },
};
