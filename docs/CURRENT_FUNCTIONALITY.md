# UsedExchange — Current Functionality (v1.1)

**Based on:** DESIGN.md v0.10.0 · TECH_REQUIREMENTS.md v0.10.0 · IMPLEMENTATION_PLAN.md v1.7  
**Date:** 2026-08-02  
**Status:** Implemented — this document describes all live functionality: core v1 plus Phases 16–18 (shipping estimator, Facebook Marketplace export, Seller Studio).

---

## Who Is This For

### Primary — College Students with a CS Background
Comfortable with git, the terminal, and JSON. Wants a personal, polished storefront to sell items in their campus area. Runs `pnpm upload-images` and `pnpm push` without hesitation.

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
| `dimensions` | object | L × W × H in cm or in — converted for display to the visitor's resolved unit system (`siteConfig.measurementUnit`, optionally per-locale) |
| `weight` | object | Value + unit (kg or lb) — converted for display the same way |
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

### Shipping Cost Estimation (Optional)
Disabled by default — sellers opt in via `siteConfig.shipping.enabled`. When enabled, items in the open-ended "Shipping" tier (the one without `miles_max`) and with `weight` + `dimensions` set show a live shipping estimate:

- **Seller pays shipping** (`siteConfig.shipping.defaultPayer: "seller"`, or `price.shipping_payer: "seller"` per item) → shows "Free shipping (included by seller)", no input needed.
- **Buyer pays shipping** (default) → buyer enters their ZIP code; the site calls a Cloudflare Worker proxy, which queries Shippo or EasyPost and returns the cheapest live rate.

API keys for the shipping provider live only in the Cloudflare Worker (`workers/shipping-rate-proxy/`), never in the static site bundle. See [DESIGN.md §21](DESIGN.md) and `.claude/commands/setup-shipping.md`.

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

### Photo Privacy — EXIF/GPS Stripping
Every new or changed JPEG/PNG/WebP photo is automatically re-encoded via `sharp` (`lib/images/stripMetadata.ts`) before `pnpm upload-images` sends it to the CDN — this removes all EXIF/IPTC/XMP metadata, including GPS location, while auto-rotating the image so it still displays right-side-up. GIFs pass through unchanged. Original files in `content/items/` are untouched; `pnpm dev` and `pnpm build` (dev-sync/build-check) are unaffected. The same stripping also runs when photos are synced to the CDN from Seller Studio.

---

## Pages

### Global — All Pages
- **SiteHeader** — site name/logo, navigation links (Home, Browse All `/all`, Newly Listed `/newly-listed`, and About `/about` once the store is configured) + full-text search bar (when `siteConfig.search.enabled`)
- **SiteFooter** — contact platform buttons, last-build timestamp

### Home Page (`/`)
- **Hero** — site name, tagline, CTA button
- **Category grid** — cards for visible categories; count of available items each
- **Recently Listed** — last N `available` items with location-resolved prices; prices update silently as geo resolves; section hidden if empty
- **Recently Viewed** — horizontal strip of last 5 viewed items (sessionStorage); hidden if empty
- **Unconfigured state:** while `baseUrl` is still the placeholder/demo domain, `/` renders the project introduction (`ProjectIntro`) instead of the catalog — the catalog appears once the seller completes setup

### Category Page (`/[category]`)
- Location price bar — detected distance + "Change distance" override
- **Filter bar** — condition chips + price range slider (configurable outlier strategy via `ui.priceFilterStrategy`: none / percentile / logarithmic / preset-buckets / iqr) + status toggle
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
All non-draft items across all categories in one scrollable grid: `available` items shown by default; `reserved` and `pending` items shown with status badges; `sold` items hidden by default but visible when the status toggle is turned on. Full filter + sort bar, identical to category pages. (Data source: `loadBrowseAllPageData()` — a single-pass loader applying the same visibility rules as any category page.)

### Sold Items Archive (`/sold`)
All sold items regardless of `soldItemRetentionDays`; sorted by sold date descending. Social proof. No pricing or contact. The grid is capped at `siteConfig.soldArchiveDisplayLimit` items (`0` = unlimited).

### Newly Listed Page (`/newly-listed`)
Active (non-sold) items grouped into three tabs: **since your last visit** (tracked in the browser via `localStorage`; on a first visit every currently listed item counts), **today**, and **this week**. Each tab label carries its item count; an empty period shows a "nothing new" message instead of a blank page. Linked from the SiteHeader.

### About Page (`/about`)
Permanent home for the project introduction (`ProjectIntro`) with its own SEO metadata. Before the seller configures the store, `/` shows this same introduction instead of the catalog; once configured, `/` becomes the catalog and `/about` keeps the introduction reachable. The About link appears in the header only once the store is configured.

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
| Facebook | `https://facebook.com/{username}` — a pasted full profile URL (e.g. `profile.php?id=...`) is normalized rather than double-encoded |
| Instagram | `https://instagram.com/{handle}` |
| Snapchat | `https://snapchat.com/add/{username}` |
| Twitter/X | `https://x.com/{handle}` |
| TikTok | `https://tiktok.com/{handle}` |
| LinkedIn | `https://linkedin.com/{path}` — `/` is preserved (not %-encoded); a bare handle defaults to `in/{handle}` |
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

Four AI-assisted workflows ship as **Claude Code skill files** in `.claude/commands/`. The seller uses any AI coding tool they already have — Claude Code, Cursor, GitHub Copilot, or any capable assistant. **No additional API keys, environment variables, or packages are required.**

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

The AI asks about 8 question groups: site identity, deployment (URL + hosting), image storage provider, location (lat/lng resolved from a place description), contact platforms, content defaults (currency, recently-listed count, sold-item retention), visual preferences, and language/locale. Detects seller personality and writes a matching tagline. Can be re-run with targeted requests ("update just my contact info", "change my background effect").

### Skill 3 — Item Translator (`/translate-items`)

Batch-translates item listings into additional locales. After adding a locale, invoke this skill in your AI tool.

```
1. Add the locale code to siteConfig.i18n.availableLocales  (e.g. ["en", "zh"])
2. Add a translations.{locale} block to content/config.ts with all 87 UI string keys translated
3. Open Claude Code (or similar AI tool) in the project directory
4. Type: /translate-items   (or "translate my items into zh")
5. Review the proposed translations shown per item
6. Confirm → AI writes name_{locale} / description_{locale} into each item.json
```

Translates `name` → `name_{locale}` and `description` → `description_{locale}` only; preserves brand, model, tags, prices, dates, and all Markdown syntax verbatim. Skips items that already have a non-empty translation. Writes only to `content/items/*/item.json`.

> **Note:** `/translate-items` handles item-level translations only. The `translations.{locale}` UI strings block (buttons, badges, headers — 87 keys) must be filled in manually in `content/config.ts` (or by re-running `/setup`) before running this skill.

### Skill 4 — Shipping Setup Wizard (`/setup-shipping`)

Enables and configures the **optional** live shipping-rate estimator (see Pricing → Shipping Cost Estimation). Idempotent: re-running it summarises the current `shipping` settings and offers to change the payer, ship-from address, or proxy URL — or to disable the feature.

```
1. Open Claude Code (or similar AI tool) in the project directory
2. Type: /setup-shipping   (or "enable the shipping calculator")
3. Answer the AI's questions (enable?, carrier provider, default payer, ship-from ZIP/country)
4. Deploy the shipping-rate-proxy Cloudflare Worker if needed (terminal steps the seller runs
   themselves in workers/shipping-rate-proxy/ — the skill reads back the Worker URL only)
5. AI writes the shipping block in content/config.ts and, if needed, weight/dimensions/
   shipping_payer additions to specific content/items/*/item.json files
```

Writes only to `content/`; nothing changes if the seller declines or the feature stays disabled.

### No API Key Required

All four skills are Markdown instruction files, not code. The AI tool uses its own built-in capabilities and the user's existing subscription — no `ANTHROPIC_API_KEY`, no extra packages, no new environment variables. All four skills write only to `content/`.

---

## Multi-Language (Locale Switching)

Visitors can read listings in more than one language and switch on the fly.

- **For visitors:** a language toggle (`LocaleSwitcher`) appears in the site header whenever more than one locale is configured. Switching language instantly updates item names, descriptions, and all UI labels (buttons, badges, headers) — no page reload. The choice is remembered in the browser (`localStorage`) across pages and visits.
- **For sellers:** two steps to add a language:
  1. Add the locale code to `siteConfig.i18n.availableLocales` (e.g. `["en", "zh"]`) **and** add a `translations.{locale}` block in `content/config.ts` with all 87 UI string keys translated. The build fails if this block is missing or incomplete.
  2. Fill in `name_zh` / `description_zh` on each item — by hand or with the `/translate-items` AI skill.
- **Fallback:** any item without a translation shows the default language — never a blank or an error. Any missing UI string key falls back to the built-in English default.
- **Single deployment:** all languages ship in one build; there are no separate per-language sites.
- **What stays in the default language:** the page `<title>`, social-share (OG) tags, and search-engine structured data render in `defaultLocale` — that is the version crawlers index. The on-page switch is a reading convenience; per-language URLs are a future enhancement.

When only one locale is configured, the switcher is hidden and the site behaves exactly as a single-language build.

---

## Full-Text Search

Built at compile time using `fuse.js`. Searches across: name, description, brand, model, tags, course, ISBN, edition. Enabled via `siteConfig.search.enabled: true`. Search bar lives in `SiteHeader` and shows inline results as the user types. Sold and draft items are excluded from the index; available, pending, and reserved items are searchable.

---

## Seller CLI Tools

Scripts run on the seller's machine. All listing changes write only to `content/` (plus the generated image manifest); `upload-images` additionally writes the manifest and checksum cache, and `fb-export` writes into `exports/`.

| Command | What it does |
|---|---|
| `pnpm upload-images` | Upload photos to CDN, update manifest, print backup reminder |
| `pnpm push` | Stage `content/` + manifest, commit with default message, and push |
| `pnpm mark-sold <cat>/<name>` | Set `status: "sold"` and `sold_date: today` without editing JSON — edits the JSONC in place, preserving any `// options: ...` comments |
| `pnpm create-item <cat>/<name>` | Create new item folder + `item.json` pre-filled with all 36 template fields (the full item schema, see DESIGN.md §5; the private `reserved_for` field is intentionally never scaffolded), written as JSONC with `// options: ...` hints listing every valid value for `condition`, `status`, `dimensions.unit`, and `weight.unit` |
| `pnpm new <cat>/<name>` | Shorthand for `create-item` |
| `pnpm create-template [cat]` | Create a `_template.json` for a category (or global) — same JSONC + `// options: ...` hints as `create-item` |
| `pnpm fb-export` | Interactively export `available` / `pending` / `reserved` items to a Facebook Marketplace bulk-upload CSV. Guided prompt: select all / by category / individual items (supports comma lists and ranges like `1-4`); choose price strategy (lowest / highest / local-pickup tiers / shipping tiers — tier options appear only when matching items exist); auto-batches into 50-item files (FB's limit), written to `exports/facebook-marketplace.csv` (or `exports/facebook-marketplace-<N>.csv` when batched). Enforces FB limits: ≤150-char titles, ≤5000-char descriptions. Smart category mapping infers FB's category hierarchy from item tags, brand, and name — no manual setup needed. **Export history:** on the second run a Step 0 appears offering to skip items already exported in previous runs; history persisted in `exports/.export-history.json` (gitignored). **Photos:** the CSV PHOTO columns hold CDN `https://` URLs (up to 10 per item — FB's limit; Facebook fetches them when the CSV is uploaded), so run `pnpm upload-images` first or those columns are empty and the script warns you. As a manual-upload fallback (e.g. in case CDN URLs change), local photos are also copied to `exports/facebook-marketplace-photos/NNN_category-item/`. |

---

## Seller Studio

A local-only web GUI for managing listings in a browser — an alternative to editing `item.json` by hand. Start it with `pnpm studio` (use `pnpm studio --port 3000` to change the port; any integer from 1024–65535 is accepted, default **5174**), then open the printed URL. It runs entirely on the seller's machine: it is never part of the build output, never deployed, and never reachable by site visitors. The launcher fails fast with a clear "run `pnpm update-site`" message if Vite or the Studio app is missing, and it loads `.env.local` so CDN credentials are picked up automatically. It follows the storefront's brand palette and offers light and dark themes, switchable from the header; the choice persists across sessions.

Eight operations, all from one page:

| Operation | What it does |
|---|---|
| Create | Add a new item: pick a category and type a kebab-case name — the folder and a full template `item.json` are scaffolded (same 36-field template as `pnpm create-item`) |
| Getting started | A setup checklist for a new site: what is still missing (site identity, CDN credentials, first item, git, contact) and where to fix each one. Opens itself until the core steps are done, then stays one click away in the header |
| Search & filter | Status tabs (Active hides sold by default), fuzzy search over name, category and tags, a category dropdown, and sorting by name, price or listed date — all instant, computed in the browser. A table/cards toggle switches the item list between a dense table and a photo-forward card grid; the choice persists across sessions |
| Defaults | Manage site-wide and per-category default field values (sparse `_defaults.json` under `content/items/`); new items merge them over the template, with an opt-out checkbox in the new-item dialog. Price tiers are set through a dedicated "Price tiers" block (one checkbox gates the whole array). |
| Site config | Edit `content/config.ts` from the browser — site name, tagline, currency, location, contact, UI slots and the rest. Comments in the file survive every save; each write is type-checked before it lands, and a write that would break the build is discarded |
| Photos | Upload photos by dragging files onto an item (filenames sanitised, type sniffed from magic bytes), reorder them by dragging, delete them, and push changes to the CDN with live progress |
| Bulk status | Change `status` (available / reserved / pending / sold / draft) for many items at once, with per-item failure reporting; items already at the target status are skipped and reported |
| Bulk apply default tiers | Overwrite `price.tiers` on the selected items with each item's own merged defaults (site ← category); items without default tiers, or already matching, are skipped and reported |
| Edit form | Edit any item's fields with a two-tier, schema-driven form: the groups you touch daily are open, the rest are one click away; only the fields you changed are written back, preserving JSONC comments |
| Publish | Review uncommitted changes, write a commit message, and commit + push `content/` plus the image manifest |

**The default view hides sold items.** Studio opens on the **Active** tab, which shows everything except `sold` — the working set a seller acts on day to day. Sold listings are one click away on their own tab, and **All** shows everything. Bulk actions apply to exactly the rows currently visible: selecting all with a filter applied selects only that filtered set, and changing any filter clears the selection so an action can never reach a row that scrolled out of view. A row whose status you just changed stays put until the next filter change, so the SOLD stamp is not swept away by the very filter it triggers. The table's header carries a select-all checkbox; cards view has no shared header row, so its own select-all checkbox sits in the filter bar instead, appearing only while cards view is active.

**Photo thumbnails and a card view.** The table's Photo column shows each item's cover image (`cover.*` if one exists, otherwise the first photo alphabetically, matching the rule the live site itself uses) at 40×40px, or a camera-off icon when the item has no photos yet or the image fails to load. The same cover image, at a larger 4:3 size, is the centerpiece of the optional card view — switch to it from the table/cards toggle in the filter bar when you want to recognise items by photo rather than by name.

**A locale switcher for multi-language sites.** When `content/config.ts` lists more than one `availableLocales`, a language switcher appears in the header next to the theme toggle. Changing it switches which language the item list's names are shown in (falling back to the default-locale name for any item that has no translation yet); the choice persists across sessions. It edits nothing — translated names and descriptions are still edited in the item drawer's existing **Translations** group. On a single-language site the switcher does not render at all.

**The UI chrome follows the language selector.** Studio UI chrome (buttons, labels, tabs, statuses, filter bar, edit form, config pane, etc.) follows the language selector — built-in EN + ZH dictionaries with optional seller overrides via `content/config.ts`.

**Local-only server + CSRF protection.** The Studio server binds to `127.0.0.1` only — it is unreachable from the network. Every mutating request is guarded (fails closed): it must carry `Content-Type: application/json` (else HTTP 415) and, when an `Origin` header is present, the origin must equal the server's own host (else HTTP 403). GET/HEAD requests are exempt.

**CDN sync with live progress.** "Sync to CDN" streams progress over server-sent events (progress / done / error), rendered live in the sync bar; only one sync can run at a time, and publish is refused while a sync is in flight. Sync runs the same EXIF/GPS stripping as `pnpm upload-images`, rewrites the committed image manifest (`lib/generated/image-manifest.json`, which stays in git), and refreshes the in-memory manifest cache so the item list immediately shows fresh CDN URLs. Missing CDN credentials surface as a stream error, not a startup failure.

**The edit form leads with what you actually edit.** The Details tab groups the 43 field inputs into eight groups ordered by how often a seller touches them. **Listing** (name, status, condition, quantity, description, tags) and **Price** are open on arrival — and the price tiers now sit inside Price, right under the currency, instead of at the very bottom of the form. Translations, Specs, Payment & pickup, Books & courses, Extras and Dates are collapsed; each collapsed header carries a badge saying either how many unsaved changes it is hiding or how many of its fields already hold a value, so you can see which groups have data without opening them all. `listed_date` and `sold_date` moved into their own collapsed Dates group on purpose: `pnpm mark-sold` and the bulk status action maintain those two, and hand-editing them is how a sold date ends up disagreeing with a status.

**Nothing you type goes missing.** A changed field is marked next to its label, a bar pinned to the bottom of the drawer shows the running count of unsaved changes with **Save changes** and **Discard**, and switching to the Photos tab and back keeps the draft — the Details tab itself is marked while anything is unsaved. If a save is rejected, the collapsed group holding the rejected field opens so the message names something you can see. After a successful save the form re-reads the file from disk, so what you see is what was written.

**Strict edit-form validation.** The edit form is driven by a strict field grammar that mirrors the item schema exactly (no silent coercion): optionality and allowed values match the on-disk schema, so invalid values are rejected rather than quietly rewritten. Writes are surgical JSONC edits — seller comments (`// options: ...`) and formatting survive every save.

**Publish safety.** The publish pane shows the uncommitted-change count (also surfaced in the Studio header), the changed-file list, and a commit-message input (required, ≤ 500 characters). Publishing stages **only** `content/` and `lib/generated/image-manifest.json` — exactly what `pnpm push` stages, never `git add -A`, so `.env.local` (with CDN credentials) can never ride along. It refuses out-of-band staged files, refuses detached HEAD, and re-reads the change list at commit time.

Like the CLI scripts, Studio writes only to `content/` and the image manifest. It never reads or writes `reserved_for` — private buyer info stays out of the tool entirely.

---

## Item Status & Visibility

| Status | Recently listed (home) | Category card (home) | `/[category]` page | `/all` page | `/sold` archive | Detail page | Notes |
|---|---|---|---|---|---|---|---|
| `available` | Yes | Card visible | Yes | Yes | No | Yes | |
| `reserved` | **No** | Card visible | Yes + badge | Yes + badge | No | Yes | `reserved_for` never rendered |
| `pending` | **No** | Card visible | Yes + badge | Yes + badge | No | Yes | |
| `sold` | No | Card visible (if in retention) | Yes + overlay (toggle) | Yes (toggle) | **Yes** | Yes (if in retention) | Detail page excluded after `soldItemRetentionDays`; `/sold` archive shows all sold items regardless of retention, capped by `soldArchiveDisplayLimit` (0 = unlimited) |
| `draft` | No | No | No | No | No | No | No route generated |

**Key clarification:** The home-page recently listed strip is derived by `loadHomePageData()`, which returns `available` items only (sorted by listed date descending, capped at `recentlyListedCount`). `reserved` and `pending` items do NOT appear in the strip, but they DO keep the category card visible on the home page.

---

## UI Customisation — 4 Configurable Slots + Price Filter

Set any option in `content/config.ts`. All 27 Aceternity components are pre-installed by the developer once (`pnpm setup-ui`). Sellers just change the config value — no code editing.

| Slot | Config key | Options |
|---|---|---|
| Background | `ui.background` | `"none"` + 13 Aceternity backgrounds |
| Item Grid | `ui.itemGrid` | `"simple"` + bento-grid, layout-grid, focus-cards |
| Gallery | `ui.gallery` | `"simple"` + apple-cards-carousel, images-slider, carousel, parallax-scroll |
| Item Card | `ui.itemCard` | `"simple"` + 7 Aceternity card effects |
| Price Filter | `ui.priceFilterStrategy` | `"none"` (default), percentile, logarithmic, preset-buckets, iqr |

---

## Site Configuration (`content/config.ts`)

Fields marked **(optional)** are TypeScript-optional with runtime defaults — older `content/config.ts` files that lack them keep working after a template update (they can also be auto-injected with `pnpm migrate-config`).

| Section | Fields |
|---|---|
| Identity | `name`, `tagline`, `logo` |
| Deployment | `deploymentMode`, `baseUrl` |
| Image storage | `imageStorage.provider` |
| Seller location | `location.lat`, `location.lng`, `location.label` |
| Content defaults | `currency`, `recentlyListedCount`, `soldItemRetentionDays`, `soldArchiveDisplayLimit?` **(optional)** — caps the `/sold` grid; `0` = unlimited, default `200`, `defaultPriceTiers?` **(optional)** — tier template used by `create-item`, `measurementUnit?` **(optional)** — `"metric"` / `"imperial"`, default `"metric"` |
| Shipping **(optional section)** | `shipping.enabled`, `shipping.proxyUrl`, `shipping.defaultPayer` (`"seller"` / `"buyer"`), `shipping.origin.zip`, `shipping.origin.country` |
| Contact | `contact.reveal_behavior`, `contact.platforms[]` |
| Hero | `hero.cta_label`, `hero.cta_href` |
| SEO | `meta.description`, `meta.twitterHandle` |
| UI slots | `ui.background`, `ui.itemGrid`, `ui.gallery`, `ui.itemCard`, `ui.priceFilterStrategy?` **(optional)**, `ui.priceFilterBuckets?` **(optional)** |
| Dark mode | Header toggle (light/dark/system, persisted via `next-themes`) |
| Analytics | `analytics.vercel`, `analytics.speedInsights` |
| Search | `search.enabled`, `search.placeholder` |
| Sitemap | `sitemap.enabled` |
| i18n | `i18n.defaultLocale`, `i18n.availableLocales`, `i18n.showLocaleSwitcher`, `i18n.translations.{locale}.*` (87 UI string keys total; the prebuild check fails if any listed locale lacks the required keys, with the default locale as fallback), `i18n.localeMeasurementUnits?` **(optional)** — per-locale unit overrides |

---

## Build Pipeline

**Seller uploads photos** (`pnpm upload-images`):
Photos → CDN, manifest updated, backup reminder printed, photo quality warnings shown.

**CI build — GitHub Actions / Vercel** (`pnpm build`):
Prebuild: fails on a placeholder `baseUrl` or incomplete locale translations, verifies the image manifest (cloud providers) or copies photos (local provider), and builds the search index → `next build` generates all pages → postbuild generates `sitemap.xml` + `robots.txt` (when `sitemap.enabled`).

**Local dev** (`pnpm dev`):
Photos copied locally → dev server with hot reload.

### Developer & Maintainer Scripts

| Script | Purpose |
|---|---|
| `pnpm setup-ui` | (Run once) Install all 27 Aceternity components into `components/ui/` |
| `pnpm update-site [tag] [--list] [--skip-verify]` | Pull a new upstream template release into this repo without touching `content/` (latest tag by default; `--list` prints available versions), then auto-migrate the config, verify (install + type-check + build), and commit |
| `pnpm migrate-config` | Splice new optional config fields into `content/config.ts` with defaults after a template upgrade — additive only; existing values are never modified |
| `pnpm bump` | (Maintainers) Interactive version bump + GitHub release: bumps `package.json`, waits for CI, tags, and creates the release via `gh` |

Developer tooling: `pnpm type-check`, `pnpm lint` (zero-warning), `pnpm format`, and `pnpm test` / `pnpm test:watch` / `pnpm test:coverage` (Vitest). `pnpm studio` is documented in its own section above.

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

A sun/moon toggle in the site header (`ThemeToggle`) lets visitors switch between light and dark themes. It defaults to the visitor's OS/browser preference (`system`) and persists an explicit choice via `next-themes` (class-based switching, stored in `localStorage`). All Aceternity components are dark-mode aware.

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
| Seller CLI tools | Listing changes write only to `content/` (plus the generated image manifest) |
| Seller Studio | Binds to `127.0.0.1` only; CSRF-guarded mutating requests; publishes only `content/` + the image manifest (never `git add -A`, so `.env.local` can never be staged); never touches `reserved_for` |
| Image manifest | `lib/generated/image-manifest.json` is committed to git so CI builds need no CDN credentials |

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
| Animations | motion (framer-motion) |
| Icons | @tabler/icons-react |
| Package manager | pnpm |
| Primary host | GitHub Pages (via GitHub Actions) |
| Image CDN | Cloudflare R2 (recommended) or Vercel Blob |
