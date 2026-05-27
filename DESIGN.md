# UsedExchange — Project Design Document

**Version:** 0.5.0  
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
- Distance-tiered pricing per item with automatic visitor-location detection (browser Geolocation API, client-side only)
- Photo gallery per item, sourced from the item folder
- Rich, privacy-respecting contact section with social platform links and QR code support
- Clean, extensible codebase designed for second development

### Non-Goals (v1)
- Real-time inventory updates without a rebuild
- Buyer-facing checkout or payment processing
- User authentication or seller dashboard
- Full-text search (client-side filtering only)
- Server-side geolocation or IP-lookup — not implemented in v1. Visitor distance is calculated entirely in the browser. The v1 site has no server functions that could receive visitor coordinates. (If a serverless contact form is added in a future version per §18 Extensibility, it must not accept or log visitor location data.)
- Multi-seller or concurrent write support — this is a **single-seller design**. The manifest and config files are owned by one person. Running `pnpm upload-images` concurrently from two machines is undefined behavior; the last writer wins.

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
  3. git add content/items/<category>/my-item/item.json lib/generated/image-manifest.json
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
  ├── Purge stale manifest entries for image files that no longer exist in content/items/
  │     (handles deleted item folders — CDN blobs are NOT deleted, only the URL references)
  ├── Write lib/generated/image-manifest.json  ← COMMITTED to git
  │     { "houseware/ikea-desk-lamp/cover.jpg": "https://cdn.example/cover.jpg", … }
  ├── Write .image-cache/checksums.json        ← gitignored (local speed cache)
  │
  └── ⚠️  Print BACKUP REMINDER  (see TECH_REQUIREMENTS.md §7 for exact output)

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
> Photos are **not in git** (gitignored) and cloud storage (Blob/R2) is a **delivery layer, not a backup**. Cloud storage can be accidentally wiped. The script prints a reminder after every upload — see **TECH_REQUIREMENTS.md §7** for the exact printed output. That section is the single source of truth for the reminder text.

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
| Thumbnail | File named `cover.*` is pinned as thumbnail; otherwise the loader sorts image files case-insensitively in ascending Unicode order (e.g., `a.jpg` before `b.jpg`) and uses the first. The loader must sort explicitly — never rely on `readdir` order (differs between macOS HFS+ and Linux/Vercel). |
| Other files | Silently ignored (no crash). The loader reads only the file literally named `item.json` — all other `.json` files in an item folder are ignored. |
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
    "currency": "USD",
    // ^ ISO 4217. Precedence: item-level price.currency overrides siteConfig.currency.
    //   If absent, falls back to siteConfig.currency (default "USD").
    "tiers": [
      // Each tier needs at minimum a label and amount.
      // miles_min / miles_max are both optional (open-ended tier = omit miles_max field entirely).
      // "Open-ended" means the miles_max JSON field is ABSENT (not a large number).
      // ⚠️  Tier boundaries must be contiguous. A visitor at 5.5 mi falls in a gap
      //     between max=5 and min=6. The resolver falls back to "nearest tier by miles_max."
      //     Sellers should use inclusive/overlapping boundaries to avoid gaps.
      { "label": "Pickup / ≤ 5 mi",  "miles_max": 5,   "amount": 15 },
      { "label": "6 – 15 mi",        "miles_min": 5,   "miles_max": 15, "amount": 20 },
      { "label": "16 – 30 mi",       "miles_min": 15,  "miles_max": 30, "amount": 25 },
      { "label": "Shipping",         "miles_min": 30,  "amount": 35 }
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
  "tags": ["lighting", "smart-home"],
  // ^ string[]; default []. In v1, tag chips are rendered as non-interactive <span>
  //   elements (not buttons/links). Tag filtering is a future feature (see §18).
  "category_override": "",
  // ^ DISPLAY-ONLY override. If non-empty, replaces the folder-derived category name
  //   in breadcrumbs and the item card's category label — but does NOT change:
  //   - The URL (still derived from the folder slug)
  //   - Which category page the item appears on (always the physical folder's page)
  //   - The home page category card (item always counted under its physical folder)
  //   Breadcrumb href always points to the physical category URL (e.g. /misc).
  //   Use case: rename display label without moving files.

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
2. Tie-breaker: two categories sharing the same `sort_order` value → sorted alphabetically by folder name within that group
3. Categories without `sort_order` → sorted alphabetically by folder name, appended after the sorted group
4. If no category has `sort_order`, all categories sort alphabetically (pure default)

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

    // QR-based: qr_image is the SERVED PUBLIC URL (not the source file path).
    // Source file lives at: content/contact/wechat-qr.png  (git-tracked)
    // Sync script copies it to: public/contact/wechat-qr.png
    // Config value is the resulting public URL: /contact/wechat-qr.png
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
visible = (status !== "sold")
       OR (soldItemRetentionDays === 0)            // 0 = keep forever; special case
       OR (today − effective_sold_date ≤ soldItemRetentionDays)

where effective_sold_date:
  = sold_date   if present and valid ISO 8601
  = listed_date if sold_date is absent or fails to parse
  // Note: TECH_REQUIREMENTS.md §6.3 says invalid sold_date → null.
  //       When null, this formula treats the item as "keep" (never expires).
  //       Sellers marking items sold without a sold_date will see them stay
  //       visible until manually removed or given an explicit sold_date.
```

`soldItemRetentionDays: -1` makes `today − date ≤ -1` always false → immediate hide.
`soldItemRetentionDays: 0` is a special case: `=== 0` short-circuits the formula → keep forever.

Items past retention are excluded from all pages and `generateStaticParams` entirely — their detail page is not generated.

---

## 9. URL Structure

```
/                              Home — category overview + recently listed
/[category]                    Category page — item grid with filters
/[category]/[item]             Item detail — gallery, pricing, metadata, contact
```

All routes are statically generated at build time. No `/sold` archive page in v1 (sold items stay visible on category pages with a "SOLD" overlay until retention expires).

`app/not-found.tsx` renders a 404 page with the site header, a "Page not found" message, and a link back to the home page. It is shown when a user navigates to any URL that was not generated at build time (e.g. a deleted item's former URL).

---

## 10. Page Specifications

### 10.1 Home Page (`/`)

- **Hero** — site name, tagline, CTA button (configurable in `content/config.ts`)
- **Category grid** — one card per **visible** category. A category is visible if it contains at least one item with status `available`, `reserved`, or `pending`. Categories containing only `sold`, `draft`, or retention-expired items are hidden.
- Each category card shows: icon, display name, **count of `available` items only** (does not include `reserved` or `pending`), cover image of the first `available` item
- **Recently Listed** — last N items with status `available` only (not `reserved`, `pending`, or `sold`), sorted by `listed_date` descending (configurable, default 6). If fewer than N available items exist across all categories, all available items are shown. If zero available items exist, this section is hidden entirely. Each card shows the **location-resolved price** — during pending geo state, cards show the fallback (highest) tier price, identical to the SSG initial state (no skeleton on individual cards). This section is wrapped in a `RecentlyListedSection` client component that owns its own `useGeolocation()` + `useDistancePricing()` state. `LocationPriceBar` is **not** shown on the home page — prices update silently. See §17 State Architecture.
- **OG image for home page:** Cover image of the item with the most recent `listed_date` among all available items. Tie-broken by category sort order, then item slug alphabetically. Falls back to site logo (`siteConfig.logo`) if no items exist.
- **Footer** — contact platform links, last-build timestamp, site name
- **OG metadata**: `og:title` = site name; `og:description` = `meta.description` from config; `og:image` = cover image of the first available item across all categories (or site logo if no items)

### 10.2 Category Page (`/[category]`)

- Category title, icon, description
- **Location price bar** (client component, appears above filter bar):
  - On page load, browser requests Geolocation API permission
  - Permission **granted** → calculates distance → shows `📍 ~{N} mi from {label} — prices shown for your distance` + "Change" link
  - Permission **denied / unavailable** → falls back to highest price tier → shows `📍 Location unavailable — showing maximum prices` + "Enter distance" link
  - In both states, a **"Change distance"** control allows the visitor to type a custom distance in miles; changing it immediately recalculates all displayed prices (state update in `ItemGrid`, the owner)
  - The resolved distance is stored in `ItemGrid`'s state and passed to `LocationPriceBar` as a prop; it is never sent to any server
- **Filter bar** (client-side):
  - **Condition chips**: multi-select; values are the enum set (`new`, `like-new`, `good`, `fair`, `for-parts`); all selected by default
  - **Price range slider**: operates on the **location-resolved price** for each item (the tier matching detected/entered distance). Items with no price tiers always pass the filter. During geo `pending` state, the slider initialises with min=0 and max=highest fallback-tier price across all items; when geo resolves the slider resets to the new resolved-price range. If no items in the category have defined tiers, the price slider is hidden.
  - **Status toggle**: hide/show sold items; default = sold items hidden
- **Item grid**: card per item — cover photo, name, condition badge, status badge, **location-resolved price** (updates live when distance changes). During geo `pending` state, cards show the fallback (highest) tier price — no skeleton spinners on individual card prices.
- Sold items: rendered with "SOLD" overlay when visible; hidden by default behind status toggle
- **OG metadata**: `og:title` = category display name; `og:image` = cover of first available item in category

### 10.3 Item Detail Page (`/[category]/[item]`)

- **Breadcrumb**: Home → Category → Item name
- **Photo gallery** — carousel with thumbnail strip; Aceternity animated card
- **Status + condition badges** — top-right of hero
- **Name + description** (Markdown rendered)
- **Pricing section** (`PricingSection` client component — wraps the next two elements and owns geo+distance state):
  - **Distance indicator** — `LocationPriceBar`; appears **above** the pricing table so the visitor sees the context (their distance) before the number. Shows detected distance and "Change distance" control.
  - **Pricing table** — shows **only the resolved tier** for the visitor's distance (one row); "OBO" if `negotiable: true`; "Contact for price" if no tiers. A collapsed **"View all pricing tiers ▼"** toggle below the row expands the full tier list with the resolved row highlighted. **Toggle expand/collapse state is independent of distance changes**: changing the distance updates which tier is highlighted but does not collapse an already-expanded toggle. Toggle state is `useState` only and does not persist across navigations.
  - **Initial SSG state (before JS loads):** The static HTML renders the **highest price tier** (`resolveItemPrice(item.price, { source: "fallback" })` — called as a pure function by the server page, not a hook). The result is passed as `initialResolvedTier` prop to `PricingSection`, which uses it as the `useState` initial value. After hydration, `PricingSection` re-renders with the geo-resolved tier. Progressive enhancement: never a blank or spinner in the pre-JS render.
  - **Social media / crawler note:** Because static HTML always shows the highest tier, social previews (Open Graph, Twitter card) and search engine snippets always display the maximum price. Sellers with large tier spreads should be aware of this.
- **If `item.status === "sold"`:** A prominent "SOLD" banner appears at the top of the page. The contact section CTA is disabled or hidden. `sold_date` is displayed if present. The page is still accessible via direct URL (within the retention window).
- **Metadata table** — brand, model, dimensions, weight, original source (linked), original price
- **Contact section** — platform buttons behind click-to-reveal (configurable); preferred payment methods; item-level `contact_note`. There is no separate "Contact Seller" anchor button near the pricing area in v1 — the section is discovered by scrolling.
- The same `ContactSection` component is reused in the site **footer**, where it receives `preferredPayment: []` and `contactNote: ""`. The component renders neither block when these are empty, so the footer shows only the platform buttons. No separate footer variant component is needed.
- **Tags** — rendered as chips (click → future filter)
- **OG metadata**: `og:title` = item name; `og:description` = `meta_description` (auto-generated from first 160 chars of description if empty); `og:image` = `coverImage` URL (CDN URL or local path)

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
  ├── loadCategories()              → Category[]       (used by all pages)
  ├── loadItemsByCategory(slug)     → Item[]           (used by category page)
  ├── loadItem(catSlug, itemSlug)   → Item | null      (used by item detail page)
  └── loadAllItems()                → Item[]           (used by home page "Recently Listed";
                                                        filters: available status only, no draft, no expired-sold)
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
├── home/
│   └── RecentlyListedSection.tsx  ← client component; owns geo+distance state for home page cards
│
├── category/
│   ├── CategoryCard.tsx
│   └── CategoryGrid.tsx
│
├── item/
│   ├── ItemCard.tsx               ← receives resolvedPrice prop (computed by parent)
│   ├── ItemGrid.tsx               ← client component; holds distance state, passes to cards
│   ├── ItemGallery.tsx            ← photo carousel (client component)
│   ├── PricingSection.tsx         ← client component; owns geo+distance state for item detail page;
│   │                                 renders LocationPriceBar + PricingTable for the item detail page
│   ├── PricingTable.tsx           ← presentational component (usable in both server and client contexts);
│   │                                 receives resolvedTier prop; renders resolved tier row + toggle
│   ├── PricingTableToggle.tsx     ← client component; owns expand/collapse state; shows full tier list
│   ├── MetadataTable.tsx
│   ├── StatusBadge.tsx
│   └── ConditionBadge.tsx
│
├── contact/
│   ├── ContactSection.tsx         ← reveal wrapper + platform list
│   ├── PlatformButton.tsx         ← single platform button (link or QR trigger)
│   └── QRModal.tsx                ← modal with QR image (client component)
│
├── pricing/
│   ├── LocationPriceBar.tsx       ← client component; permission request + distance display + override
│   ├── useGeolocation.ts          ← hook: wraps navigator.geolocation, returns {lat, lng, status}
│   └── useDistancePricing.ts      ← hook: (sellerCoords, visitorCoords | distanceMi) → resolvedTier
│
├── filters/
│   ├── FilterBar.tsx              ← client component; receives resolvedDistanceMi as prop
│   └── useFilters.ts
│
└── common/
    └── AdaptiveImage.tsx          ← next/image vs <img> switch by deploymentMode
```

### Component Rules
- `ui/` — Aceternity originals; extend by wrapping, never modifying in place
- Prop types derived from `lib/content/types.ts`; no raw JSON objects passed to components
- `"use client"` on: `RecentlyListedSection`, `ItemGrid`, `PricingSection`, `ItemGallery`, `FilterBar`, `ContactSection`, `PlatformButton`, `QRModal`, `LocationPriceBar`, `PricingTableToggle`
  - `PlatformButton` requires `"use client"` because it receives an `onClick` function prop (state setter from `ContactSection`) — function props are not serialisable across the server/client boundary.
  - Note: `PricingTable` is NOT in this list. It is a presentational component (no hooks, no `"use client"`). However, it always renders inside `PricingSection` (a client component) in practice because it renders `PricingTableToggle` (a client component) as a child. `PricingTable` alone (without its toggle child) could be rendered in a server context, but this is not used in v1.
- All other components are React Server Components
- Visitor coordinates are **never passed outside the browser** — all distance math runs in `useDistancePricing.ts`
- **`content/config.ts` is imported by client components** (e.g., `AdaptiveImage`, `PricingSection`). Therefore it must not use any Node.js-only APIs (`fs`, `path`, `process.env` at module level). All values must be static, serialisable constants.
- **Cross-folder dependency:** `components/filters/useFilters.ts` imports `resolveItemPrice` from `lib/utils/pricing.ts`. This cross-package import is intentional and documented.
- **`resolveItemPrice` performance:** Calling `resolveItemPrice` per item on every distance change re-renders the entire item list. The function is intentionally cheap (simple array scan). No `useMemo` is required for typical collections (< 100 items). If performance issues arise with large collections, memoize in `ItemGrid`/`RecentlyListedSection` with `useMemo([items, resolvedDistance])`.
- **`FilterBar` prop type for fallback:** When `resolved.source === "fallback"` (no location), `ItemGrid` passes `resolvedDistanceMi={Infinity}` to `FilterBar`. The slider then initialises using fallback (highest) prices, which is the conservative maximum.

---

## 13. Configuration — `content/config.ts`

This file lives inside `content/` alongside the items and QR codes. It is the only TypeScript file sellers ever edit. App code imports it as `import { siteConfig } from "@/content/config"`.

> ⚠️ **`content/config.ts` is imported by client components** and therefore becomes part of the browser bundle. All field values must be static, serialisable constants. Do not use Node.js APIs (`fs`, `path`, `process.env`, etc.) at the module level. Seller coordinates, contact handles, and site name are all intentionally public — they appear in page source.

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

  // ── Seller location (used for distance-based price tier resolution) ────────
  // Find coordinates at maps.google.com → right-click → "What's here?"
  // These coordinates are embedded in the static site at build time and are
  // therefore publicly visible in the page source. Use a nearby landmark
  // or intersection if you prefer not to expose your exact address.
  location: {
    lat: 37.7749,
    lng: -122.4194,
    label: "San Francisco, CA",              // shown in the distance indicator UI
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
  ├── [prebuild]  scripts/sync-images.ts  (build-check mode)
  │     ├── No image files in content/items/ (gitignored — not on Vercel's runner)
  │     ├── content/contact/** present (git-tracked) → copies to public/contact/
  │     ├── Reads existing lib/generated/image-manifest.json  (committed)
  │     └── Logs: "manifest present (N entries) — skipping upload"
  │
  ├── next build
  │     loader.ts reads manifest → all image URLs resolve to CDN
  │     generateStaticParams runs for all non-draft, non-expired items
  │     All pages rendered to static HTML + JSON
  │     If deploymentMode === "static": output: 'export' → out/
  │
  └── [postbuild] (optional)
        next-sitemap → sitemap.xml + robots.txt

── LOCAL BUILD (imageStorage.provider === "local", seller's machine) ─────────
pnpm build
  │
  ├── [prebuild]  scripts/sync-images.ts  (build-check mode — local provider branch)
  │     Photos present locally → copied to public/items/ (same as dev-sync)
  │     content/contact/ → copied to public/contact/
  │     Images are included in the built output (out/) — suitable for self-hosted servers
  │     ⚠️  Do NOT use this mode on Vercel (photos are gitignored on Vercel's runner)
  │
  └── next build → out/ includes all images; deploy entire out/ to static host

── LOCAL DEV ────────────────────────────────────────────────────────────────
pnpm dev
  │
  ├── sync-images.ts  (always runs in "local" mode regardless of provider config)
  │     content/items/ photos → copied to public/items/
  │     content/contact/ → copied to public/contact/
  │     Falls back gracefully if content/items/ has no images
  │
  └── next dev --turbo
        Images served from public/items/ and public/contact/
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
│   ├── utils/
│   │   ├── haversine.ts           ← pure haversineInMiles() distance function; zero deps
│   │   └── pricing.ts             ← pure resolveItemPrice() function; importable by server components
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

## 17. Geolocation & Distance Pricing Architecture

### Definitions

| Term | Meaning |
|---|---|
| **Seller** | The person who deploys this site. Configured once in `content/config.ts`. |
| **Visitor** | Any person browsing the deployed site. Location is detected at runtime in their browser. |

### Seller Location

Stored in `content/config.ts` as `location: { lat, lng, label }`. Embedded into the static site at build time. Because it is part of the compiled output, it is **publicly visible in page source**. Sellers should use a nearby intersection or landmark rather than a precise home address if privacy is a concern.

### Visitor Location Detection Flow

```
Visitor loads a category or item page
  │
  ├── [Status: idle]  ← initial state before first useEffect fires
  │     Treated identically to "pending" in all rendering code.
  │     Transition idle → pending happens synchronously in the first useEffect call;
  │     idle is never user-visible. LocationPriceBar renders the same as pending.
  │
  ├── Browser calls navigator.geolocation.getCurrentPosition() (in useEffect)
  │   → status becomes "pending"
  │
  ├── [Status: pending]
  │     UI shows: "Detecting your location…" with skeleton in LocationPriceBar
  │     Item cards show fallback (highest) tier price — no card-level skeletons
  │     Resolves to granted or denied path below
  │
  ├── [Status: granted]
  │     Visitor coordinates received (stays in browser memory only)
  │     Haversine distance calculated: D = haversineInMiles(seller.lat, seller.lng, visitor.lat, visitor.lng)
  │     → resolveDistanceMi = D  (in miles)
  │
  └── [Status: denied | unavailable | timeout]
        → resolveDistanceMi = Infinity  (triggers highest-price fallback)
        UI shows: "Location unavailable — showing maximum prices"

Distance override (always available regardless of permission status):
  Visitor clicks "Change distance" → types a number → resolveDistanceMi = entered value
  All prices and filter bar recalculate immediately
  (state update in the owning component: ItemGrid on category page, PricingSection on item detail)
```

### Price Tier Resolution

Given `resolveDistanceMi` and an item's `price.tiers` array:

```
resolveDistanceMi = Infinity  →  use tier whose miles_max field is ABSENT (open-ended)
                                  "open-ended" means miles_max key is absent in JSON —
                                  a large numeric value (e.g. 99999) is NOT open-ended
                                  if multiple open-ended tiers exist, use the first in array order
                                  if no open-ended tier exists, use tier with highest amount
                                  (tie on highest amount: use first in array order)
resolveDistanceMi = D         →  find the first tier where:
                                    (miles_min ?? 0) ≤ D ≤ (miles_max ?? Infinity)
                                  if no tier matches D (gap between tiers), use the tier
                                    whose miles_max is closest to D from below
                                  if price.tiers is empty → show "Contact for price"
```

> **Distance unit:** All `miles_min`, `miles_max` values in `item.json` and all runtime distance calculations are in **miles**. This is a fixed v1 constraint. A km toggle is listed in §18 Extensibility Register.

> ⚠️ **Sellers should ensure contiguous tier boundaries to avoid gaps.** See §5 `price.tiers` example for recommended overlap convention.

`resolveItemPrice` is a pure function (no hooks, no side effects, fully testable). It lives in **`lib/utils/pricing.ts`** — a separate file without `"use client"`, so it can be imported by both server components (item detail page SSG initial render) and client components (`PricingSection`, `ItemGrid`, `RecentlyListedSection`, `useFilters.ts`).

### Price Tier Display Rule

Only the resolved tier is shown by default. All other tiers are hidden.

| Context | Default display | Expand available? |
|---|---|---|
| Item card (category grid, home page) | Resolved tier price only | No — cards are too compact |
| Item detail page pricing table | Resolved tier row only | Yes — "View all pricing tiers ▼" collapsed toggle |

The expand toggle is always present on the item detail page regardless of geo state (granted, denied, or manual). When expanded, all tiers are listed with the resolved tier visually highlighted (bold or accent colour). Collapsing returns to single-row view.

### State Architecture

Distance state is owned by `ItemGrid` (category page) and `PricingSection` (item detail page). It is passed down as a prop to child components. `LocationPriceBar` is a controlled component — it reads and writes through a callback, never owning the state itself.

```
Category page (/[category]/page.tsx — server component)
  └── ItemGrid  (client, owns: resolvedDistance, setResolvedDistance)
        ├── LocationPriceBar  ← reads resolvedDistance; calls setter on override
        ├── FilterBar         ← receives resolvedDistance for price range basis
        └── ItemCard[]        ← each receives resolvedPrice = resolveItemPrice(item.price, resolvedDistance)

Item detail page (/[category]/[item]/page.tsx — server component)
  └── PricingSection  (client, owns: resolvedDistance, setResolvedDistance)
        ├── LocationPriceBar  ← same component, same pattern
        └── PricingTable      ← receives resolvedTier = resolveItemPrice(item.price, resolvedDistance)
              └── PricingTableToggle  ← expand/collapse; receives all tiers + resolved tier index

Home page (/page.tsx — server component)
  └── RecentlyListedSection  (client, owns: resolvedDistance, setResolvedDistance)
        └── ItemCard[]        ← each receives resolvedPrice; NO LocationPriceBar shown on home page
```

> **Home page LocationPriceBar decision:** The home page does **not** render `LocationPriceBar`. The "Recently Listed" cards silently update their prices as geolocation resolves. Showing the distance indicator on the home page would be visual noise given the hero/category-grid context. Buyers who want to see their distance and override it should visit a category or item page.

> **Per-page state note:** Geolocation state is `useState` only — it does not persist across Next.js page navigations. Navigating Home → Category → Item Detail fires `useGeolocation()` on each mount. The browser returns from its permission cache instantly (within `maximumAge: 300_000 ms`), so there is no visible delay after the first resolution. This is the intended behaviour; no cross-page state persistence is needed or implemented.

### Privacy Guarantee

- Visitor coordinates are held in React component state (`useState`) only
- They are never written to `localStorage`, `sessionStorage`, cookies, or any network request
- The seller's coordinates (`content/config.ts`) are part of the static bundle and are intentionally public

### Hook Specifications

#### `useGeolocation()`
```ts
type GeolocationState =
  | { status: "idle" }       // before first useEffect; treat same as "pending" in all UI code
  | { status: "pending" }
  | { status: "granted"; lat: number; lng: number }
  | { status: "denied" }
  | { status: "unavailable" };   // browser doesn't support navigator.geolocation

// Returns current geolocation state.
// Triggers navigator.geolocation.getCurrentPosition() in first useEffect call.
// "idle" is the initial useState value; the hook transitions to "pending" immediately.
// "idle" must be treated identically to "pending" in all rendering code.
// Does NOT retry automatically on denial.
export function useGeolocation(): GeolocationState;
```

#### `useDistancePricing(sellerLocation, geoState)`
```ts
type ResolvedDistance =
  | { source: "detected"; miles: number }
  | { source: "manual";   miles: number }
  | { source: "fallback" };               // denied / unavailable / idle / pending → highest price

// When geoState.status is "idle" or "pending", returns { source: "fallback" }
// so all rendering code can proceed with fallback prices without special-casing "pending".
// Automatically updates when geoState transitions to granted/denied.
export function useDistancePricing(
  sellerLocation: { lat: number; lng: number },
  geoState: GeolocationState
): {
  resolved: ResolvedDistance;
  setManualMiles: (miles: number | null) => void;  // null = clear override, revert to detected/fallback
};
```

#### `resolveItemPrice(price, resolved)` — in `lib/utils/pricing.ts`
```ts
// Pure function. No hooks. No side effects. No "use client" directive.
// File: lib/utils/pricing.ts  ← importable by server components AND client components
// Used by: server page (SSG initial render), ItemCard, PricingTable, PricingSection, useFilters.ts
// Does NOT call haversineInMiles() — distance is pre-resolved by useDistancePricing().
// Returns the applicable PriceTier, or null if no tiers defined.
export function resolveItemPrice(
  price: Price,
  resolved: ResolvedDistance
): PriceTier | null;
```

---

## 18. Extensibility Register

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
| Distance unit toggle | Add `distanceUnit: "mi" \| "km"` to config; `useDistancePricing` converts before display |
| Cached location | Store `resolveDistanceMi` in `sessionStorage` to persist across page navigations within the same session. Add as opt-in config flag (`cacheLocationInSession: true`). Must be gated behind user consent or explicit config opt-in — not on by default. |
| Local image optimisation | Add `sharp` as a devDependency; run a pre-build image resizing step that processes photos in `content/items/` before the sync script uploads them. Extension point: add an optional `preprocess` step to the `upload` mode in `scripts/sync-images.ts`. |
| `pnpm clean-storage` | Script to reconcile orphaned CDN blobs (present in Blob/R2 but absent from manifest) and delete them. Requires provider-specific list+delete API calls. |

---

*All open questions from v0.1.0 are resolved. Implementation may begin.*
