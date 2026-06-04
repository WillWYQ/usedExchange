# UsedExchange — Current Functionality (v1)

**Based on:** DESIGN.md v0.9.1 · TECH_REQUIREMENTS.md v0.9.1 · IMPLEMENTATION_PLAN.md v1.4  
**Date:** 2026-06-03  
**Status:** Design phase — this document describes the *specified* v1 functionality. No code is implemented yet.

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
| `listed_date` | date-only YYYY-MM-DD | When listed; defaults to build date |
| `sold_date` | date-only YYYY-MM-DD | When sold; used for retention calculation. Full ISO timestamps also accepted. |
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
| `venmo_payment_request` | URL | Venmo payment-request URL → shows "Pay with Venmo" button |
| `pickup_windows` | string[] | e.g. `["Weekday evenings", "Saturday 10am–2pm"]` |
| `youtube_link` | URL | Demo video; shows "Watch Demo" button |
| `isbn` | string | ISBN for textbooks; enables "Compare prices" link |
| `course` | string | e.g. "CS101" — shown as badge, searchable |
| `edition` | string | e.g. "3rd Edition" |
| `semester_listed` | string | e.g. "Spring 2026" |
| `name_zh` | string | Chinese name; shown when the visitor selects `zh` via the LocaleSwitcher (SSG renders `defaultLocale`) |
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
| `"cloudflare-r2"` *(recommended)* | GitHub Pages, any static host — zero egress cost | Five env vars in `.env.local` (local only) |
| `"vercel-blob"` | Vercel deployments | One env var (`BLOB_READ_WRITE_TOKEN`) |
| `"local"` | Local dev / self-hosted | None |

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
- **Pricing section** — resolved tier + toggle + "Make an Offer" button + "Pay Deposit" Stripe button + "Pay with Venmo" button (when `venmo_payment_request` set)
- **Metadata table** — brand, model, dimensions, weight, original source/price
- **Contact section** — platform buttons with pre-filled messages, payment methods, contact note
- **Tags** — non-interactive chips (searchable via search)
- **Share button** — native share on mobile; copy-link on desktop
- **JSON-LD** — Product schema + BreadcrumbList for SEO rich snippets
- **If sold** — "SOLD" banner; contact CTA disabled; sold date shown

### Browse All Page (`/all`)
All non-draft items across all categories in one scrollable grid: `available` items shown by default; `reserved` and `pending` items shown with status badges; `sold` items hidden by default but visible when the status toggle is turned on. Full filter + sort bar, identical to category pages. (Data source: `loadItemsByCategory()` aggregated across all categories — same visibility rules as any category page.)

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

## AI-Powered Content Generation

Three AI-assisted workflows ship as **Claude Code skill files** in `.claude/skills/`. The seller uses any AI coding tool they already have — Claude Code, Cursor, GitHub Copilot, or any capable assistant. **No additional API keys, environment variables, or packages are required.**

### Skill 1 — Item JSON Generator (`/update-items`)

Drop photos into an item folder (and optionally a description file), then invoke this skill in your AI tool.

```
1. Create content/items/<category>/<item-name>/
2. Drop photos into the folder (cover.jpg, photo1.jpg, ...)
3. Optionally add a description file (notes.txt, info.yaml, etc.)
4. Open Claude Code (or similar AI tool) in the project
5. Type: /update-items    (or describe the task in natural language)
6. Review the proposed item.json preview in the chat
7. Confirm → AI writes item.json  (always status: "draft" until seller changes it)
8. pnpm upload-images    ← upload photos to CDN as usual
```

**Supported description file formats:** `.txt`, `.md`, `.yaml`, `.json` — any text file in the item folder alongside the photos.

**Description file example (`notes.txt`):**
```
Bought from Best Buy 2023, used one semester.
CS101 textbook, 3rd edition. Minor pen marks.
Asking $30.
```

**Trigger conditions:** folder has photos but no `item.json`; `item.json` exists with `status: "draft"`; or description file is newer than the existing `item.json`.

### Skill 2 — Site Setup Wizard (`/setup`)

Run **once** during initial project setup.

```
1. Open Claude Code (or similar AI tool) in the project directory
2. Type: /setup   (or "help me set up content/config.ts")
3. Answer the AI's questions in the chat
4. AI writes content/config.ts and the initial category scaffold
```

The AI asks about 8 areas: store name, location (lat/lng resolved from a place description), item types being sold (creates `_category.json` scaffold), contact platforms, pricing style, visual preferences, and language/locale. Detects seller personality and writes a matching tagline. Can be re-run with targeted requests ("update just my contact info", "change my background effect").

### Skill 3 — Item Translator (`/translate-items`)

Batch-translates item listings into additional locales. After adding a locale to `siteConfig.i18n.availableLocales`, invoke this skill in your AI tool.

```
1. Add the target locale to siteConfig.i18n.availableLocales  (e.g. ["en", "zh"])
2. Open Claude Code (or similar AI tool) in the project directory
3. Type: /translate-items   (or "translate my items into zh")
4. Review the proposed translations shown per item
5. Confirm → AI writes name_{locale} / description_{locale} into each item.json
```

Translates `name` → `name_{locale}` and `description` → `description_{locale}` only; preserves brand, model, tags, prices, dates, and all Markdown syntax verbatim. Skips items that already have a non-empty translation. Writes only to `content/items/*/item.json`.

### No API Key Required

All three skills are Markdown instruction files, not code. The AI tool uses its own built-in capabilities and the user's existing subscription — no `ANTHROPIC_API_KEY`, no extra packages, no new environment variables. All three skills write only to `content/`.

---

## Multi-Language (Locale Switching)

Visitors can read listings in more than one language and switch on the fly.

- **For visitors:** a language toggle (`LocaleSwitcher`) appears in the site header whenever more than one locale is configured. Switching language instantly updates item names (on cards and detail pages) and the item description — no page reload. The choice is remembered in the browser (`localStorage`) across pages and visits.
- **For sellers:** add locale codes to `siteConfig.i18n.availableLocales` (e.g. `["en", "zh"]`), then fill in `name_zh` / `description_zh` on each item — by hand or with the `/translate-items` AI skill. v1 ships concrete Chinese (`zh`) fields; other locales follow the same `name_{locale}` / `description_{locale}` pattern.
- **Graceful fallback:** any item without a translation shows the default language — never a blank or an error.
- **Single deployment:** all languages ship in one build; there are no separate per-language sites.
- **What stays in the default language:** the page `<title>`, social-share (OG) tags, and search-engine structured data render in `defaultLocale` — that is the version crawlers index. The on-page switch is a reading convenience; per-language URLs are a future enhancement.

When only one locale is configured, the switcher is hidden and the site behaves exactly as a single-language build.

---

## Full-Text Search

Built at compile time using `fuse.js`. Searches across: name, description, brand, model, tags, course, ISBN, edition. Enabled via `siteConfig.search.enabled: true`. Search bar lives in `SiteHeader` and shows inline results as the user types.

---

## Seller CLI Tools

Scripts run on the seller's machine. All write only to `content/`.

| Command | What it does |
|---|---|
| `pnpm upload-images` | Upload photos to CDN, update manifest, print backup reminder |
| `pnpm mark-sold <cat>/<name>` | Set `status: "sold"` and `sold_date: today` without editing JSON |
| `pnpm create-item <cat>/<name>` | Create new item folder + `item.json` from template |
| `pnpm new <cat>/<name>` | Shorthand for `create-item` |
| `pnpm create-template [cat]` | Create a `_template.json` for a category (or global) |

---

## Item Status & Visibility

| Status | Recently listed (home) | Category card (home) | `/[category]` page | `/all` page | `/sold` archive | Detail page | Notes |
|---|---|---|---|---|---|---|---|
| `available` | Yes | Card visible | Yes | Yes | No | Yes | |
| `reserved` | **No** | Card visible | Yes + badge | Yes + badge | No | Yes | `reserved_for` never rendered |
| `pending` | **No** | Card visible | Yes + badge | Yes + badge | No | Yes | |
| `sold` | No | Card visible (if in retention) | Yes + overlay (toggle) | Yes (toggle) | **Always** | Yes (if in retention) | Detail page excluded after `soldItemRetentionDays`; `/sold` archive always shows all |
| `draft` | No | No | No | No | No | No | No route generated |

**Key clarification:** The home-page recently listed strip uses `loadAllItems()` which returns `available` status only. `reserved` and `pending` items do NOT appear in the strip, but they DO keep the category card visible on the home page.

---

## UI Customisation — 4 Configurable Slots

Set any option in `content/config.ts`. All 27 Aceternity components are pre-installed by the developer once (`pnpm setup-ui`). Sellers just change the config value — no code editing.

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
| i18n | `i18n.defaultLocale`, `i18n.availableLocales`, `i18n.showLocaleSwitcher`, `i18n.strings.*` |

---

## Build Pipeline

**Seller uploads photos** (`pnpm upload-images`):
Photos → CDN, manifest updated, backup reminder printed, photo quality warnings shown.

**CI build — GitHub Actions / Vercel** (`pnpm build`):
Prebuild: reads manifest + builds search index → `next build` generates all pages → postbuild generates sitemap.

**Local dev** (`pnpm dev`):
Photos copied locally → dev server with hot reload.

### Developer Scripts (run once)

| Script | Purpose |
|---|---|
| `pnpm setup-ui` | Install all 27 Aceternity components |

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

Automatic — follows the visitor's OS/browser dark/light preference via Tailwind v4's default `prefers-color-scheme` behaviour (no `darkMode` directive needed). No toggle needed; no user action required. All Aceternity components are dark-mode aware.

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
| UI components | Aceternity UI (27 components, pre-installed) |
| Styling | Tailwind CSS v4 + @tailwindcss/typography |
| Schema validation | Zod 3 |
| Markdown | react-markdown + remark-gfm |
| Search | fuse.js (client-side, build-time index) |
| Analytics | @vercel/analytics + @vercel/speed-insights |
| Sitemap | next-sitemap |
| Animations | framer-motion |
| Icons | @tabler/icons-react |
| Package manager | pnpm |
| Primary host | GitHub Pages (via GitHub Actions) |
| Image CDN | Cloudflare R2 (recommended) or Vercel Blob |
