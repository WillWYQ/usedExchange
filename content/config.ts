import type { SiteConfig } from "@/lib/config/types";

// ⚠️ This file lives in content/ — it is the ONLY TypeScript file sellers ever edit.
// All values must be static, serialisable constants. No Node.js APIs (fs, path, process.env).
// Seller coordinates and contact handles are intentionally public (embedded in the static bundle).

export const siteConfig: SiteConfig = {
  // ── Identity ─────────────────────────────────────────────────────────────
  name: "Will's Used Exchange",
  tagline: "Quality second-hand items — local pickup preferred.",
  logo: "", // path in /public, or "" for text logo

  // ── Deployment ───────────────────────────────────────────────────────────
  deploymentMode: "static", // "static" (GitHub Pages / any host) | "vercel"
  baseUrl: "https://your-domain.com", // update before first deploy

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

  // ── Dark mode ─────────────────────────────────────────────────────────────
  // "media" → follows OS/browser preference (default)
  // "class" → manual toggle via SiteHeader button (future extension)
  darkMode: "media",

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
  // Add "zh" to availableLocales to enable the LocaleSwitcher.
  // Run /translate-items to batch-fill name_zh / description_zh in item.json.
  i18n: {
    defaultLocale: "en",
    availableLocales: ["en"],
    showLocaleSwitcher: true,
    strings: {
      heroTagline: "",
      recentlyListed: "",
      browseAll: "",
      makeOffer: "",
      contactSeller: "",
      soldBanner: "",
    },
  },
};
