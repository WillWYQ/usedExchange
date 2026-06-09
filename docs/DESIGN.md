# UsedExchange — Project Design Document

**Version:** 0.9.1  
**Date:** 2026-06-01  
**Status:** Decisions Resolved — Ready for Implementation

---

## 1. Project Overview

UsedExchange is a statically-generated personal web storefront for listing second-hand items for sale. Content is managed entirely through the local file system — no database, no CMS. The seller adds a folder per item, drops in photos and a `item.json` metadata file, then triggers a build; the site regenerates automatically.

The UI is built on [Aceternity UI](https://ui.aceternity.com) (React + Tailwind CSS) for a polished browsing experience. The architecture is modularised so any part — deployment target, image strategy, contact platforms — can be swapped without restructuring the codebase.

### Target Users

#### Primary — College Students with a CS Background
The designed-for user. Comfortable with git, the terminal, JSON editing, and a git-push → GitHub Pages deployment workflow (Vercel also supported). They encounter this project as a practical, portfolio-worthy tool they can actually use.

**Profile:**
- Sells items common to student life: textbooks, electronics (GPU, keyboard, monitors, mechanical gear), dorm furniture, bikes, gaming equipment, academic software licenses
- Operates in a tight geographic radius (campus + nearby neighbourhoods, typically 0–10 miles)
- Contact preferences lean toward: **Discord** (primary for CS communities), Instagram, WhatsApp, WeChat (international students), Venmo/Zelle for payment
- Selling rhythm is semester-driven — major sell-offs happen at the end of each semester (May and December)
- Price-sensitive buyers in the same network; word-of-mouth and Discord server sharing are primary discovery channels
- Already uses Vercel or GitHub for coursework; free Hobby plan is a natural fit
- Comfortable running `pnpm upload-images` and `git push` as a workflow

**What this means for the design:**
- Git-based workflow is acceptable (not a barrier)
- Terminal scripts (`pnpm mark-sold`, `pnpm create-item`, etc.) are welcome
- Discord must be a supported contact platform
- Default distance tiers should be short-range (pickup-first)
- The `content/` single-folder rule protects non-code files from accidental breakage

#### Potential — Non-CS Users Willing to Try
A broader audience reachable once the project gains visibility (campus blog post, a friend's referral, a CS student setting it up for a parent or roommate). These users are not comfortable with code or the terminal.

**Profile:**
- Anyone wanting a personal, private alternative to Facebook Marketplace or OfferUp
- Not comfortable with: JSON editing, git commands, terminal, Vercel dashboard
- Need: a one-time setup done by the CS student friend, then only the `content/` folder touched going forward

**What this means for the design:**
- The `content/` single-folder rule is the core accessibility feature — everything they touch is in one place, no code required
- CLI tools (`pnpm mark-sold`, etc.) lower the barrier further — no JSON editing for common operations
- A future local seller dashboard (FEATURES_ROADMAP.md Tier 3) is the ultimate accessibility unlock for this segment
- Documentation and error messages must assume zero terminal knowledge

---

## 2. Goals & Non-Goals

### Goals
- Zero-database, file-system-driven content management
- Build-time static generation; output hostable on GitHub Pages, Vercel, or any static host
- Modularised deployment adapter: GitHub Pages–optimised by default, Vercel and self-host ready via config switch
- Graceful schema degradation: missing optional JSON fields never crash the build or the page
- Distance-tiered pricing per item with automatic visitor-location detection (browser Geolocation API, client-side only)
- Photo gallery per item, sourced from the item folder
- Rich, privacy-respecting contact section with social platform links and QR code support
- Clean, extensible codebase designed for second development
- Configurable Aceternity UI visual components for four independent slots (background, item grid layout, photo gallery, item card effect) — swappable via a single config line per slot

### Non-Goals (v1)
- Real-time inventory updates without a rebuild
- Buyer-facing checkout or payment processing (Stripe payment *links* are supported as external links, not in-app checkout)
- User authentication or seller dashboard UI
- Server-side geolocation or IP-lookup — visitor distance is calculated entirely in the browser; no coordinates leave the device
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
| Primary host | **GitHub Pages** | Static export via GitHub Actions; free, no vendor lock-in |
| Alternate host | **Vercel Hobby** or any static server | Vercel mode additionally enables `next/image` optimisation |

### Deployment Modes

The app supports two modes toggled by a single config value in `content/config.ts`:

| Mode | `deploymentMode` | Next.js config | Image strategy |
|---|---|---|---|
| Static / GitHub Pages **(default)** | `"static"` | `output: 'export'` | Plain `<img>` via `AdaptiveImage` — images served directly from CDN |
| Vercel | `"vercel"` | Default (server functions allowed) | `next/image` with Vercel optimisation |

The `<AdaptiveImage>` component switches internally based on `deploymentMode` — no callsite changes needed when switching modes.

### Image Storage Architecture

#### The Problem

Images should not live in the git repository or the deployment output. Committing photos makes every `git push` slower as the collection grows. Including them in the build output bloats the deploy: 100 items × 5 photos × 2 MB = 1 GB — far beyond what any platform handles comfortably (GitHub Pages recommends < 1 GB per repo; Vercel Hobby enforces a 100 MB built-output limit). The actual HTML/CSS/JS for this site is tiny.

The naive solution (copy images into `public/` at build time) breaks at scale on any platform. The seller-hostile solution (manually upload images to a storage console) defeats the file-system-first design. The correct solution is an **automated image storage adapter** that runs transparently during the build.

#### Design Principle

**Item photos are local-only source files — not committed to git.**

Committing photos would: (a) make every `git push` slow as photo collections grow, and (b) still not solve the 100 MB deployment limit since photos would eventually exceed it in the repo too. Instead:

- **JSON metadata files** stay in git — they're tiny text files, the inventory catalogue.
- **Photos** stay on the seller's machine and are uploaded directly to cloud storage by a single command.
- **The image manifest** (`lib/generated/image-manifest.json`) is committed — it maps each photo to its CDN URL. This is the only artifact the CI build (GitHub Actions or Vercel) needs.
- **QR code images** live in `content/contact/` (git-tracked, tiny < 50 KB). The sync script copies them to `public/contact/` so Next.js can serve them.

**All seller-managed files live in one folder: `content/`.** App code never needs to be touched for routine listing updates, config changes, or adding new categories.

#### Seller Workflow

```
Adding a new item:
  1. Create content/items/category/my-item/  with item.json + photos
  2. pnpm upload-images              uploads photos → CDN, updates manifest
  3. git add content/items/<category>/my-item/item.json lib/generated/image-manifest.json
  4. git push                        GitHub Actions builds and deploys; images already on CDN

Updating photos:
  1. Replace / add photos in content/items/category/my-item/
  2. pnpm upload-images              detects changed checksums, re-uploads only changed files
  3. git add lib/generated/image-manifest.json && git push

Code-only change (no photo edits):
  1. Edit content/items/**/item.json  or  content/config.ts
  2. git add ... && git push         CI builds; manifest unchanged, no uploads needed
```

#### Image Storage Tiers

| `imageStorage.provider` | Best for | Deployment size | Seller effort |
|---|---|---|---|
| `"cloudflare-r2"` *(recommended)* | GitHub Pages, any static host — zero egress cost | Images excluded — served from R2 CDN | 5 env vars, once |
| `"vercel-blob"` | Vercel deployments | Images excluded — served from Blob CDN | 1 env var, once |
| `"local"` | Local dev / self-hosted with no size concerns | Images included in output | None |

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

CI BUILD (GitHub Actions / Vercel) — pnpm build (no photos present; reads committed manifest)
  │
  ├── prebuild: scripts/sync-images.ts
  │     ├── No image files in content/items/ (gitignored — not on the CI runner)
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

On the CI runner (GitHub Actions or Vercel), `manifest[key]` is always populated (the manifest is committed). The fallback path is only used in local dev before `pnpm upload-images` has been run for that image.

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
| Thumbnail | File named `cover.*` is pinned as thumbnail; otherwise the loader sorts remaining filenames with `filenames.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))` and uses the first result (e.g. `a.jpg` before `B.jpg` before `c.jpg`). The loader must sort explicitly — never rely on `readdir` order (differs between macOS HFS+ and Linux/Vercel). |
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
    "negotiable": true,                        // boolean, default false; renders "OBO" on price
    "show_tiers": false                        // boolean, default false; whether buyers may expand
                                                //   "View all pricing tiers" on the item detail page.
                                                //   Off by default — sellers may not want buyers to
                                                //   see e.g. how much cheaper pickup is than shipping.
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

  "listed_date": "2026-05-25",               // date-only YYYY-MM-DD; default: build date
  "sold_date": "2026-05-28",                 // date-only YYYY-MM-DD; used for retention calculation
  // ^ if status is "sold" and sold_date is absent, listed_date is used as fallback
  // ^ pnpm mark-sold writes YYYY-MM-DD. Full ISO timestamps are also accepted and parsed correctly.

  "reserved_for": "",
  // ^ string; buyer name/contact — NOT rendered on page, kept private in json

  // ── Contact preferences (item-level overrides; site config is the default) ─
  "preferred_payment": ["Venmo", "Cash"],     // array of strings; default []
  "contact_note": "",                         // string; shown below contact links on item page

  // ── Categorisation ────────────────────────────────────────────────────────
  "tags": ["lighting", "smart-home"],
  // ^ string[]; default []. Tags are indexed by the full-text search engine (fuse.js)
  //   so buyers can find items by tag. Tag chips on item detail pages are non-interactive
  //   <span> elements in v1 (dedicated tag filter page is a future feature).
  "category_override": "",
  // ^ DISPLAY-ONLY override. If non-empty, replaces the folder-derived category name
  //   in breadcrumbs and the item card's category label — but does NOT change:
  //   - The URL (still derived from the folder slug)
  //   - Which category page the item appears on (always the physical folder's page)
  //   - The home page category card (item always counted under its physical folder)
  //   Breadcrumb href always points to the physical category URL (e.g. /misc).
  //   Use case: rename display label without moving files.

  // ── SEO ───────────────────────────────────────────────────────────────────
  "meta_description": "",
  // ^ if empty, auto-generated from first 160 chars of description

  // ── Pricing signals ──────────────────────────────────────────────────────
  "no_lowball": false,
  // ^ shows "Firm Price" badge; supplements price.negotiable: false
  "price_reduced": false,
  // ^ shows "Price Reduced" chip on item card and detail page
  "previous_lowest_price": null,
  // ^ number; if price_reduced is true and this is set, shown struck-through beside current price
  "min_acceptable_offer": null,
  // ^ number; if set and price.negotiable is true, enables the "Make an Offer" button.
  //   Offers below this threshold show a gentle rejection message client-side.

  // ── Payment links ─────────────────────────────────────────────────────────
  "stripe_payment_link": "",
  // ^ Stripe Payment Link URL; shows "Pay Deposit" button on item detail page
  "venmo_payment_request": "",
  // ^ Optional: Venmo payment request URL for a specific amount. When non-empty, renders a
  //   "Pay with Venmo" button on the item detail page (parallel to the Stripe "Pay Deposit" button).
  //   Format: https://venmo.com/?txn=pay&recipients={username}&amount={price}&note={item.name}
  //   If empty, no button is shown; the Venmo contact platform link (profile) remains available.

  // ── Logistics ────────────────────────────────────────────────────────────
  "pickup_windows": [],
  // ^ string[]; e.g. ["Weekday evenings 6–9pm", "Saturday 10am–2pm"]
  "youtube_link": "",
  // ^ demo video URL; shown as "Watch Demo" button on item detail page

  // ── Textbook-specific (all optional, gracefully ignored for non-textbooks) ─
  "isbn": "",
  // ^ ISBN-10 or ISBN-13; enables "Compare prices" link via bookfinder.com
  "course": "",
  // ^ e.g. "CS101", "MATH230" — shown as badge, searchable via full-text search
  "edition": "",
  // ^ e.g. "3rd Edition"
  "semester_listed": "",
  // ^ e.g. "Spring 2026" — helps buyer confirm the textbook is current edition

  // ── Internationalisation ──────────────────────────────────────────────────
  "name_zh": "",
  // ^ Chinese display name; shown when the active locale is "zh" (selected at runtime via LocaleSwitcher; SSG renders siteConfig.i18n.defaultLocale). See TECH §22.8.
  "description_zh": ""
  // ^ Chinese description; same condition.
  // Pattern: name_{locale} / description_{locale}. v1 carries the _zh variants concretely in the
  // Zod schema (TECH §6) and Item type (TECH §8). Adding another locale (e.g. "es") means adding its
  // name_{locale}/description_{locale} fields there too; otherwise getLocalizedField falls back to English. See TECH §22.8.
}
```

### Field defaults summary

| Field | Default |
|---|---|
| `price.currency` | `"USD"` |
| `price.tiers` | `[]` → shows "Contact for price" |
| `price.negotiable` | `false` |
| `price.show_tiers` | `false` → "View all pricing tiers" toggle hidden from buyers |
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
    { type: "discord",   value: "123456789012345678" },
    // ^ Discord numeric user ID (17–19 digits; typically 18). Find yours: Discord → Settings → Advanced → Developer Mode ON
    //   → right-click your username → Copy User ID.
    //   Opens a direct message link. Alternatively, use a server invite code for a trade server.
    { type: "facebook",  value: "your.username" },
    { type: "instagram", value: "your_handle" },
    { type: "snapchat",  value: "your_username" },
    { type: "whatsapp",  value: "+11234567890" },   // E.164 format
    { type: "twitter",   value: "your_handle" },
    { type: "tiktok",    value: "@your_handle" },
    { type: "linkedin",  value: "in/your-name" },
    { type: "youtube",   value: "@your_channel" },

    // ── Payment platforms ────────────────────────────────────────────────────
    // Venmo — link-based (profile page) OR QR-based (payment code).
    //   Choose one. Link-based is simpler; QR is preferred by buyers who want to
    //   scan directly without knowing your username.
    { type: "venmo",     value: "your_username" },                          // → venmo.com/u/{value}
    // { type: "venmo", qr_image: "/contact/venmo-qr.png", label: "Venmo" }, // QR alternative
    // If both value and qr_image are set on the same entry, qr_image takes precedence (QR modal shown).

    // Zelle — QR code ONLY (Zelle has no public profile URL).
    //   Generate your Zelle QR code in your bank's app and save to content/contact/.
    { type: "zelle",     qr_image: "/contact/zelle-qr.png",   label: "Zelle" },

    // ── QR-based social platforms ─────────────────────────────────────────
    // qr_image is the SERVED PUBLIC URL (not the source file path).
    // Source file lives at: content/contact/wechat-qr.png  (git-tracked)
    // Sync script copies it to: public/contact/wechat-qr.png
    // Config value is the resulting public URL: /contact/wechat-qr.png
    { type: "wechat",    qr_image: "/contact/wechat-qr.png",   label: "WeChat" },
    { type: "line",      qr_image: "/contact/line-qr.png",     label: "LINE" },
  ],
}
```

### URL Construction per Platform

| `type` | URL pattern |
|---|---|
| `email` | `mailto:{value}` |
| `discord` | `https://discord.com/users/{value}` — opens DM intent in browser or Discord app |
| `facebook` | `https://facebook.com/{value}` |
| `instagram` | `https://instagram.com/{value}` |
| `snapchat` | `https://snapchat.com/add/{value}` |
| `whatsapp` | `https://wa.me/{value}` (strips leading `+`) |
| `twitter` | `https://x.com/{value}` |
| `tiktok` | `https://tiktok.com/{value}` |
| `linkedin` | `https://linkedin.com/{value}` |
| `youtube` | `https://youtube.com/{value}` |
| `venmo` (link) | `https://venmo.com/u/{value}` |
| `venmo` (QR) | Opens modal with `<img src={qr_image}>` |
| `zelle` | QR modal only — no public profile URL; `qr_image` required |
| `wechat` / `line` / any QR type | Opens modal with `<img src={qr_image}>` |

All link-based platforms open in `target="_blank" rel="noopener noreferrer"`.

### Pre-filled Contact Messages
When a visitor clicks a link-based contact button, the message is automatically pre-filled with the item name and **geo-resolved price** (the same tier shown on screen), reducing friction for the buyer. If no tier is resolved (empty `price.tiers`), only the item name is included.

| Platform | Pre-fill method |
|---|---|
| `whatsapp` | URL query param: `?text=Hi, I'm interested in your {name} ({price}). Is it still available?` — `{price}` is the geo-resolved tier amount (e.g. `$35`); omitted when no tiers are defined |
| `email` | `?subject=Inquiry: {name}&body=Hi, I'm interested in your {name} listed at {price}...` — `{price}` same as above; omitted when no tiers are defined |
| `discord` | Not supported (Discord deep-links don't accept pre-filled text) |
| `venmo` (link) | `?txn=pay&audience=private&note={name}` appended to profile URL |
| All others | No pre-fill (platform doesn't support deep-link pre-fill) |

Pre-filling is applied at the `PlatformButton` callsite when an `item` and `resolvedPrice` are provided. `ContactSection` on the item detail page always passes both — it independently calls `useGeolocation()` + `useDistancePricing()` to resolve the price (the browser returns the cached position instantly via `maximumAge: 300_000`, so there is no second permission prompt). The footer `ContactSection` receives no item context and never pre-fills.

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
       OR (effective_sold_date === null)           // no parseable date → always keep (see note)
       OR (today − effective_sold_date ≤ soldItemRetentionDays)

where effective_sold_date:
  = sold_date    if present and valid ISO 8601
  = listed_date  if sold_date is absent or fails to parse
  = null         if listed_date is also absent or fails to parse
  // Note: TECH_REQUIREMENTS.md §6.3 says invalid dates → null.
  //       The explicit null check above short-circuits to "keep" before the
  //       arithmetic, since (today − null) evaluates to NaN in JavaScript
  //       and NaN ≤ any number is always false — without the guard, a null
  //       date would incorrectly HIDE the item instead of keeping it.
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
/all                           Browse All — all non-draft items, cross-category (sold toggleable), with filter + sort
/sold                          Sold Archive — all sold items regardless of retention window
/[category]                    Category page — item grid with filter, sort, search
/[category]/[item]             Item detail — gallery, pricing, metadata, contact, share
```

All routes are statically generated at build time.

`app/not-found.tsx` renders a 404 page with the site header, a "Page not found" message, and a link back to the home page. It is shown when a user navigates to any URL that was not generated at build time (e.g. a deleted item's former URL).

---

## 10. Page Specifications

### Global — SiteHeader
The site header appears on all pages and contains:
- Site name / logo
- **Search bar** (shown when `siteConfig.search.enabled === true`) — full-text fuse.js search; results appear inline as the user types; searches name, description, brand, model, tags, course, isbn, edition
- Navigation links (Home, Browse All if enabled)

### 10.1 Home Page (`/`)
- **Hero** — site name, tagline, CTA button (configurable in `content/config.ts`)
- **Category grid** — one card per visible category (visible = at least one `available`/`reserved`/`pending` item). Each card: icon, display name, count of `available` items only, cover image of first available item.
- **Recently Listed** — last N `available` items sorted by `listed_date` desc (default 6). Zero items → section hidden. Each card shows location-resolved price. `LocationPriceBar` not shown — prices update silently. Wrapped in `RecentlyListedSection` client component.
- **Recently Viewed** — horizontal strip of last 5 items the visitor viewed in this browser session (stored in `sessionStorage`); hidden if empty. Client component, zero server changes.
- **Footer** — contact platform links, last-build timestamp, site name
- **OG metadata** — `og:title` = site name; `og:image` = most recent available item's cover image (falls back to logo)

### 10.2 Category Page (`/[category]`)
- Category title, icon, description
- **Location price bar** — `📍 ~{N} mi` or `📍 Location unavailable` + "Change distance" override; owned by `ItemGrid`
- **Filter + sort bar** (client-side):
  - **Condition chips** — multi-select, all selected by default
  - **Sort select** — Price low→high · Price high→low · Date listed (newest) · Condition (new first); default = Date listed
  - **Price range slider** — operates on location-resolved price; hidden when no items have tiers; resets when distance changes
  - **Status toggle** — sold items hidden by default
- **"Browse All" link** — prominent link to `/all` page
- **Item grid** — cards with location-resolved prices, sort and filter applied client-side
- **OG metadata** — `og:title` = category display name; `og:image` = cover of first available item
- **Empty category** — If all items in the category are `draft` or `sold` past retention, the route is still generated (`loadCategories()` returns all category folders regardless of item visibility). The page renders an empty item grid with a "No items currently available in this category" message. A category card on the home page is hidden only when no items of any non-`draft` status exist (see §15 home page rule); the category route itself is always present.

### 10.3 Item Detail Page (`/[category]/[item]`)
- **Breadcrumb** — Home → Category → Item name
- **Photo gallery** (controlled by `ui.gallery` slot)
- **Freshness label** — "Listed 3 days ago" / "Listed today" derived from `listed_date`; shown near item name
- **Status + condition badges** — `StatusBadge` and `ConditionBadge`; condition badge has a `?` tooltip (`ConditionGuide`) explaining each condition value
- **Quantity badge** — "3 available" shown when `quantity > 1`
- **Price signals** — "Price Reduced" chip when `price_reduced: true`; "Firm Price" badge when `no_lowball: true`; struck-through `previous_lowest_price` alongside current price when `price_reduced` is true
- **Name + description** — rendered by `LocalizedItemContent` (client): the localised `<h1>` name and GitHub-Flavoured Markdown description re-render when the visitor switches locale via the header `LocaleSwitcher`. SSG emits `defaultLocale` content, so crawlers and the initial paint see the default language (see §12 Component Rules + TECH_REQUIREMENTS.md §22.8)
- **Textbook section** (shown only when `isbn` or `course` is present):
  - Course badge: "For CS101 · 3rd Edition"
  - "Compare prices" link: `https://bookfinder.com/search/?isbn={isbn}` (hidden when isbn is empty)
  - `semester_listed` shown if present
- **YouTube demo** — "Watch Demo" button linking to `youtube_link` when present
- **Pickup windows** — shown as a list when `pickup_windows` is non-empty ("Available: Weekday evenings, Saturday 10am–2pm")
- **Pricing section** (`PricingSection` client component):
  - `LocationPriceBar` (distance indicator + override)
  - `PricingTable` (resolved tier by default; "View all" toggle expands full list)
  - **"Make an Offer" button** — shown when `price.negotiable: true` AND `min_acceptable_offer` is set. Opens an inline form where the buyer types an amount, then pre-fills the contact platform message: "I'd like to offer $X for {name}." Offers below `min_acceptable_offer` show a gentle rejection message client-side without sending anything.
  - **"Pay Deposit" button** — shown when `stripe_payment_link` is non-empty; opens Stripe link in new tab
  - **"Pay with Venmo" button** — shown when `venmo_payment_request` is non-empty; opens the Venmo payment-request URL in a new tab (parallel to "Pay Deposit"). When empty, no button renders; the Venmo contact platform link remains available in the contact section.
  - **Initial SSG state** — static HTML shows highest tier (`resolveItemPrice` called server-side as pure function → passed as `initialResolvedTier` to `PricingSection`)
  - **Social media note** — crawlers always see highest tier price (intentional)
- **Metadata table** — brand, model, age, dimensions, weight, colour, original source (linked), original price; null/empty fields hidden
- **Contact section** — platform buttons with pre-filled messages; `preferred_payment` list; `contact_note`
- **Tags** — non-interactive chips (searchable via fuse.js search)
- **Share button** — native share (`navigator.share()`) on mobile; copy-link fallback on desktop; shows "Copied!" toast
- **Recently Viewed** — records this item's slug to `sessionStorage` on page mount
- **JSON-LD** — `<script type="application/ld+json">` with `@type: "Product"`, name, description, image, offers, brand; `BreadcrumbList` JSON-LD for breadcrumbs
- **If sold** — "SOLD" banner top of page; contact CTA disabled; `sold_date` displayed
- **OG metadata** — `og:title` = item name; `og:image` = coverImage; `og:type: "product"`
- **Twitter card** — `twitter:card: "summary_large_image"`; `twitter:image` = coverImage
- **Pinterest** — `product:price:amount` and `product:price:currency` meta tags (rich pin support)

### 10.4 Browse All Page (`/all`)
- All non-draft items across all categories in one grid — `available` shown by default; `reserved`/`pending` shown with status badges; `sold` hidden by the status toggle (toggle on to reveal). Same visibility set as a category page (aggregates `loadItemsByCategory()` across all categories — see §15)
- Full filter + sort bar (same as category page)
- `LocationPriceBar` + distance-resolved pricing
- No category filter (shows all); condition, sort, price, status filters apply
- "Items in: {category}" chip on each card (links to category page)

### 10.5 Sold Items Archive (`/sold`)
- All `sold` items regardless of retention window (never filtered by date)
- Items sorted by `sold_date` descending; items without `sold_date` sorted by `listed_date`
- No pricing shown (sold); no contact section
- Shows: cover image, name, condition badge, sold date, category
- Social proof for buyers: "look what sold recently"
- No filter bar (read-only archive)

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
  ├── loadAllItems()                → Item[]           (used by home page "Recently Listed" strip ONLY;
  │                                                     filters: status === "available" only, limited to
  │                                                     siteConfig.recentlyListedCount. The /all page does
  │                                                     NOT use this function — it aggregates
  │                                                     loadItemsByCategory() across all categories.)
  └── loadSoldItems()               → Item[]           (used by /sold archive page; all sold, no date filter)
  │
  │   ┌─ build-time side module (not part of page-rendering data flow) ────────┐
  │   │  lib/search/index.ts                                                   │
  │   │    buildSearchIndex() → SearchIndexEntry[]                             │
  │   │    Called by scripts/build-search-index.ts (prebuild step).            │
  │   │    Writes public/search-index.json. See TECH_REQUIREMENTS.md §22.1.   │
  │   └────────────────────────────────────────────────────────────────────────┘
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
│   ├── ItemCard.tsx               ← client; localises its title via useLocale(); receives resolvedPrice prop
│   ├── ItemGrid.tsx               ← client; holds distance state, sort state
│   ├── ItemGallery.tsx            ← photo carousel (client)
│   ├── PricingSection.tsx         ← client; owns geo+distance state; LocationPriceBar + PricingTable
│   ├── PricingTable.tsx           ← presentational; resolved tier row + toggle
│   ├── PricingTableToggle.tsx     ← client; expand/collapse state
│   ├── MakeOfferButton.tsx        ← client; inline offer form + pre-fill contact message
│   ├── MetadataTable.tsx
│   ├── StatusBadge.tsx
│   ├── ConditionBadge.tsx
│   ├── ConditionGuide.tsx         ← client; tooltip/modal explaining each condition value
│   ├── FreshnessLabel.tsx         ← client; "Listed 3 days ago" computed at view time (see §12 rules)
│   ├── QuantityBadge.tsx          ← "3 available" when quantity > 1
│   ├── TextbookBadge.tsx          ← "For CS101 · 3rd Edition" + Compare Prices link
│   └── LocalizedItemContent.tsx   ← client; localised name <h1> + Markdown description; re-renders on locale switch
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
│   ├── FilterBar.tsx              ← client; condition chips, price slider, status toggle, sort select
│   ├── SortSelect.tsx             ← client; sort by price/date/condition
│   └── useFilters.ts              ← hook; manages all filter + sort state
│
├── ui-adapters/                   ← Aceternity slot adapters (see §18)
│   ├── BackgroundEffect.tsx
│   ├── ItemGridAdapter.tsx
│   ├── GalleryAdapter.tsx
│   └── ItemCardAdapter.tsx
│
├── search/
│   ├── SearchBar.tsx              ← client component; fuse.js input in SiteHeader
│   └── useSearch.ts               ← hook: loads search-index.json, manages query + results
│
├── i18n/
│   ├── LocaleProvider.tsx         ← client; React context for active locale; reads/writes localStorage
│   ├── LocaleSwitcher.tsx         ← client; locale toggle buttons in SiteHeader; hidden when availableLocales.length ≤ 1
│   └── useLocale.ts               ← hook: reads active locale from LocaleProvider context
│
└── common/
    ├── AdaptiveImage.tsx          ← next/image vs <img> switch by deploymentMode
    ├── ShareButton.tsx            ← client; navigator.share() + copy-link fallback
    ├── JsonLd.tsx                 ← server component; renders <script type="application/ld+json">
    └── RecentlyViewed.tsx         ← client; sessionStorage-based recently-viewed strip
```

### Component Rules
- `ui/` — Aceternity originals; extend by wrapping, never modifying in place
- Prop types derived from `lib/content/types.ts`; no raw JSON objects passed to components
- `"use client"` on: `RecentlyListedSection`, `ItemGrid`, `PricingSection`, `ItemGallery`, `FilterBar`, `SortSelect`, `ContactSection`, `PlatformButton`, `QRModal`, `LocationPriceBar`, `PricingTableToggle`, `PricingTable`, `MakeOfferButton`, `ConditionGuide`, `SearchBar`, `ShareButton`, `RecentlyViewed`, `FreshnessLabel`, `ItemCard`, `LocalizedItemContent`, `LocaleProvider`, `LocaleSwitcher`, `SiteHeader`, `MetadataTable`, `ConditionBadge`, `StatusBadge`
  - `PlatformButton` requires `"use client"` because it receives an `onClick` function prop (state setter from `ContactSection`) — function props are not serialisable across the server/client boundary.
  - `SearchBar` is loaded via `next/dynamic({ ssr: false })` to avoid hydration mismatch from fuse.js.
  - `ShareButton` uses `navigator.share()` and `navigator.clipboard` — browser-only APIs.
  - `RecentlyViewed` reads/writes `sessionStorage` on mount — browser-only API.
  - `MakeOfferButton` manages offer form state and pre-fills contact platform messages.
  - `ConditionGuide` manages tooltip / modal open-close state.
  - `SortSelect` manages sort dropdown state (rendered inside FilterBar, itself client).
  - `FreshnessLabel` calculates the relative date against the visitor's live browser clock (`new Date()`) — not the SSG build time. Uses `useState`/`useEffect` to set the label after mount; renders nothing until the effect fires, so the label is never stale from the deploy date.
  - `LocaleProvider` reads `localStorage.getItem("locale")` on mount and provides the active locale via React context. Must be `"use client"` — `localStorage` is a browser-only API.
  - `LocaleSwitcher` calls `setLocale()` from `LocaleProvider` context on user interaction. Hidden when `siteConfig.i18n.availableLocales.length <= 1`.
  - `ItemCard` calls `useLocale()` to localise its title. It is always rendered inside a client parent (`ItemGrid` / `RecentlyListedSection`), so the card title updates the moment the visitor switches locale.
  - `LocalizedItemContent` renders the item detail `<h1>` name and the react-markdown description, reading `useLocale()`. Both the name and the Markdown body re-render on a locale switch without a page reload. react-markdown runs client-side here; the SSG pass still emits the `defaultLocale` description into the static HTML.
  - `SiteHeader`, `MetadataTable`, `ConditionBadge`, `StatusBadge`, `PricingTable`, `ConditionGuide` all call `useT()` to render locale-reactive UI labels. Any component that calls `useT()` must be `"use client"` because `useT()` calls `useLocale()` (a React context hook). Server Components use `getTranslations()` from `lib/i18n/getTranslations.ts` instead.
- All other components are React Server Components
- Visitor coordinates are **never passed outside the browser** — all distance math runs in `useDistancePricing.ts`
- **`content/config.ts` is imported by client components** (e.g., `AdaptiveImage`, `PricingSection`). Therefore it must not use any Node.js-only APIs (`fs`, `path`, `process.env` at module level). All values must be static, serialisable constants.
- **Localised fields render in client components.** Every visitor-facing render of `name` or `description` (`ItemCard`, `LocalizedItemContent`) calls `getLocalizedField(item, …, locale)` with `locale` from `useLocale()`. All UI labels (buttons, badges, headers) are resolved via `useT()` in client components or `getTranslations()` in server components — both drawing from `siteConfig.i18n.translations`. During SSG these render `siteConfig.i18n.defaultLocale` (the `LocaleProvider`'s initial value), so the static HTML — and therefore crawlers, OG tags, and JSON-LD — always carry the default language; non-default locales appear only after hydration when the visitor selects one. Server-only surfaces (`generateMetadata`, `<title>`, OG, JSON-LD, the breadcrumb leaf) call `getTranslations()` and intentionally stay on `defaultLocale`. See TECH_REQUIREMENTS.md §22.8.
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
  deploymentMode: "static",                   // "static" (GitHub Pages / any host) | "vercel"
  baseUrl: "https://your-domain.com",         // used for OG tags + sitemap
  // baseUrl can also be "https://your-name.vercel.app"

  // ── Image Storage ─────────────────────────────────────────────────────────
  // See DESIGN.md §3 "Image Storage Architecture" for the full rationale.
  imageStorage: {
    provider: "cloudflare-r2",
    // "cloudflare-r2" → auto-upload to Cloudflare R2; zero egress cost (recommended)
    //                   set CF_R2_* env vars in .env.local; see .env.example
    // "vercel-blob"   → auto-upload to Vercel Blob CDN; set BLOB_READ_WRITE_TOKEN
    //                   best for Vercel deployments
    // "local"         → copy to public/items/ at build (good for local dev & self-hosted)
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

  // ── UI Component Slots ────────────────────────────────────────────────────
  // See DESIGN.md §18 for the full list of options per slot.
  ui: {
    background: "none",
    itemGrid:   "simple",
    gallery:    "simple",
    itemCard:   "simple",
  },

  // ── Dark mode ─────────────────────────────────────────────────────────────
  // "media"  → automatic — follows OS/browser dark/light preference (default)
  //            No toggle needed; zero user action.
  // "class"  → manual toggle via button in SiteHeader (future extension)
  darkMode: "media" as const,

  // ── Analytics ─────────────────────────────────────────────────────────────
  analytics: {
    vercel:        false,  // Vercel Analytics — only active on Vercel deployments; no-op elsewhere
    speedInsights: false,  // Vercel Speed Insights — same; enable if deploying to Vercel
  },

  // ── Full-text search ──────────────────────────────────────────────────────
  search: {
    enabled:     true,
    placeholder: "Search items...",
    // Fields indexed: name, description, brand, model, tags, course, isbn, edition
    // Index built at build time → public/search-index.json (fetched by SearchBar via HTTP)
  },

  // ── Sitemap ───────────────────────────────────────────────────────────────
  sitemap: {
    enabled: true,
    // sitemap.xml and robots.txt generated via next-sitemap in postbuild step
    // Uses siteConfig.baseUrl as the canonical base
  },

  // ── Internationalisation ──────────────────────────────────────────────────
  // Single-instance multi-locale: all locale variants are served in one deployment.
  // Visitors switch language at runtime via the LocaleSwitcher in SiteHeader.
  // Selected locale is persisted in localStorage; static HTML always shows defaultLocale.
  //
  // Two translation layers:
  //   1. UI strings  — all 67 button/label/badge strings, defined here in translations.{locale}
  //   2. Item content — name_{locale} / description_{locale} in each item.json;
  //                     run /translate-items to batch-fill these
  //
  // The build fails (check-config) if a locale is in availableLocales but its
  // translations entry is missing or has fewer than all 67 required keys.
  i18n: {
    defaultLocale: "en",              // locale rendered in SSG static HTML; ISO 639-1
    availableLocales: ["en"],         // add "zh", "es", etc. to enable LocaleSwitcher
                                      // LocaleSwitcher is hidden when length === 1
    showLocaleSwitcher: true,         // show locale toggle in SiteHeader (when locales > 1)
    translations: {
      en: {
        // ── Navigation ────────────────────────────────────────────────────
        home: "Home",
        about: "About",
        browseAll: "Browse All",
        // ── Section headings ──────────────────────────────────────────────
        recentlyListed: "Recently Listed",
        recentlyViewed: "Recently Viewed",
        // ── Contact ───────────────────────────────────────────────────────
        contactSeller: "Contact Seller",
        itemSold: "Item sold",
        preferredPayment: "Preferred payment",
        // ── Make-offer form ───────────────────────────────────────────────
        makeOffer: "Make an Offer",
        yourOffer: "Your offer",
        send: "Send",
        belowMinimumOffer: "That offer is below the minimum we can accept. Please try a higher amount.",
        // ── Share button ──────────────────────────────────────────────────
        share: "Share",
        copied: "Copied!",
        linkCopied: "Link copied!",
        // ── Item metadata labels ───────────────────────────────────────────
        brand: "Brand",
        model: "Model",
        age: "Age",
        color: "Color",
        dimensions: "Dimensions",
        weight: "Weight",
        originalSource: "Original Source",
        originalPrice: "Original Price",
        // ── Condition badge labels ─────────────────────────────────────────
        conditionNew: "New",
        conditionLikeNew: "Like New",
        conditionGood: "Good",
        conditionFair: "Fair",
        conditionForParts: "For Parts",
        // ── Status badge labels ────────────────────────────────────────────
        statusAvailable: "Available",
        statusPending: "Pending",
        statusReserved: "Reserved",
        statusSold: "Sold",
        statusDraft: "Draft",
        // ── Filter / sort bar ──────────────────────────────────────────────
        filterShowSold: "Show sold",
        filterPrice: "Price",
        sortBy: "Sort by",
        sortNewestFirst: "Newest first",
        sortPriceLow: "Price: low → high",
        sortPriceHigh: "Price: high → low",
        sortConditionBest: "Condition: best first",
        // ── Freshness label ────────────────────────────────────────────────
        listed: "Listed",
        // ── Page titles and banners ────────────────────────────────────────
        soldBanner: "This item has been sold",
        soldArchiveTitle: "Sold Archive",
        // ── Condition guide panel ──────────────────────────────────────────
        conditionGuideTitle: "Condition Guide",
        conditionNewDesc: "Unopened, unused. Original packaging intact.",
        conditionLikeNewDesc: "Used briefly. No visible wear. May be without original box.",
        conditionGoodDesc: "Normal signs of use. Fully functional. Minor cosmetic marks.",
        conditionFairDesc: "Visible wear or light damage. Works as expected.",
        conditionForPartsDesc: "Not fully functional. Sold as-is for repair or parts.",
        // ── Location / distance price bar ──────────────────────────────────
        detectingLocation: "Detecting location…",
        fromSeller: "from seller",
        locationDetected: "Location detected",
        enterManually: "Enter manually",
        distanceManualLabel: "(manual)",
        distanceUnit: "mi",
        apply: "Apply",
        pricesAtPickupRate: "Prices shown at pickup rate",
        enterDistance: "Enter distance",
        edit: "Edit",
        clear: "Clear",
        // ── Pricing table ──────────────────────────────────────────────────
        contactForPrice: "Contact seller for pricing details.",
        contactForPricingShort: "Contact seller for pricing",
        pricingLabelHeader: "Label",
        pricingDistanceHeader: "Distance",
        pricingPriceHeader: "Price",
        pickup: "Pickup",
        obo: "OBO",
        hidePricingTiers: "Hide pricing tiers",
        viewAllPricingTiers: "View all pricing tiers",
      },
      // To enable Chinese, uncomment and translate all 67 keys, add "zh" to availableLocales:
      // zh: { home: "首頁", about: "關於", browseAll: "瀏覽全部", ... },
    },
  },
};
```

---

## 14. Build Pipeline

Three flows the seller interacts with, plus the platform build.

```
── INITIAL SETUP (run once, first time only) ────────────────────────────────
Open your AI coding tool (Claude Code, Cursor, etc.) in the project directory
  /setup   (or describe the task in natural language)
  AI asks questions → generates content/config.ts + category scaffolding
  Requires: any AI coding tool (Claude Code subscription, Cursor, etc.)

── ADDING NEW ITEMS (run whenever new photos are dropped in) ────────────────
Drop photos into content/items/<category>/<item-name>/
Add an optional description file (notes.txt, info.yaml, etc.)
Open your AI coding tool in the project directory
  /update-items   (or "generate item.json for my new items")
  AI reads photos + description → generates item.json per folder
  Seller confirms before saving
  Requires: any AI coding tool with vision capability
```

Two distinct flows: **seller-side upload** (local machine) and **platform build** (GitHub Actions CI or Vercel).

```
── SELLER'S MACHINE ─────────────────────────────────────────────────────────
pnpm upload-images          (run after adding/changing photos)
  │
  ├── Scans content/items/**/*.{jpg,jpeg,png,webp,gif}  (present locally, gitignored)
  ├── Copies content/contact/** → public/contact/
  ├── Loads .image-cache/checksums.json
  ├── Uploads new/changed files to configured provider (R2 / Blob)
  ├── Writes lib/generated/image-manifest.json  ← commit this
  ├── Writes .image-cache/checksums.json        ← do not commit
  └── ⚠️  Prints BACKUP REMINDER

Then:
  git add content/**/*.json lib/generated/image-manifest.json
  git push    ← GitHub Actions triggers build + deploy automatically

── CI BUILD (GitHub Actions / Vercel) ───────────────────────────────────────
pnpm build
  │
  ├── [prebuild]
  │     ├── scripts/sync-images.ts  (build-check mode)
  │     │     ├── No image files in content/items/ (gitignored — not on CI runner)
  │     │     ├── content/contact/** present (git-tracked) → copies to public/contact/
  │     │     ├── Reads existing lib/generated/image-manifest.json  (committed)
  │     │     └── Logs: "manifest present (N entries) — skipping upload"
  │     │     ⚠️  No CDN credentials needed — build-check never uploads
  │     │
  │     └── scripts/build-search-index.ts
  │           ├── Calls buildSearchIndex() from lib/search/index.ts
  │           └── Writes public/search-index.json  (gitignored; fetched by SearchBar at runtime)
  │
  ├── next build
  │     loader.ts reads manifest → all image URLs resolve to CDN
  │     generateStaticParams runs for all non-draft, non-expired items
  │     All pages rendered to static HTML + JSON
  │     deploymentMode === "static" (default) → output: 'export' → out/
  │
  └── [postbuild]  scripts/postbuild.ts
        if siteConfig.sitemap.enabled → next-sitemap → sitemap.xml + robots.txt
        if siteConfig.sitemap.enabled === false → skip (prints message, exits 0)

  GitHub Actions: uploads out/ → GitHub Pages   (see .github/workflows/deploy.yml)
  Vercel:         auto-serves the output (deploymentMode: "vercel" omits output:'export')

── LOCAL BUILD (imageStorage.provider === "local", seller's machine) ─────────
pnpm build
  │
  ├── [prebuild]
  │     ├── scripts/sync-images.ts  (build-check mode — local provider branch)
  │     │     Photos present locally → copied to public/items/ (same as dev-sync)
  │     │     content/contact/ → copied to public/contact/
  │     │     Images are included in the built output (out/) — suitable for self-hosted servers
  │     │     ⚠️  Do NOT use this mode on GitHub Actions or Vercel (photos are gitignored on CI)
  │     │
  │     └── scripts/build-search-index.ts → public/search-index.json
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

| Status | Home — recently listed | Home — category card | `/[category]` page | `/all` page | `/sold` archive | Detail page | Notes |
|---|---|---|---|---|---|---|---|
| `available` | Yes | Card visible | Yes | Yes | No | Yes | |
| `reserved` | **No** | Card visible | Yes + badge | Yes + badge | No | Yes | Buyer info stays private |
| `pending` | **No** | Card visible | Yes + badge | Yes + badge | No | Yes | |
| `sold` | No | Card visible (if not past retention) | Yes + overlay (hidden by toggle) | Yes (hidden by toggle) | **Always** | Yes (if not past retention) | Detail page excluded after `soldItemRetentionDays` |
| `draft` | No | No | No | No | No | No | Never generates a route |

**Notes on "Home — recently listed":** The recently listed strip uses `loadAllItems()`, which returns `available` status only and is limited to `siteConfig.recentlyListedCount` items. `reserved` and `pending` items do NOT appear in the strip.

**Notes on "Home — category card":** A category card is visible if the category has ≥ 1 item with status `available`, `reserved`, `pending`, or (`sold` AND within `soldItemRetentionDays`). Items that are `draft` or (`sold` AND past retention) never count toward card visibility. The displayed item count on the card shows `available` items only. Cover image uses the first `available` item's cover.

**Notes on `/[category]` and `/all` pages:** Both pages load all non-draft, non-expired-sold items via `loadItemsByCategory()` (or aggregated calls for `/all`). Sold items are hidden by the status toggle by default but visible when toggled on.

**Notes on `/sold` archive:** Uses `loadSoldItems()`. Shows ALL `sold` items regardless of `soldItemRetentionDays`. No retention filter applies here.

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
│   ├── items/                     ← ✗ gitignored; copied from content/items/ by pnpm dev
│   └── search-index.json          ← ✗ gitignored; written by the prebuild step (scripts/build-search-index.ts); fetched by SearchBar at runtime
│
├── .image-cache/                  ← ✗ gitignored; incremental upload speed cache
│   └── checksums.json
│
│   ── APP CODE (sellers never need to edit below this line) ──────────────────
│
├── app/
│   ├── layout.tsx                 ← BackgroundEffect, Analytics, SpeedInsights wrappers
│   ├── globals.css                ← @import "tailwindcss"; @plugin "@tailwindcss/typography" (Tailwind v4)
│   ├── page.tsx                   ← home
│   ├── all/
│   │   └── page.tsx               ← Browse All cross-category page
│   ├── sold/
│   │   └── page.tsx               ← Sold Items Archive
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
│   │   ├── haversine.ts           ← pure haversineInMiles()
│   │   ├── pricing.ts             ← pure resolveItemPrice(); importable by server components
│   │   ├── date.ts                ← formatRelativeDate(isoString): "Listed 3 days ago"
│   │   ├── jsonld.ts              ← buildProductJsonLd(item), buildBreadcrumbJsonLd(crumbs)
│   │   └── i18n.ts                ← getLocalizedField(item, "name", locale): name_zh ?? name
│   ├── search/
│   │   └── index.ts               ← buildSearchIndex(): returns Fuse-compatible item index
│   ├── generated/
│   │   └── image-manifest.json    ← ✓ git-tracked; written by pnpm upload-images
│   ├── config/
│   │   └── types.ts               ← SiteConfig TypeScript type (not edited by sellers)
│   └── ui/
│       └── types.ts               ← UIConfig TypeScript types (BackgroundOption, ItemGridOption, etc.)
│
├── .claude/                       ← Claude Code project configuration
│   ├── CLAUDE.md                  ← loaded automatically by Claude Code; project context + content/ rule
│   └── skills/                    ← AI skill files (see §20); work with Claude Code + other AI tools
│       ├── update-items.md        ← Skill: generate item.json from photos + description file
│       ├── setup-wizard.md        ← Skill: interactive site config setup wizard
│       └── translate-items.md     ← Skill: batch-translate item fields into additional locales
│
├── scripts/
│   ├── sync-images.ts             ← image upload pipeline (3 modes)
│   ├── build-search-index.ts      ← prebuild step: calls buildSearchIndex(), writes public/search-index.json
│   ├── postbuild.ts               ← postbuild step: runs next-sitemap only when siteConfig.sitemap.enabled
│   ├── setup-ui.sh                ← one-time developer setup: installs all Aceternity components
│   ├── create-item.ts             ← pnpm create-item <category>/<name>
│   ├── mark-sold.ts               ← pnpm mark-sold <category>/<name>
│   └── create-template.ts         ← pnpm create-template [category]
│
├── .github/
│   └── workflows/
│       └── deploy.yml             ← (Phase 14) GitHub Actions: pnpm build → deploy out/ to GitHub Pages
│                                     No CDN credentials needed in CI — build-check reads committed manifest
├── next-sitemap.config.js         ← sitemap config (reads siteConfig.baseUrl)
├── SETUP_GUIDE.md                 ← non-technical user guide (content/ folder operations only)
├── postcss.config.mjs             ← Tailwind v4 PostCSS plugin (required); see TECH_REQUIREMENTS.md §22.2
├── tailwind.config.ts             ← optional in v4 — only if extending the theme; omit otherwise
├── next.config.ts                 ← imports content/config.ts for deploymentMode
├── tsconfig.json
├── package.json
├── README.md
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
| Item detail page pricing table | Resolved tier row only | Only if `price.show_tiers` is `true` — "View all pricing tiers ▼" collapsed toggle |

`price.show_tiers` defaults to `false`: buyers see only the resolved tier row, with no indication that other tiers exist. Sellers may not want buyers comparing tiers (e.g. seeing that local pickup is much cheaper than shipping, which can invite haggling). Sellers opt in per item by setting `price.show_tiers: true`.

When the toggle is enabled and present, it shows regardless of geo state (granted, denied, or manual). When expanded, all tiers are listed with the resolved tier visually highlighted (bold or accent colour). Collapsing returns to single-row view.

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

## 18. UI Component Configuration

### Overview

The site has **four visual slots** whose Aceternity UI component can be swapped with one line in `content/config.ts`. All slots fall back gracefully to a plain implementation if the component has not been installed.

| Slot | Config key | Applied to | Default |
|---|---|---|---|
| Background | `ui.background` | Entire site — wraps `app/layout.tsx` | `"none"` |
| Item Grid | `ui.itemGrid` | Category page item listing layout | `"simple"` |
| Gallery | `ui.gallery` | Item detail page photo gallery / carousel | `"simple"` |
| Item Card | `ui.itemCard` | Every item card (category grid + home Recently Listed) | `"simple"` |

---

### Slot 1 — Background (`ui.background`)

Wraps the `<body>` in `app/layout.tsx`. The chosen component is rendered behind all page content.

| Config value | Aceternity Component | Install command |
|---|---|---|
| `"none"` *(default)* | No background effect | — |
| `"aurora"` | Aurora Background | `npx shadcn@latest add @aceternity/aurora-background` |
| `"background-beams"` | Background Beams | `npx shadcn@latest add @aceternity/background-beams-demo` |
| `"background-beams-collision"` | Background Beams With Collision | `npx shadcn@latest add @aceternity/background-beams-with-collision` |
| `"background-gradient-animation"` | Background Gradient Animation | `npx shadcn@latest add @aceternity/background-gradient-animation` |
| `"background-boxes"` | Background Boxes | `npx shadcn@latest add @aceternity/background-boxes-demo` |
| `"wavy"` | Wavy Background | `npx shadcn@latest add @aceternity/wavy-background` |
| `"vortex"` | Vortex | `npx shadcn@latest add @aceternity/vortex` |
| `"shooting-stars"` | Shooting Stars & Stars Background | `npx shadcn@latest add @aceternity/shooting-stars-and-stars-background-demo` |
| `"meteors"` | Meteors | `npx shadcn@latest add @aceternity/meteors` |
| `"grid-and-dot"` | Grid and Dot Backgrounds | `npx shadcn@latest add @aceternity/grid-background-demo` |
| `"background-lines"` | Background Lines | `npx shadcn@latest add @aceternity/background-lines` |
| `"spotlight"` | Spotlight | `npx shadcn@latest add @aceternity/spotlight` |
| `"spotlight-new"` | Spotlight New | `npx shadcn@latest add @aceternity/spotlight-new` |

---

### Slot 2 — Item Grid (`ui.itemGrid`)

Controls the layout component used to display the item grid on category pages. Replaces the default CSS grid.

| Config value | Aceternity Component | Character | Install command |
|---|---|---|---|
| `"simple"` *(default)* | Plain CSS grid (Tailwind) | Responsive 2–4 column grid | — |
| `"bento-grid"` | Bento Grid | Masonry-style, variable-size cards | `npx shadcn@latest add @aceternity/bento-grid` |
| `"layout-grid"` | Layout Grid | Image-focused grid with hover reveals | `npx shadcn@latest add @aceternity/layout-grid` |
| `"focus-cards"` | Focus Cards | Hover dims other cards, focuses selected | `npx shadcn@latest add @aceternity/focus-cards` |

---

### Slot 3 — Gallery (`ui.gallery`)

Controls the photo gallery / carousel on the item detail page. Replaces the default thumbnail strip.

| Config value | Aceternity Component | Character | Install command |
|---|---|---|---|
| `"simple"` *(default)* | Static image strip with click-to-zoom | Minimal, fast | — |
| `"apple-cards-carousel"` | Apple Cards Carousel | Horizontal scroll with 3-D depth | `npx shadcn@latest add @aceternity/apple-cards-carousel-demo` |
| `"images-slider"` | Images Slider | Full-width crossfade slider | `npx shadcn@latest add @aceternity/images-slider` |
| `"carousel"` | Carousel | Classic paginated carousel | `npx shadcn@latest add @aceternity/carousel` |
| `"parallax-scroll"` | Parallax Scroll | Two-column staggered parallax grid | `npx shadcn@latest add @aceternity/parallax-scroll parallax-scroll-2` |

---

### Slot 4 — Item Card (`ui.itemCard`)

Controls the hover / visual effect applied to every item card. The card content (image, name, price, badges) is always rendered by `ItemCard.tsx`; the adapter wraps it.

| Config value | Aceternity Component | Character | Install command |
|---|---|---|---|
| `"simple"` *(default)* | Plain bordered card (Tailwind) | Clean, fast | — |
| `"card-hover-effect"` | Card Hover Effect | Animated border glow on hover | `npx shadcn@latest add @aceternity/card-hover-effect` |
| `"card-spotlight"` | Card Spotlight | Radial spotlight follows cursor | `npx shadcn@latest add @aceternity/card-spotlight` |
| `"3d-card"` | 3D Card Effect | Perspective tilt on mouse move | `npx shadcn@latest add @aceternity/3d-card` |
| `"evervault-card"` | Evervault Card | Encrypted-text noise on hover | `npx shadcn@latest add @aceternity/evervault-card` |
| `"wobble-card"` | Wobble Card | Elastic wobble on hover | `npx shadcn@latest add @aceternity/wobble-card` |
| `"direction-aware-hover"` | Direction Aware Hover | Slide-in overlay from mouse entry direction | `npx shadcn@latest add @aceternity/direction-aware-hover` |
| `"glare-card"` | Glare Card | Glare reflection follows cursor | `npx shadcn@latest add @aceternity/glare-card` |

---

### Core Principle: Seller Only Touches `content/`

> **The seller never edits any file outside `content/`.** Changing a UI component is a single config-value change in `content/config.ts`. No code editing, no CLI commands, no uncomment steps.

To make this work, all 27 supported Aceternity components are **pre-installed once by the developer** during initial project setup and **committed to the repository**. The adapter files ship pre-configured with all imports active and all options wired. After that initial setup, no further developer intervention is needed for UI changes.

---

### One-Time Developer Setup

Run once after cloning the repository (before first deployment):

```bash
pnpm setup-ui
```

This script installs all 27 supported Aceternity components into `components/ui/` in a single command (see TECH_REQUIREMENTS.md §21 for the full script). **Commit the resulting `components/ui/` files to git.** From that point on, the seller can use any config value from the tables above with no further setup.

```
After pnpm setup-ui + git commit:
  components/ui/aurora-background.tsx     ← committed
  components/ui/background-beams.tsx      ← committed
  components/ui/bento-grid.tsx            ← committed
  components/ui/apple-cards-carousel.tsx  ← committed
  ... (all 27 components)

Seller wants Aurora background:
  content/config.ts  →  ui: { background: "aurora" }  ← ONLY change needed
  pnpm dev  ✓  (or push → Vercel builds)
```

---

### Adapter Architecture

Each adapter file ships fully wired — all supported components pre-imported, all cases handled. **Adapter files are app code; sellers must never edit them.** They live in `components/ui-adapters/` (not in `content/`).

```tsx
// components/ui-adapters/BackgroundEffect.tsx
// ⚠️  DO NOT EDIT — seller configuration goes in content/config.ts only
"use client";

import { siteConfig } from "@/content/config";

// All supported components are pre-installed (pnpm setup-ui) and pre-imported.
import { AuroraBackground }              from "@/components/ui/aurora-background";
import { BackgroundBeams }               from "@/components/ui/background-beams";
import { BackgroundBeamsWithCollision }  from "@/components/ui/background-beams-with-collision";
import { BackgroundGradientAnimation }   from "@/components/ui/background-gradient-animation";
import { BackgroundBoxes }               from "@/components/ui/background-boxes";
import { WavyBackground }                from "@/components/ui/wavy-background";
import { Vortex }                        from "@/components/ui/vortex";
import { ShootingStars }                 from "@/components/ui/shooting-stars-and-stars-background";
// ... all supported imports

const COMPONENTS = {
  "aurora":                        AuroraBackground,
  "background-beams":              BackgroundBeams,
  "background-beams-collision":    BackgroundBeamsWithCollision,
  "background-gradient-animation": BackgroundGradientAnimation,
  "background-boxes":              BackgroundBoxes,
  "wavy":                          WavyBackground,
  "vortex":                        Vortex,
  "shooting-stars":                ShootingStars,
  // ... all options
} as const satisfies Partial<Record<string, React.ComponentType<{ children: React.ReactNode }>>>;

export function BackgroundEffect({ children }: { children: React.ReactNode }) {
  const { background } = siteConfig.ui;
  if (background === "none") return <>{children}</>;
  const Component = COMPONENTS[background as keyof typeof COMPONENTS];
  if (!Component) return <>{children}</>;   // "none" or unknown value → no wrapper
  return <Component>{children}</Component>;
}
```

The same pattern applies to `ItemGridAdapter`, `GalleryAdapter`, and `ItemCardAdapter`. Each adapter:
- Imports every supported Aceternity component for its slot
- Maps every config value to the corresponding component
- Falls back to the simple/none implementation for `"simple"`/`"none"` or any unknown value
- Never crashes

---

### Graceful Degradation

| Scenario | Behavior |
|---|---|
| `ui.background: "none"` | Children rendered with no wrapper — no background effect |
| `ui.*: "simple"` | Built-in Tailwind implementation — no Aceternity component used |
| Valid config value (e.g. `"aurora"`) | Corresponding pre-installed Aceternity component renders |
| Unknown/future value not yet in COMPONENTS map | Silent fallback to `"none"` / `"simple"` |

The site **never crashes at runtime** due to a UI configuration value.

---

## 19. Extensibility Register

The following were previously listed as future features. Those now in v1 have been removed. Only genuinely future items remain.

| Future feature | Designated extension point |
|---|---|
| Contact form / enquiry | Serverless function; `ContactSection` has a reserved slot |
| Manual dark mode toggle | Change `darkMode: "media"` → `"class"` in config; add toggle button to `SiteHeader` |
| Tag filter page | `/tags/{tag}` route + tag index in loader; tags are already stored and indexed by search |
| Draft preview | Next.js middleware on `/preview/[category]/[item]`; reads `status: "draft"` items |
| Distance unit toggle (mi ↔ km) | Add `distanceUnit: "mi" \| "km"` to `siteConfig.i18n`; `useDistancePricing` converts |
| Cached location across navigations | `sessionStorage` opt-in behind `siteConfig.cacheLocationInSession: true`; consent-gated |
| Local image optimisation | Add `sharp` devDependency; add `preprocess` step to `scripts/sync-images.ts --mode upload` |
| `pnpm clean-storage` | Script to reconcile orphaned CDN blobs vs manifest; requires provider list+delete API |
| Add new UI component option | Install via `npx shadcn@latest add ...`; add import + entry to adapter; add value to `lib/ui/types.ts`; update `scripts/setup-ui.sh` |
| Add new UI slot | Add key to `UIConfig`; create new adapter in `components/ui-adapters/`; document in §18 |
| Add new locale | Add locale to `siteConfig.i18n.availableLocales`; extend Zod schema + `Item` type with `name_{locale}` / `description_{locale}`; run `/translate-items` AI skill to batch-fill translations; `LocaleSwitcher` appears automatically when `availableLocales.length > 1` |
| RSS feed | Generate `feed.xml` in postbuild by aggregating `loadItemsByCategory()` across all categories (do NOT use `loadAllItems()` — that function returns `available`-only items capped at `recentlyListedCount`); link in `<head>` |
| Seller dashboard (local GUI) | Local-only Next.js dev-mode route or Electron app that reads/writes `content/`; key unlock for non-technical users |
| Multi-seller support | Requires full architecture redesign; each seller gets a namespaced `content/` folder |

---

## 20. AI-Powered Content Generation — Skill-Based Approach

Three AI-assisted workflows are provided as **Claude Code skills** (see `.claude/skills/`). The seller uses whatever AI coding tool they already have — Claude Code, Cursor, GitHub Copilot, or any capable assistant. **No additional API keys, environment variables, or package installation is required.** The seller just opens their AI tool in the project directory and invokes the skill.

### Design Principle

> The skills are **instruction files, not code**. They tell the AI assistant what the project structure looks like, what files to read, and exactly what to generate. The AI does the work using its own built-in capabilities and the user's existing subscription.

This approach:
- Requires zero extra setup for the seller
- Works with any AI coding assistant that can read files and write JSON
- Degrades gracefully: if the seller has no AI tool, they use `pnpm create-item` instead
- Adds no dependencies to `package.json`
- Introduces no API key management

### Skill Files

Three skill files ship with the project:

```
.claude/
└── skills/
    ├── update-items.md    ← Skill: generate item.json from photos + description
    ├── setup-wizard.md    ← Skill: interactive site config setup
    └── translate-items.md ← Skill: batch-translate item fields into additional locales
```

These follow the standard Claude Code skill format and are invokable via `/update-items`, `/setup`, and `/translate-items` in Claude Code. Other AI tools can read them directly as prompt instructions.

---

### Skill 1 — Item JSON Generator

**Invocation:** `/update-items` in Claude Code, or paste the skill file content into any AI assistant.

**What the seller does:**

The seller drops photos into an item folder (and optionally a description file), then runs this skill. The AI uses its vision capability to analyse the photos, reads any description file, and generates a complete `item.json` — then asks the seller to confirm before saving.

```
1. Create content/items/<category>/<item-name>/
2. Drop in photos (cover.jpg, photo1.jpg, ...)
3. Optionally add a description file (any text format — see below)
4. Open Claude Code (or similar AI tool) in the project
5. Type: /update-items    (or describe the task in natural language)
6. Review the proposed item.json shown by the AI
7. Confirm → AI writes item.json to the folder
8. pnpm upload-images    ← upload photos to CDN as usual
```

#### Trigger Conditions

The skill processes a folder when ANY of the following are true:
- Images are present but no `item.json` exists
- `item.json` exists with `status: "draft"`
- A description file is newer than the existing `item.json` (re-generate with updated info)
- The seller explicitly targets a specific folder by telling the AI: "just update the electronics/iphone-14 folder"

#### Description File

Place any text-based file in the item folder alongside the photos. The skill detects and reads any of:

| Format | Example filename | Content style |
|---|---|---|
| Plain text | `notes.txt`, `description.txt` | Freeform notes — "Bought from Amazon 2024, barely used, charger included" |
| Markdown | `README.md`, `notes.md` | Structured or freeform Markdown |
| YAML | `info.yaml`, `info.yml` | Key-value pairs matching item.json field names |
| Partial JSON | `info.json` | A partial `item.json` — the AI merges with vision output |

If no description file is found, the skill works from photos alone.

**Example `notes.txt`:**
```
Bought from Best Buy in Spring 2023 for $89.
Used for one semester. Textbook is CS101 at State University.
Minor pen marks on a few pages.
Willing to take $30.
```

**Example `info.yaml`:**
```yaml
original_source: Best Buy
original_price: 89
course: CS101
edition: 3rd Edition
condition: fair
min_acceptable_offer: 25
```

#### What the Vision Model Extracts

| Field | Source | Confidence |
|---|---|---|
| `name` | Folder name (humanised) + photo text recognition | High |
| `description` | Vision analysis + description file | Medium–High |
| `condition` | Visual inspection of photos | Medium |
| `brand` | Logo/label recognition in photos | Medium |
| `model` | Model number visible in photos | Medium |
| `color` | Visual | High |
| `dimensions` | Estimated from scale references in photos | Low (flagged as estimate) |
| `tags` | Item type inference | Medium |
| `course` / `isbn` | Text recognition on textbooks | High when visible |

Fields the AI **cannot** determine from photos (left as defaults or asked interactively):
- `price.tiers` — the AI suggests based on category norms but asks the seller to confirm
- `pickup_windows` — always asks
- `preferred_payment` — pulled from `siteConfig` defaults
- `listed_date` — set to today

#### Interactive Confirmation Flow

```
AI: 📦 Analysing 3 photos in content/items/electronics/iphone-14...

  Proposed item.json:
  ┌─────────────────────────────────────────────────────────┐
  │ name:        iPhone 14 Pro (Space Black, 256 GB)        │
  │ condition:   good                                       │
  │ brand:       Apple                                      │
  │ model:       iPhone 14 Pro                              │
  │ color:       Space Black                                │
  │ description: Used iPhone 14 Pro in good condition.      │
  │              Minor scratches on the back. Screen is     │
  │              pristine. Includes original charger.       │
  │ tags:        [electronics, phone, apple, iphone]        │
  │ price.tiers: [Pickup $420, Shipping $450] (suggested)   │
  │ status:      draft                                      │
  └─────────────────────────────────────────────────────────┘

  [C] Confirm and save    [E] Edit in $EDITOR    [S] Skip    [Q] Quit
```

The AI saves with `status: "draft"` unless the seller explicitly asks for `"available"`. This prevents accidental publishing.

The AI can process one folder, one category, or all qualifying folders in a single session — the seller describes the scope in natural language ("update all my electronics items" / "just do the iphone folder").

---

### Skill 2 — Site Setup Wizard

**Invocation:** `/setup` in Claude Code, or describe the task: "Help me set up my UsedExchange config file."

**What the seller does:**
```
1. Open Claude Code (or similar) in the project directory
2. Type: /setup   (or "help me set up content/config.ts")
3. Answer the AI's questions in the chat
4. AI writes content/config.ts and the initial category scaffold
```

The AI asks about 8 areas and generates the complete config:

| Area | Questions | Output |
|---|---|---|
| Identity | Store name, tagline style | `name`, `tagline` |
| Location | Freeform place description → AI looks up lat/lng | `location.*` |
| Item types | What will you sell? | Category `_category.json` files |
| Contact | Which platforms + usernames | `contact.platforms[]` |
| Pricing | Firm vs negotiable; currency | `currency`, seller notes |
| Distance tiers | Campus-local / city-wide / pickup-only | Reference for item.json tiers |
| Visual style | Background + card effect | `ui.background`, `ui.itemCard` |
| Language | Locale selection; sets `defaultLocale` + `availableLocales` | `i18n.defaultLocale`, `i18n.availableLocales` |

The AI reads the seller's writing style and suggests a matching tagline (examples: "Good stuff finding new homes 📦" for casual tone; "Pre-owned. Priced fairly." for minimalist tone). The seller can accept or override.

**Re-running:** The seller can ask "update just my contact info in the config" or "change my background effect" — the AI reads the existing `content/config.ts`, makes the targeted change, and leaves everything else intact.

---

### Skill 3 — Item Translator

**Invocation:** `/translate-items` in Claude Code, or describe the task: "Translate my item listings into Chinese."

**What the seller does:**
```
1. Add the target locale to siteConfig.i18n.availableLocales  (e.g. ["en", "zh"])
2. Open Claude Code (or similar) in the project directory
3. Type: /translate-items   (or "translate my items into zh")
4. AI scans content/items/ for missing translations
5. Review the proposed translations shown per item
6. Confirm → AI writes name_zh / description_zh into each item.json
```

**Trigger Conditions**

The skill processes an item when ANY of the following are true:
- `name_{locale}` field is absent or empty string in `item.json`
- `description_{locale}` field is absent or empty string
- Seller explicitly targets a folder: "just translate the electronics/iphone-14 item"
- Seller provides a scope: "translate all items missing Chinese" / "only houseware category"

**What the AI Translates**

| Field | Translated? | Notes |
|---|---|---|
| `name` → `name_{locale}` | **Yes** | Product name; preserves model numbers, brand names, measurements verbatim |
| `description` → `description_{locale}` | **Yes** | Full Markdown preserved; inline code spans, URLs, and model strings not translated |
| `brand`, `model`, `color` | No | Technical strings — locale-invariant |
| `tags` | No | Used for fuse.js search; kept in English for consistency |
| `course`, `isbn`, `edition` | No | Academic identifiers — locale-invariant |
| Price fields, dates, status | No | Never content for translation |

**Manual Override**

Sellers may also type translations directly into `item.json` without using the skill:
```jsonc
{
  "name": "IKEA Desk Lamp",
  "name_zh": "宜家台灯",
  "description": "Works perfectly. Minor scratch on base.",
  "description_zh": "功能完好，底座有轻微划痕。"
}
```
The AI skill and manual editing are fully compatible — the skill skips fields that already have non-empty translations.

**Interactive Confirmation Flow**

```
AI: 🌐 Translating 3 items into zh...

  content/items/houseware/ikea-desk-lamp/item.json
  ┌──────────────────────────────────────────────────┐
  │ name_zh:        "宜家 TRÅDFRI 台灯"               │
  │ description_zh: "工作正常，两年前购入。底座轻微划痕。" │
  └──────────────────────────────────────────────────┘
  [C] Confirm  [E] Edit  [S] Skip  [Q] Quit all

  content/items/electronics/iphone-14-pro/item.json
  ┌──────────────────────────────────────────────────┐
  │ name_zh:        "iPhone 14 Pro 深空黑 256GB"      │
  │ description_zh: "成色良好，屏幕无划痕，含原装充电器。" │
  └──────────────────────────────────────────────────┘
  [C] Confirm  [E] Edit  [S] Skip  [Q] Quit all
```

The AI confirms each item individually or accepts a batch confirm ("translate all remaining items without asking").

**Locale Scope**

The seller specifies the target locale in the invocation. The skill infers it from `siteConfig.i18n.availableLocales` when unambiguous (e.g. if `availableLocales: ["en", "zh"]` the skill targets `zh`). With three or more locales, the AI asks which locale to target.

**`content/` Rule — Maintained**

The translate skill writes ONLY to `content/items/*/item.json`. It reads `content/config.ts` for locale configuration but does not modify it. No app code is touched.

---

### Skill File Format

Each skill file is a Markdown document stored in `.claude/skills/`. It contains:
1. **Trigger description** — what the skill does (shown in Claude Code's skill list)
2. **Context** — a summary of the project structure relevant to the task
3. **Step-by-step instructions** — exactly what the AI should do
4. **Schema reference** — the full `item.json` field list and `content/config.ts` structure
5. **Output specification** — what files to write and in what format
6. **Examples** — sample input → output pairs

The skill files are human-readable. A seller who opens them in a text editor will understand what the AI is being asked to do. They can also be used verbatim as a prompt in any AI chat interface (ChatGPT, Claude.ai, etc.) — paste the skill file content and attach the photos.

### File Location

```
.claude/
└── skills/
    ├── update-items.md     ← describes how to generate item.json from photos
    ├── setup-wizard.md     ← describes how to generate content/config.ts
    └── translate-items.md  ← describes how to batch-translate item fields into other locales
```

### Compatibility

| AI Tool | How to use |
|---|---|
| **Claude Code** | `/update-items`, `/setup`, or `/translate-items` — skills are loaded automatically from `.claude/skills/` |
| **Cursor** | Open skill file → Cmd+L → paste into chat alongside photos |
| **GitHub Copilot (chat)** | Open skill file → paste as context → attach photos |
| **Claude.ai** | Paste skill file content + upload photos → ask AI to follow the instructions |
| **Any capable AI** | Paste skill file + describe what you want; the instructions are self-contained |

### `content/` Rule — Maintained

All three skills instruct the AI to write ONLY to `content/config.ts`, `content/items/*/item.json`, and `content/items/*/_category.json` (the translator touches only `item.json` locale fields). No app code is touched. The AI is explicitly instructed not to modify any files outside `content/`.

