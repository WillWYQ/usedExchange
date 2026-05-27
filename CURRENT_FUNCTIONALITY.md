# UsedExchange — Current Functionality (v1)

**Based on:** DESIGN.md v0.7.0 · TECH_REQUIREMENTS.md v0.6.0  
**Date:** 2026-05-27

---

## Who Is This For

### Primary — College Students with a CS Background
Comfortable with git, the terminal, and JSON. Wants a personal, polished storefront to sell items in their campus area. Runs `pnpm upload-images` and `git push` without hesitation.

**Typical items:** Textbooks, GPUs, keyboards, monitors, furniture, bikes  
**Typical contact:** Discord, Instagram, Venmo, Zelle, WeChat  
**Selling rhythm:** End-of-semester sell-offs (May and December)

### Potential — Non-CS Users Willing to Try
Set up once by a CS student friend. After that, they only ever touch files inside `content/`. CLI tools (`pnpm mark-sold`, `pnpm create-item`) remove the need to edit JSON manually.

---

## Content Management

### The `content/` Folder — The Only Folder Sellers Ever Touch
Everything the seller manages lives inside `content/`. App code is never opened for routine operations.

```
content/
├── config.ts           ← all site settings
├── items/
│   ├── <category>/
│   │   ├── _category.json      ← optional display name, icon, sort order
│   │   └── <item>/
│   │       ├── item.json       ← the only required file per item
│   │       ├── cover.jpg       ← pinned thumbnail (optional naming convention)
│   │       └── photo1.jpg      ← additional gallery images
└── contact/
    ├── wechat-qr.png           ← QR code images for contact platforms
    ├── zelle-qr.png
    └── venmo-qr.png
```

### Item Metadata (`item.json`) — All Fields

| Field | Type | Purpose |
|---|---|---|
| `name` | string **(required)** | Display name |
| `description` | Markdown string | Full description (GFM supported) |
| `condition` | enum | `new` / `like-new` / `good` / `fair` / `for-parts` |
| `brand` | string | Brand / manufacturer |
| `model` | string | Model number |
| `age_years` | number | Approximate age |
| `dimensions` | object | L × W × H in cm or in |
| `weight` | object | Value + unit (kg or lb) |
| `color` | string | Primary colour |
| `quantity` | integer | Units available (shows badge when > 1) |
| `original_source` | string | Where originally purchased |
| `original_link` | URL | Link to original product listing |
| `original_price` | number | What seller originally paid |
| `status` | enum | `available` / `pending` / `reserved` / `sold` / `draft` |
| `listed_date` | ISO 8601 | When listed; defaults to build date |
| `sold_date` | ISO 8601 | When sold; used for retention calculation |
| `reserved_for` | string | Buyer name — **never rendered on page** |
| `preferred_payment` | string[] | e.g. `["Venmo", "Zelle", "Cash"]` |
| `contact_note` | string | Item-specific contact note |
| `tags` | string[] | Searchable tags; chips shown on detail page |
| `category_override` | string | Display-only category label override |
| `meta_description` | string | SEO; auto-generated from description if empty |
| `no_lowball` | boolean | Shows "Firm Price" badge |
| `price_reduced` | boolean | Shows "Price Reduced" chip |
| `previous_lowest_price` | number | Struck-through original price when `price_reduced` |
| `min_acceptable_offer` | number | Enables "Make an Offer" button when set + `negotiable: true` |
| `stripe_payment_link` | URL | Shows "Pay Deposit" button |
| `venmo_payment_request` | URL | Pre-filled Venmo payment request URL |
| `pickup_windows` | string[] | e.g. `["Weekday evenings", "Saturday 10am–2pm"]` |
| `youtube_link` | URL | Demo video; shows "Watch Demo" button |
| `bundle_with` | string[] | Item slugs available as a bundle |
| `isbn` | string | ISBN for textbooks; enables "Compare prices" link |
| `course` | string | e.g. "CS101" — shown as badge, searchable |
| `edition` | string | e.g. "3rd Edition" |
| `semester_listed` | string | e.g. "Spring 2026" |
| `name_zh` | string | Chinese name (used when `siteConfig.i18n.locale = "zh"`) |
| `description_zh` | string | Chinese description (same condition) |
| `price` | object | Distance-tiered pricing (see Pricing section) |

All fields except `name` are optional; safe defaults are applied when absent.

---

## Pricing System

### Distance-Tiered Pricing
Multiple price tiers per item, each with an optional distance range. The visitor's distance determines which tier is shown.

```jsonc
"price": {
  "currency": "USD",
  "tiers": [
    { "label": "Pickup", "miles_max": 5,  "amount": 15 },
    { "label": "Nearby", "miles_min": 5,  "miles_max": 15, "amount": 20 },
    { "label": "Shipping", "miles_min": 30, "amount": 35 }
  ],
  "negotiable": true   // adds "OBO" to the price
}
```

### Automatic Visitor Location Detection
1. Browser requests Geolocation permission on page load
2. **Granted** → haversine distance calculated client-side → matching tier shown
3. **Denied** → highest price tier shown as fallback
4. Visitor can always enter a custom distance to override

Visitor coordinates never leave the browser. Seller coordinates are in the static bundle (intentionally public — use a landmark if privacy-sensitive).

### Price Display
- **Item cards:** resolved tier price only; no expand
- **Item detail:** resolved tier by default → "View all tiers" toggle expands full list
- **Static HTML:** always shows highest tier (never blank before JS loads)
- **Pending state:** shows fallback (highest) price — no card-level spinners

---

## Photo Gallery & Image Storage

Photos are **not committed to git** (avoids Vercel's 100 MB deployment limit). Uploaded to cloud CDN via `pnpm upload-images`.

### Three Storage Providers
| `imageStorage.provider` | When to use | Setup required |
|---|---|---|
| `"local"` | Local dev / self-hosted | None |
| `"vercel-blob"` *(default)* | Vercel Hobby | One env var (`BLOB_READ_WRITE_TOKEN`) |
| `"cloudflare-r2"` | Large collections / zero egress cost | Four env vars |

### Photo Quality Warnings
During `pnpm upload-images`, advisory warnings are printed (never block) for:
- Images < 800px wide (may appear blurry)
- Images > 8 MB (unnecessarily large)
- Item folders with no `cover.*` named image
- Item folders with no images at all

---

## Pages

### Global — All Pages
- **SiteHeader** — site name/logo + full-text search bar (when `siteConfig.search.enabled`)
- **SiteFooter** — contact platform buttons, last-build timestamp

### Home Page (`/`)
- **Hero** — site name, tagline, CTA button
- **Category grid** — cards for visible categories; count of available items each
- **Recently Listed** — last N `available` items with location-resolved prices; prices update silently as geo resolves; section hidden if empty
- **Recently Viewed** — horizontal strip of last 5 viewed items (sessionStorage); hidden if empty

### Category Page (`/[category]`)
- Location price bar — detected distance + "Change distance" override
- **Filter bar** — condition chips + price range slider + status toggle
- **Sort select** — Price low/high · Date listed · Condition
- **"Browse All" link** — navigates to `/all`
- Item grid with location-resolved prices

### Item Detail Page (`/[category]/[item]`)
- **Breadcrumb** — Home → Category → Item name
- **Photo gallery** (configurable via `ui.gallery` slot)
- **Freshness label** — "Listed 3 days ago"
- **Status + condition badges** — condition badge has `?` tooltip explaining each value
- **Quantity badge** — "3 available" when quantity > 1
- **Price signals** — "Price Reduced" chip; "Firm Price" badge; struck-through original price
- **Name + description** (Markdown rendered)
- **Textbook section** (when `isbn`/`course` present) — course badge, Compare prices link, edition, semester
- **YouTube demo** — "Watch Demo" button when `youtube_link` is set
- **Pickup windows** — shown when `pickup_windows` is non-empty
- **Pricing section** — resolved tier + toggle + "Make an Offer" button + "Pay Deposit" Stripe button
- **Metadata table** — brand, model, dimensions, weight, original source/price
- **Contact section** — platform buttons with pre-filled messages, payment methods, contact note
- **Tags** — non-interactive chips (searchable via search)
- **Share button** — native share on mobile; copy-link on desktop
- **JSON-LD** — Product schema + BreadcrumbList for SEO rich snippets
- **If sold** — "SOLD" banner; contact CTA disabled; sold date shown

### Browse All Page (`/all`)
All available items across all categories in one grid with full filter + sort bar.

### Sold Items Archive (`/sold`)
All sold items regardless of retention; sorted by sold date descending. Social proof. No pricing or contact.

### 404 Page
Site header + "Page not found" + link home.

---

## Contact System

### Supported Platforms

**Link-based** (pre-fill message when item context available):
| Platform | URL |
|---|---|
| Discord | `https://discord.com/users/{id}` (DM) or `https://discord.gg/{invite}` (server) |
| Email | `mailto:{address}?subject=...&body=...` (pre-filled) |
| WhatsApp | `https://wa.me/{number}?text=...` (pre-filled) |
| Venmo | `https://venmo.com/u/{username}?txn=pay&note={item}` (pre-filled) |
| Facebook | `https://facebook.com/{username}` |
| Instagram | `https://instagram.com/{handle}` |
| Snapchat | `https://snapchat.com/add/{username}` |
| Twitter/X | `https://x.com/{handle}` |
| TikTok | `https://tiktok.com/{handle}` |
| LinkedIn | `https://linkedin.com/{path}` |
| YouTube | `https://youtube.com/{channel}` |

**QR-code modal** (no public profile URL):
| Platform | Notes |
|---|---|
| Zelle | QR only — no profile link; generate from bank app |
| Venmo | Optional QR alternative to the profile link |
| WeChat | QR only |
| LINE | QR only |

### Reveal Behavior
- `reveal_behavior: "click"` — hidden behind "Show contact" toggle (default)
- `reveal_behavior: "always"` — always visible

---

## AI-Powered Content Generation Agents

Two Claude-powered scripts eliminate manual JSON editing. Both require `ANTHROPIC_API_KEY` in `.env.local` and write only to `content/`.

### Agent 1 — Site Setup Wizard (`pnpm agent:setup`)

Run **once** during initial project setup. A conversational agent asks about:
- Store name and location (lat/lng resolved automatically from a place description)
- Item types being sold (creates category scaffold)
- Contact platforms (Discord, Venmo, Zelle, Instagram, etc.)
- Pricing style (firm vs negotiable; currency)
- Visual preferences (background, card effects)
- Language/locale

Generates a complete `content/config.ts` and the initial `content/items/<category>/_category.json` files. Detects seller personality from their answers and writes a matching tagline. Can be re-run with flags (`--contact`, `--ui`, `--force`) to update specific sections.

### Agent 2 — Item JSON Generator (`pnpm agent:update-items`)

Drop photos into any item folder (and optionally a description file), then run this agent. It:
1. Scans `content/items/` for folders with photos but no `item.json`, or with `status: "draft"`
2. For each qualifying folder: reads photos via Claude vision API + reads any description file
3. Extracts: name, description, condition, brand, model, colour, tags, textbook fields (ISBN, course, edition)
4. Shows a preview in the terminal for the seller to confirm, edit, or skip
5. Saves `item.json` with `status: "draft"` (seller changes to `"available"` when ready)

**Supported description file formats:** `.txt`, `.md`, `.yaml`, `.json` — any text file in the item folder alongside the photos.

**Description file example (`notes.txt`):**
```
Bought from Best Buy 2023, used one semester.
CS101 textbook, 3rd edition. Minor pen marks.
Asking $30.
```

**Cost:** ~$0.01–0.05 per item (Claude Sonnet). Configurable model in the script.

**Trigger:** runs on items where folder has images + (no item.json OR item.json is draft OR description file is newer than item.json).

**After the agent:** run `pnpm upload-images` to upload photos to CDN as usual.

---

## Full-Text Search

Built at compile time using `fuse.js`. Searches across: name, description, brand, model, tags, course, ISBN, edition. Enabled via `siteConfig.search.enabled: true`. Search bar lives in `SiteHeader` and shows inline results as the user types.

---

## Seller CLI Tools

Scripts run on the seller's machine. All write only to `content/`.

| Command | What it does |
|---|---|
| `pnpm upload-images` | Upload photos to CDN, update manifest, print backup reminder |
| `pnpm create-item <cat>/<name>` | Create new item folder + `item.json` from template |
| `pnpm new <cat>/<name>` | Shorthand for `create-item` |
| `pnpm create-template [cat]` | Create a `_template.json` for a category (or global) |

---

## Item Status & Visibility

| Status | Home | Category | Detail | Notes |
|---|---|---|---|---|
| `available` | Yes | Yes | Yes | |
| `reserved` | Yes + badge | Yes + badge | Yes | `reserved_for` never rendered |
| `pending` | Yes + badge | Yes + badge | Yes | |
| `sold` | No | Yes + overlay | Yes | Hidden after `soldItemRetentionDays`; always in `/sold` archive |
| `draft` | No | No | No | No route generated |

---

## UI Customisation — 4 Configurable Slots

Set any option in `content/config.ts`. All 25 Aceternity components are pre-installed by the developer once (`pnpm setup-ui`). Sellers just change the config value — no code editing.

| Slot | Config key | Options |
|---|---|---|
| Background | `ui.background` | `"none"` + 13 Aceternity backgrounds |
| Item Grid | `ui.itemGrid` | `"simple"` + bento-grid, layout-grid, focus-cards |
| Gallery | `ui.gallery` | `"simple"` + apple-cards-carousel, images-slider, carousel, parallax-scroll |
| Item Card | `ui.itemCard` | `"simple"` + 8 Aceternity card effects |

---

## Site Configuration (`content/config.ts`)

| Section | Fields |
|---|---|
| Identity | `name`, `tagline`, `logo` |
| Deployment | `deploymentMode`, `baseUrl` |
| Image storage | `imageStorage.provider` |
| Seller location | `location.lat`, `location.lng`, `location.label` |
| Content defaults | `currency`, `recentlyListedCount`, `soldItemRetentionDays` |
| Contact | `contact.reveal_behavior`, `contact.platforms[]` |
| Hero | `hero.cta_label`, `hero.cta_href` |
| SEO | `meta.description`, `meta.twitterHandle` |
| UI slots | `ui.background`, `ui.itemGrid`, `ui.gallery`, `ui.itemCard` |
| Dark mode | `darkMode: "media"` (auto, follows OS) |
| Analytics | `analytics.vercel`, `analytics.speedInsights` |
| Search | `search.enabled`, `search.placeholder` |
| Sitemap | `sitemap.enabled` |
| i18n | `i18n.locale`, `i18n.strings.*` |

---

## Build Pipeline

**Seller uploads photos** (`pnpm upload-images`):
Photos → CDN, manifest updated, backup reminder printed, photo quality warnings shown.

**Vercel build** (`pnpm build`):
Reads manifest → generates all pages → builds search index → postbuild generates sitemap.

**Local dev** (`pnpm dev`):
Photos copied locally → dev server with hot reload.

### Developer Scripts (run once)

| Script | Purpose |
|---|---|
| `pnpm setup-ui` | Install all 25 Aceternity components |

---

## SEO & Metadata

- Per-page `<title>` and `<meta name="description">`
- Open Graph tags on all routes
- **JSON-LD Product schema** on item detail pages (Google rich snippets)
- **JSON-LD BreadcrumbList** on item + category pages
- **Twitter card** (`summary_large_image`) on item detail pages
- **Pinterest rich pin** (`og:type: "product"` + price meta) on item detail pages
- `sitemap.xml` + `robots.txt` generated at build time (when enabled)

---

## Dark Mode

Automatic — follows the visitor's OS/browser dark/light preference via Tailwind's `darkMode: "media"`. No toggle needed; no user action required. All Aceternity components are dark-mode aware.

---

## Analytics

- **Vercel Analytics** — page views, traffic sources, top pages (free, privacy-respecting)
- **Vercel Speed Insights** — Core Web Vitals per page (free)

Both enabled via `siteConfig.analytics.*`. Both are no-ops outside Vercel.

---

## Accessibility

- All images have `alt` text (item name as minimum fallback)
- All interactive elements have `focus-visible:ring` focus styles
- Colour contrast ≥ 4.5:1 body text, ≥ 3:1 large text
- Status and condition badges include text labels (never colour-only)
- `QRModal` traps focus; restores focus on close
- Condition guide tooltip keyboard accessible

---

## Security & Privacy

| Concern | Mitigation |
|---|---|
| `reserved_for` field | Never rendered on any page |
| Visitor geo coordinates | `useState` only; never sent to server |
| Seller coordinates | In static bundle; intentionally public |
| External links | `rel="noopener noreferrer"` on all |
| Contact info | Click-to-reveal by default |
| `X-Powered-By` header | Suppressed |
| Seller CLI tools | All scripts write only to `content/` |

---

## Technology

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router), fully static |
| Language | TypeScript 5 (strict) |
| UI components | Aceternity UI (25 components, pre-installed) |
| Styling | Tailwind CSS v4 + @tailwindcss/typography |
| Schema validation | Zod 3 |
| Markdown | react-markdown + remark-gfm |
| Search | fuse.js (client-side, build-time index) |
| Analytics | @vercel/analytics + @vercel/speed-insights |
| Sitemap | next-sitemap |
| Animations | framer-motion |
| Icons | @tabler/icons-react |
| Package manager | pnpm |
| Primary host | Vercel Hobby |
| Image CDN | Vercel Blob (default) or Cloudflare R2 |
