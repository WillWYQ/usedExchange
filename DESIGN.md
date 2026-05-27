# UsedExchange — Project Design Document

**Version:** 0.4.0  
**Date:** 2026-05-27  
**Status:** Decisions Resolved — Ready for Implementation

---

## 1. Project Overview

UsedExchange is a statically-generated personal web storefront for listing second-hand items for sale. Content is managed entirely through the local file system — no database, no CMS. The seller adds a folder per item, drops in photos and a `item.json` metadata file, then triggers a build; the site regenerates automatically.

The UI is built on [Aceternity UI](https://ui.aceternity.com) (React + Tailwind CSS) for a polished browsing experience. The architecture is modularised so any part — deployment target, image strategy, contact platforms — can be swapped without restructuring the codebase.

---

## 2. Goals & Non-Goals

### Goals
- Zero-database, file-system-driven content management
- Build-time static generation; output hostable on Vercel Hobby or any static host
- Modularised deployment adapter: Vercel-optimised by default, self-host ready via config switch
- Graceful schema degradation: missing optional JSON fields never crash the build or the page
- Distance-tiered pricing per item
- Photo gallery per item, sourced from the item folder
- Rich, privacy-respecting contact section with social platform links and QR code support
- Clean, extensible codebase designed for second development

### Non-Goals (v1)
- Real-time inventory updates without a rebuild
- Buyer-facing checkout or payment processing
- User authentication or seller dashboard
- Full-text search (client-side filtering only)

---

## 3. Technology Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | **Next.js 15 (App Router)** | Build-time FS reads via `generateStaticParams`; two output modes |
| Language | **TypeScript 5** | Type-safe schema parsing; compile-time missing-field detection |
| UI library | **Aceternity UI** | Pre-built animated components; Tailwind-based |
| Styling | **Tailwind CSS v4** | Required by Aceternity; utility-first |
| Schema validation | **Zod 3** | `.safeParse()` with defaults; never throws on bad input |
| Markdown | **react-markdown + remark-gfm** | Renders `description` field |
| Package manager | **pnpm** | Fast installs, disk-efficient |
| Linting | **ESLint + Prettier** | Consistent code style |
| Primary host | **Vercel Hobby** | Zero-config deploys from Git |
| Alternate host | **Any static server** | Via `output: 'export'` mode |

### Deployment Modes

The app supports two modes toggled by a single config value in `content/config.ts`:

| Mode | `deploymentMode` | Next.js config | Image strategy |
|---|---|---|---|
| Vercel (default) | `"vercel"` | Default (server functions allowed) | `next/image` with Vercel optimisation |
| Self-hosted static | `"static"` | `output: 'export'` | Plain `<img>` via `UnoptimizedImage` wrapper |

The `<AdaptiveImage>` component switches internally based on `deploymentMode` — no callsite changes needed when switching modes.

### Image Storage Architecture

#### The Problem

Vercel Hobby has a **100 MB deployment size limit**. This limit covers everything in the built output — including images copied into `public/`. A personal used-goods site with 100 items × 5 photos × 2 MB = 1 GB of images would instantly exceed this, even though the actual HTML/CSS/JS is tiny.

The naive solution (copy images into `public/` at build time) breaks on Vercel. The seller-hostile solution (manually upload images to a storage console) defeats the file-system-first design. The correct solution is an **automated image storage adapter** that runs transparently during the build.

#### Design Principle

**Item photos are local-only source files — not committed to git.**

Committing photos would: (a) make every `git push` slow as photo collections grow, and (b) still not solve the 100 MB deployment limit since photos would eventually exceed it in the repo too. Instead:

- **JSON metadata files** stay in git — they're tiny text files, the inventory catalogue.
- **Photos** stay on the seller's machine and are uploaded directly to cloud storage by a single command.
- **The image manifest** (`lib/generated/image-manifest.json`) is committed — it maps each photo to its CDN URL. This is the only artifact Vercel needs to build the site.
- **QR code images** live in `content/contact/` (git-tracked, tiny < 50 KB). The sync script copies them to `public/contact/` so Next.js can serve them.

**All seller-managed files live in one folder: `content/`.** App code never needs to be touched for routine listing updates, config changes, or adding new categories.

#### Seller Workflow

```
Adding a new item:
  1. Create content/items/category/my-item/  with item.json + photos
  2. pnpm upload-images              uploads photos → CDN, updates manifest
  3. git add content/items/my-item/item.json lib/generated/image-manifest.json
  4. git push                        Vercel builds instantly; images already on CDN

Updating photos:
  1. Replace / add photos in content/items/category/my-item/
  2. pnpm upload-images              detects changed checksums, re-uploads only changed files
  3. git add lib/generated/image-manifest.json && git push

Code-only change (no photo edits):
  1. Edit content/items/**/item.json  or  content/config.ts
  2. git add ... && git push         Vercel builds; manifest unchanged, no uploads needed
```

#### Image Storage Tiers

| `imageStorage.provider` | Best for | Deployment size | Seller effort |
|---|---|---|---|
| `"local"` | Local dev preview / self-hosted with no size limit | Images included in output | None |
| `"vercel-blob"` *(recommended for Vercel Hobby)* | Vercel Hobby, Vercel Pro | Images excluded — served from Blob CDN | 1 env var, once |
| `"cloudflare-r2"` | Self-hosted or large collections — zero egress cost | Images excluded — served from R2 CDN | 4 env vars, once |

#### How It Works

```
LOCAL MACHINE — pnpm upload-images
  │
  ├── Scans content/items/**  for image files (gitignored; present on seller's machine only)
  ├── Loads .image-cache/checksums.json
  │
  ├── [provider: "vercel-blob"]
  │     ├── SHA-256 compare → skip unchanged files
  │     ├── Upload new/changed files via @vercel/blob SDK
  │     └── Record CDN URLs
  │
  ├── [provider: "cloudflare-r2"]
  │     ├── SHA-256 compare → skip unchanged
  │     ├── Upload via @aws-sdk/client-s3 (R2 is S3-compatible)
  │     └── Record CDN URLs
  │
  ├── Copy content/contact/** → public/contact/  (QR images; small, always local)
  ├── Write lib/generated/image-manifest.json  ← COMMITTED to git
  │     { "houseware/ikea-desk-lamp/cover.jpg": "https://cdn.example/cover.jpg", … }
  ├── Write .image-cache/checksums.json        ← gitignored (local speed cache)
  │
  └── ⚠️  Print BACKUP REMINDER  (see §3 Backup Policy)

VERCEL BUILD — pnpm build (no photos present; reads committed manifest)
  │
  ├── prebuild: scripts/sync-images.ts
  │     ├── No image files in content/items/ (gitignored — not on Vercel's runner)
  │     ├── Manifest already committed → reads existing manifest, no uploads
  │     ├── content/contact/** present (git-tracked) → copies to public/contact/
  │     └── Logs: "manifest present (N entries) — skipping upload"
  │
  └── next build
        loader.ts reads manifest → resolves all image URLs to CDN
        All pages statically generated with correct CDN image URLs

LOCAL DEV — pnpm dev
  │
  ├── sync-images.ts  (always runs in "local" mode, regardless of provider config)
  │     content/items/ photos → copied to public/items/
  │     content/contact/    → copied to public/contact/
  │
  └── next dev  — images served from public/items/ and public/contact/
```

#### Image URL Resolution (in `lib/content/loader.ts`)

```
For each image filename found in a content/items/ folder:
  key = "{categorySlug}/{itemSlug}/{filename}"
  url = manifest[key]       // CDN URL (from committed manifest)
      ?? "/items/{key}"     // local fallback for dev / "local" provider
```

On Vercel, `manifest[key]` is always populated (the manifest is committed). The fallback path is only used in local dev before `pnpm upload-images` has been run for that image.

#### Incremental Uploads

`.image-cache/checksums.json` stores `{ relativePath: sha256 }` for every previously uploaded image. On the next `pnpm upload-images`, only changed or new files are re-uploaded. The cache lives on the seller's machine only (gitignored). It can be deleted at any time — all images are simply re-uploaded on the next run.

#### Backup Policy

> ⚠️ **The seller is responsible for backing up their `content/` folder (specifically the photos).**
>
> Photos are **not in git** (gitignored) and cloud storage (Blob/R2) is a **delivery layer, not a backup**. Cloud storage can be accidentally wiped. The script prints a reminder after every upload:
>
> ```
> ╔══════════════════════════════════════════════════════════════╗
> ║  ⚠️   BACKUP REMINDER                                         ║
> ║                                                              ║
> ║  Your item photos are NOT tracked by git.                    ║
> ║  Cloud storage (Vercel Blob / R2) is a delivery layer,       ║
> ║  NOT a backup — it can be accidentally wiped.                ║
> ║                                                              ║
> ║  Please ensure your  content/  folder is backed up to:       ║
> ║    • External hard drive or Time Machine                     ║
> ║    • iCloud Drive / Google Drive / Dropbox                   ║
> ║                                                              ║
> ║  Next steps:                                                 ║
> ║    git add lib/generated/image-manifest.json                 ║
> ║    git add content/**/*.json                                 ║
> ║    git commit -m "chore: update listings"                    ║
> ╚══════════════════════════════════════════════════════════════╝
> ```

#### What Stays in Git

| Content | Git-tracked? | Reason |
|---|---|---|
| `content/**/*.json` | **Yes** | Inventory metadata and config; tiny text files |
| `content/config.ts` | **Yes** | Site configuration |
| `content/contact/*.png` | **Yes** | QR code images; tiny, rarely change |
| `content/items/**/*.jpg/png/…` | **No** — local only | Large; slow to push; uploaded to CDN separately |
| `lib/generated/image-manifest.json` | **Yes** | CDN URL map; Vercel needs this to build |
| `.image-cache/checksums.json` | **No** — local only | Speed cache for incremental uploads |
| `public/items/` | **No** — generated | Populated by local dev sync only |
| `public/contact/` | **No** — generated | Copied from `content/contact/` by sync script |

---

## 4. File System Content Model

> **Rule: everything the seller ever touches lives inside `content/`.
> Nothing else in the project needs to be opened for routine operations.**

```
content/                            ← ★ THE ONLY FOLDER SELLERS NEED TO TOUCH
│
├── config.ts                       ← ✓ git-tracked  Site name, URL, contact, pricing defaults
│
├── items/                          ← ✓ JSON git-tracked  ✗ Photos gitignored (local + CDN)
│   │
│   ├── houseware/                  ← category folder (created by seller, any name)
│   │   ├── _category.json          ← ✓ optional category display name, icon, sort order
│   │   ├── ikea-desk-lamp/         ← individual item folder (any name → becomes URL slug)
│   │   │   ├── item.json           ← ✓ REQUIRED — item name, price, description, status…
│   │   │   ├── cover.jpg           ← ✗ gitignored — pinned thumbnail (optional convention)
│   │   │   ├── photo1.jpg          ← ✗ gitignored — additional gallery images
│   │   │   └── photo2.png          ← ✗ gitignored
│   │   └── cast-iron-pan/
│   │       ├── item.json           ← ✓ git-tracked
│   │       └── pan.jpg             ← ✗ gitignored
│   │
│   └── electronics/
│       ├── _category.json          ← ✓ git-tracked
│       └── iphone-14-pro/
│           ├── item.json           ← ✓ git-tracked
│           ├── front.jpg           ← ✗ gitignored
│           └── back.jpg            ← ✗ gitignored
│
└── contact/                        ← ✓ git-tracked  QR code images (tiny, < 50 KB each)
    └── wechat-qr.png               ← committed; sync script copies → public/contact/
```

### Folder & File Rules

| Rule | Detail |
|---|---|
| Content root | `content/` — only directory sellers need to know about |
| Config file | `content/config.ts` — site-wide settings (name, URL, contact platforms, etc.) |
| Category slug | Category folder name under `content/items/`; auto-capitalised, hyphens → spaces |
| Item slug | Item folder name; becomes the URL path segment |
| Gallery images | All `.jpg .jpeg .png .webp .gif` in an item folder — gitignored; local + CDN |
| Thumbnail | File named `cover.*` is pinned as thumbnail; otherwise first image alphabetically |
| Other files | Silently ignored (no crash) |
| Reserved prefix | Folders/files starting with `_` are metadata — never treated as items/categories |
| QR code images | Place in `content/contact/`; git-tracked; sync script copies to `public/contact/` |

---

## 5. JSON Schema — `item.json`

Only `name` is required. Every other field is optional; the build applies safe defaults when absent.

```jsonc
{
  // ── Identity ───────────────────────────────────────────────────────────────
  "name": "IKEA TRÅDFRI Desk Lamp",          // string, REQUIRED

  // ── Pricing ───────────────────────────────────────────────────────────────
  "price": {
    "currency": "USD",                        // ISO 4217, default "USD"
    "tiers": [
      // Each tier needs at minimum a label and amount.
      // miles_min / miles_max are both optional (open-ended tier = omit miles_max).
      { "label": "Pickup / ≤ 5 mi",  "miles_max": 5,   "amount": 15 },
      { "label": "6 – 15 mi",        "miles_min": 6,   "miles_max": 15, "amount": 20 },
      { "label": "16 – 30 mi",       "miles_min": 16,  "miles_max": 30, "amount": 25 },
      { "label": "Shipping",         "miles_min": 31,  "amount": 35 }
    ],
    "negotiable": true                        // boolean, default false; renders "OBO" on price
  },

  // ── Item details ──────────────────────────────────────────────────────────
  "description": "Works perfectly. Bought 2 years ago.",
  // ^ string; GitHub-flavoured Markdown supported; default ""

  "condition": "good",
  // ^ enum: "new" | "like-new" | "good" | "fair" | "for-parts"; default "good"

  "brand": "IKEA",                            // string; default ""
  "model": "TRÅDFRI E14",                     // string; default ""
  "age_years": 2,                             // number, approximate; default null
  "dimensions": {
    "length": 45, "width": 15, "height": 15,
    "unit": "cm"                              // "cm" | "in"; default "cm"
  },
  "weight": { "value": 0.8, "unit": "kg" },  // unit: "kg" | "lb"
  "color": "white",                           // string; default ""
  "quantity": 1,                              // integer ≥ 1; default 1

  // ── Provenance ────────────────────────────────────────────────────────────
  "original_source": "IKEA",                  // string; e.g. "Amazon", "Costco"
  "original_link": "https://www.ikea.com/…",  // URL string
  "original_price": 29.99,                    // number; default null

  // ── Listing lifecycle ─────────────────────────────────────────────────────
  "status": "available",
  // ^ enum: "available" | "pending" | "reserved" | "sold" | "draft"
  //   default "available"

  "listed_date": "2026-05-25",               // ISO 8601; default: build date
  "sold_date": "2026-05-28",                 // ISO 8601; used for retention calculation
  // ^ if status is "sold" and sold_date is absent, listed_date is used as fallback

  "reserved_for": "",
  // ^ string; buyer name/contact — NOT rendered on page, kept private in json

  // ── Contact preferences (item-level overrides; site config is the default) ─
  "preferred_payment": ["Venmo", "Cash"],     // array of strings; default []
  "contact_note": "",                         // string; shown below contact links on item page

  // ── Categorisation ────────────────────────────────────────────────────────
  "tags": ["lighting", "smart-home"],         // string[]; default []
  "category_override": "",
  // ^ if non-empty, overrides the folder-derived category slug for display purposes

  // ── SEO ───────────────────────────────────────────────────────────────────
  "meta_description": ""
  // ^ if empty, auto-generated from first 160 chars of description
}
```

### Field defaults summary

| Field | Default |
|---|---|
| `price.currency` | `"USD"` |
| `price.tiers` | `[]` → shows "Contact for price" |
| `price.negotiable` | `false` |
| `condition` | `"good"` |
| `quantity` | `1` |
| `status` | `"available"` |
| `listed_date` | build date (ISO string) |
| `sold_date` | falls back to `listed_date` if absent and status is `"sold"` |
| `tags` | `[]` |
| all other strings | `""` |
| all other numbers | `null` (not rendered when null) |

---

## 6. Optional Category Metadata — `_category.json`

```jsonc
{
  "display_name": "Houseware & Kitchen",
  // ^ overrides auto-capitalised folder name; default: folder name

  "description": "Pots, pans, lamps, and other home goods.",
  // ^ shown at top of category page; default ""

  "icon": "🏠",
  // ^ emoji shown on category card; default ""

  "sort_order": 1
  // ^ integer; lower = appears earlier on home page
  //   if absent on any category, all categories sort alphabetically
  //   if present on SOME categories, those categories sort by sort_order first,
  //   then remaining categories append alphabetically after
}
```

### Category Sort Logic

1. Categories with `sort_order` defined → sorted ascending by `sort_order`
2. Categories without `sort_order` → sorted alphabetically by folder name, appended after sorted group
3. If no category has `sort_order`, all categories sort alphabetically (pure default)

---

## 7. Contact Platform Configuration

Configured in `content/config.ts`. Supports two platform types:

**Link-based platforms** — rendered as icon + label button that reveals a URL on click.

**QR-code platforms** (e.g. WeChat) — rendered as icon + label button that opens a modal showing the QR image.

```ts
contact: {
  reveal_behavior: "click",     // "click" | "always"
  // "click"  → contact info hidden behind a "Show contact" toggle
  // "always" → contact info always visible

  platforms: [
    // Link-based: value is the username/handle/phone/email
    { type: "email",     value: "you@example.com" },
    { type: "facebook",  value: "your.username" },
    { type: "instagram", value: "your_handle" },
    { type: "snapchat",  value: "your_username" },
    { type: "whatsapp",  value: "+11234567890" },   // E.164 format
    { type: "twitter",   value: "your_handle" },
    { type: "tiktok",    value: "@your_handle" },
    { type: "linkedin",  value: "in/your-name" },
    { type: "youtube",   value: "@your_channel" },

    // QR-based: qr_image path relative to /public
    { type: "wechat",    qr_image: "/contact/wechat-qr.png",   label: "WeChat" },
    // Any future platform without a web profile URL follows the same pattern:
    { type: "line",      qr_image: "/contact/line-qr.png",     label: "LINE" },
  ],
}
```

### URL Construction per Platform

| `type` | URL pattern |
|---|---|
| `email` | `mailto:{value}` |
| `facebook` | `https://facebook.com/{value}` |
| `instagram` | `https://instagram.com/{value}` |
| `snapchat` | `https://snapchat.com/add/{value}` |
| `whatsapp` | `https://wa.me/{value}` (strips leading `+`) |
| `twitter` | `https://x.com/{value}` |
| `tiktok` | `https://tiktok.com/{value}` |
| `linkedin` | `https://linkedin.com/{value}` |
| `youtube` | `https://youtube.com/{value}` |
| `wechat` / `line` / QR type | Opens modal with `<img src={qr_image}>` |

All link-based platforms open in `target="_blank" rel="noopener noreferrer"`.

---

## 8. Sold Item Retention

```ts
// content/config.ts
soldItemRetentionDays: 3,   // default; set to 0 to keep forever, -1 to hide immediately
```

At build time, the loader applies:

```
visible = (status !== "sold") OR (today − sold_date ≤ soldItemRetentionDays)
```

Items past retention are excluded from all pages and `generateStaticParams` entirely — their detail page is not generated.

---

## 9. URL Structure

```
/                              Home — category overview + recently listed
/[category]                    Category page — item grid with filters
/[category]/[item]             Item detail — gallery, pricing, metadata, contact
```

All routes are statically generated at build time. No `/sold` archive page in v1 (sold items stay visible on category pages with a "SOLD" overlay until retention expires).

---

## 10. Page Specifications

### 10.1 Home Page (`/`)

- **Hero** — site name, tagline, CTA button (configurable in `content/config.ts`)
- **Category grid** — one card per non-empty category; shows icon, display name, available item count, cover image background
- **Recently Listed** — last N available items sorted by `listed_date` (configurable, default 6)
- **Footer** — contact platform links, last-build timestamp, site name

### 10.2 Category Page (`/[category]`)

- Category title, icon, description
- **Filter bar** (client-side): condition chips, price range slider, status toggle (hide sold)
- **Item grid**: card per item — cover photo, name, condition badge, status badge, lowest price tier
- Sold items: rendered with "SOLD" overlay, not hidden (until retention expires)

### 10.3 Item Detail Page (`/[category]/[item]`)

- **Breadcrumb**: Home → Category → Item name
- **Photo gallery** — carousel with thumbnail strip; Aceternity animated card
- **Status + condition badges** — top-right of hero
- **Name + description** (Markdown rendered)
- **Pricing table** — one row per tier; "OBO" appended if `negotiable: true`; "Contact for price" if no tiers
- **Metadata table** — brand, model, dimensions, weight, original source (linked), original price
- **Contact section** — platform buttons behind click-to-reveal (configurable); preferred payment methods; item-level `contact_note`
- **Tags** — rendered as chips (click → future filter)

---

## 11. Data Loading Architecture

```
content/  (file system, build-time only)
  │
  ├── scripts/sync-images.ts
  │     ├── [local provider]    → copies content/items/ → public/items/
  │     │                          copies content/contact/ → public/contact/
  │     ├── [vercel-blob]       → uploads content/items/ photos to Blob CDN
  │     │                          copies content/contact/ → public/contact/
  │     └── [cloudflare-r2]    → uploads content/items/ photos to R2 CDN
  │                                copies content/contact/ → public/contact/
  │     └── writes lib/generated/image-manifest.json
  │
  ▼
lib/content/loader.ts
  ├── root = content/items/
  ├── reads lib/generated/image-manifest.json   (CDN URLs or local paths)
  ├── loadCategories()              → Category[]
  ├── loadItemsByCategory(slug)     → Item[]
  └── loadItem(catSlug, itemSlug)   → Item | null
  │
  ▼
lib/content/schema.ts              Zod schema; .safeParse() + default merge
  │
  ▼
lib/content/types.ts               Exported TS types (Category, Item, PriceTier, …)
  │
  ▼
app/…/page.tsx                     generateStaticParams() + React Server Component
```

### Loader Guarantees
- All `fs` calls are confined to `lib/content/loader.ts`; no page component touches the file system directly
- `loadItem()` returns `null` (not throws) if the item folder or `item.json` is missing
- `generateStaticParams` filters out `null` results before creating routes
- Image URLs are resolved via manifest first, then fall back to `/items/{category}/{item}/{filename}` if the manifest has no entry (safe for local dev with no manifest file)

---

## 12. Component Architecture

```
components/
├── ui/                            ← Aceternity UI (installed via CLI — never edit directly)
│
├── layout/
│   ├── SiteHeader.tsx
│   ├── SiteFooter.tsx
│   └── Breadcrumb.tsx
│
├── category/
│   ├── CategoryCard.tsx
│   └── CategoryGrid.tsx
│
├── item/
│   ├── ItemCard.tsx
│   ├── ItemGrid.tsx
│   ├── ItemGallery.tsx            ← photo carousel (client component)
│   ├── PricingTable.tsx
│   ├── MetadataTable.tsx
│   ├── StatusBadge.tsx
│   └── ConditionBadge.tsx
│
├── contact/
│   ├── ContactSection.tsx         ← reveal wrapper + platform list
│   ├── PlatformButton.tsx         ← single platform button (link or QR trigger)
│   └── QRModal.tsx                ← modal with QR image (client component)
│
├── filters/
│   ├── FilterBar.tsx              ← client component
│   └── useFilters.ts
│
└── common/
    └── AdaptiveImage.tsx          ← next/image vs <img> switch by deploymentMode
```

### Component Rules
- `ui/` — Aceternity originals; extend by wrapping, never modifying in place
- Prop types derived from `lib/content/types.ts`; no raw JSON objects passed to components
- `"use client"` only on: `ItemGallery`, `FilterBar`, `ContactSection`, `QRModal`
- All other components are React Server Components

---

## 13. Configuration — `content/config.ts`

This file lives inside `content/` alongside the items and QR codes. It is the only TypeScript file sellers ever edit. App code imports it as `import { siteConfig } from "@/content/config"`.

```ts
import type { SiteConfig } from "@/lib/config/types";

export const siteConfig: SiteConfig = {
  // ── Identity ─────────────────────────────────────────────────────────────
  name: "Will's Used Exchange",
  tagline: "Quality second-hand items — local pickup preferred.",
  logo: "",                                   // path in /public, or "" for text logo

  // ── Deployment ───────────────────────────────────────────────────────────
  deploymentMode: "vercel",                   // "vercel" | "static"
  baseUrl: "https://your-domain.com",         // used for OG tags + sitemap
  // baseUrl can also be "https://your-name.vercel.app"

  // ── Image Storage ─────────────────────────────────────────────────────────
  // See DESIGN.md §3 "Image Storage Architecture" for the full rationale.
  imageStorage: {
    provider: "vercel-blob",
    // "local"         → copy to public/items/ at build (good for local dev & self-hosted)
    // "vercel-blob"   → auto-upload to Vercel Blob CDN; set BLOB_READ_WRITE_TOKEN in Vercel
    // "cloudflare-r2" → auto-upload to Cloudflare R2; set CF_R2_* env vars
  },

  // ── Content defaults ──────────────────────────────────────────────────────
  currency: "USD",
  recentlyListedCount: 6,
  soldItemRetentionDays: 3,                   // 0 = keep forever; -1 = hide immediately

  // ── Contact ───────────────────────────────────────────────────────────────
  contact: {
    reveal_behavior: "click",                 // "click" | "always"
    platforms: [
      { type: "email",     value: "you@example.com" },
      { type: "instagram", value: "your_handle" },
      { type: "wechat",    qr_image: "/contact/wechat-qr.png", label: "WeChat" },
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
};
```

---

## 14. Build Pipeline

Two distinct flows: **seller-side upload** (local machine) and **platform build** (Vercel/CI).

```
── SELLER'S MACHINE ─────────────────────────────────────────────────────────
pnpm upload-images          (run after adding/changing photos)
  │
  ├── Scans content/items/**/*.{jpg,jpeg,png,webp,gif}  (present locally, gitignored)
  ├── Copies content/contact/** → public/contact/
  ├── Loads .image-cache/checksums.json
  ├── Uploads new/changed files to configured provider (Blob / R2)
  ├── Writes lib/generated/image-manifest.json  ← commit this
  ├── Writes .image-cache/checksums.json        ← do not commit
  └── ⚠️  Prints BACKUP REMINDER

Then:
  git add content/**/*.json lib/generated/image-manifest.json
  git push

── VERCEL BUILD ─────────────────────────────────────────────────────────────
pnpm build
  │
  ├── [prebuild]  scripts/sync-images.ts
  │     ├── No image files in items/ (gitignored — not present on Vercel's runner)
  │     ├── Reads existing lib/generated/image-manifest.json  (committed)
  │     └── No uploads needed; logs: "manifest present, skipping upload"
  │
  ├── next build
  │     loader.ts reads manifest → all image URLs resolve to CDN
  │     generateStaticParams runs for all non-draft, non-expired items
  │     All pages rendered to static HTML + JSON
  │     If deploymentMode === "static": output: 'export' → out/
  │
  └── [postbuild] (optional)
        next-sitemap → sitemap.xml + robots.txt

── LOCAL DEV ────────────────────────────────────────────────────────────────
pnpm dev
  │
  ├── sync-images.ts  (always runs in "local" mode regardless of provider config)
  │     Photos present on seller's machine → copied to public/items/
  │     Falls back gracefully if items/ has no images
  │
  └── next dev --turbo
        Images served from public/items/ (local copies)
```

---

## 15. Status & Visibility Rules

| Status | Home page | Category grid | Detail page | Notes |
|---|---|---|---|---|
| `available` | Yes | Yes | Yes | |
| `reserved` | Yes + badge | Yes + badge | Yes | Buyer info stays private |
| `pending` | Yes + badge | Yes + badge | Yes | |
| `sold` | No | Yes + overlay | Yes | Hidden after `soldItemRetentionDays` |
| `draft` | No | No | No | Never generates a route |

---

## 16. Directory Layout

```
usedExchange/
│
├── content/                       ← ★ SELLER-MANAGED — only folder sellers ever touch
│   ├── config.ts                  ← ✓ git-tracked  Site name, URL, contact, storage config
│   ├── items/                     ← ✓ JSON tracked  ✗ Images gitignored
│   │   ├── houseware/
│   │   │   ├── _category.json     ← ✓ git-tracked
│   │   │   └── ikea-desk-lamp/
│   │   │       ├── item.json      ← ✓ git-tracked
│   │   │       ├── cover.jpg      ← ✗ gitignored (local + CDN only)
│   │   │       └── photo1.jpg     ← ✗ gitignored (local + CDN only)
│   │   └── electronics/ …
│   └── contact/                   ← ✓ git-tracked  QR code images (tiny, < 50 KB)
│       └── wechat-qr.png
│
├── public/
│   ├── contact/                   ← ✗ gitignored; copied from content/contact/ by sync
│   └── items/                     ← ✗ gitignored; copied from content/items/ by pnpm dev
│
├── .image-cache/                  ← ✗ gitignored; incremental upload speed cache
│   └── checksums.json
│
│   ── APP CODE (sellers never need to edit below this line) ──────────────────
│
├── app/
│   ├── layout.tsx
│   ├── page.tsx                   ← home
│   ├── [category]/
│   │   ├── page.tsx
│   │   └── [item]/
│   │       └── page.tsx
│   └── not-found.tsx
│
├── components/                    ← see §12
│
├── lib/
│   ├── content/
│   │   ├── loader.ts              ← reads content/items/; resolves image URLs via manifest
│   │   ├── schema.ts
│   │   └── types.ts
│   ├── images/
│   │   ├── adapter.ts             ← ImageStorageAdapter interface
│   │   ├── local.ts               ← "local" provider
│   │   ├── vercel-blob.ts         ← "vercel-blob" provider
│   │   └── cloudflare-r2.ts       ← "cloudflare-r2" provider
│   ├── generated/
│   │   └── image-manifest.json    ← ✓ git-tracked; written by pnpm upload-images
│   └── config/
│       └── types.ts               ← SiteConfig TypeScript type (not edited by sellers)
│
├── scripts/
│   └── sync-images.ts
│
├── tailwind.config.ts
├── next.config.ts                 ← imports content/config.ts for deploymentMode
├── tsconfig.json
├── package.json
├── DESIGN.md
└── TECH_REQUIREMENTS.md
```

---

## 17. Extensibility Register

| Future feature | Designated extension point |
|---|---|
| Client-side search | `fuse.js`; index JSON built from `loadCategories()` at build time, embedded in page |
| Contact form / enquiry | Serverless function; `ContactSection` has a reserved slot |
| Analytics | Script tag in `SiteHeader.tsx`; no other changes |
| Dark mode | `tailwind darkMode: 'class'` + toggle in `SiteHeader`; Aceternity components inherit |
| i18n | `content/config.ts` string keys; item JSON can carry `name_zh`, `description_zh`, etc. |
| Sitemap / RSS | `next-sitemap`; all static routes already known at build |
| Draft preview | Next.js middleware on `/preview/[category]/[item]`; reads `status: "draft"` items |
| Tag filtering | Tags already stored; add tag index to loader + filter UI |

---

*All open questions from v0.1.0 are resolved. Implementation may begin.*
