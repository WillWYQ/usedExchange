# UsedExchange — Features Roadmap

**Version:** v1.6 · **Date:** 2026-09-05  
**Scope:** Features beyond v1. Not committed — prioritised for planning discussions.

---

## ✅ Shipped in v1

v1 is **fully implemented and in production** — template version 1.4.2, Phases 0–18 complete (see IMPLEMENTATION_PLAN.md). The following features were initially on the roadmap and have been implemented in code as part of the v1 build (specified in DESIGN.md / TECH_REQUIREMENTS.md). "Shipped in v1" here means implemented and live.

| Feature | Notes |
|---|---|
| Discord contact platform 🎓 | DM (user profile) links only |
| Pre-filled contact messages 🎓👤 | WhatsApp and email pre-filled with item name + price; Venmo pre-filled with item name |
| Native share + copy link 🎓👤 | `navigator.share()` + clipboard fallback |
| Sort options on category page 🎓👤 | Price (lo/hi), date listed, condition |
| "Listed X days ago" freshness 🎓👤 | Derived from `listed_date` |
| Condition guide tooltip 👤 | `?` icon explains each condition enum |
| JSON-LD structured data (Product schema) 🎓👤 | Rich snippets + BreadcrumbList |
| Quantity indicator 🎓👤 | "3 available" badge when `quantity > 1` |
| Schema additions 🎓 | stripe_payment_link, pickup_windows, no_lowball, price_reduced, youtube_link, isbn, course, edition, semester_listed, name_zh, description_zh, venmo_payment_request, min_acceptable_offer |
| Client-side full-text search 🎓👤 | fuse.js; build-time index; search bar in header |
| Dark mode (auto + manual toggle) 🎓 | Defaults to OS preference (`prefers-color-scheme`); `ThemeToggle` in the header lets visitors override, persisted via `next-themes` |
| Seller CLI tools 🎓👤 | `pnpm create-item`, `pnpm create-template`, `pnpm new`, `pnpm mark-sold`; plus template-management: `pnpm update-site`, `pnpm migrate-config`, `pnpm push`, `pnpm bump` |
| "Browse All" cross-category page 🎓👤 | `/all` route with full filter + sort |
| "Make an Offer" flow 🎓👤 | Inline form + pre-filled contact message; `min_acceptable_offer` gate |
| Recently viewed items 🎓👤 | `sessionStorage`-based strip on home + detail pages |
| Photo quality warnings 🎓 | Advisory during `pnpm upload-images` |
| Sitemap 🎓👤 | `next-sitemap`; runs in `postbuild` |
| Sold items archive page 🎓👤 | `/sold` route; all sold items regardless of retention; the grid is capped at `siteConfig.soldArchiveDisplayLimit` (header shows the full count) |
| Twitter/X + Pinterest rich cards 🎓👤 | `twitter:card: "summary_large_image"` + `product:price:amount` / `product:price:currency` meta tags (`og:type` stays `"website"`) |
| Textbook-specific fields & category 🎓 | isbn, course, edition, semester_listed; Compare prices link |
| Non-technical user setup guide 👤 | `SETUP_GUIDE.md` in plain English; core sections cover `content/` item management, plus optional sections (Seller Studio, shipping Worker, Facebook export) that do involve terminal/slash commands |
| i18n — multi-language support 🎓👤 | Single-instance multi-locale (runtime LocaleSwitcher); `name_zh`/`description_zh` pattern; `defaultLocale` + `availableLocales` + `siteConfig.i18n.translations.{locale}` (109 UIStrings keys); `useT()` hook; `/translate-items` skill |
| Venmo + Zelle payment (QR or link) 🎓👤 | Venmo: link-based or QR; Zelle: QR-only |
| Measurement-unit toggle 🎓👤 | `siteConfig.measurementUnit` + per-locale `i18n.localeMeasurementUnits` overrides; `MeasurementUnitToggle` in `SiteHeader` converts item weight/dimension display between metric and imperial |
| Price filter strategies 🎓 | Optional `ui.priceFilterStrategy` (`"none"` \| `"percentile"` \| `"logarithmic"` \| `"preset-buckets"` \| `"iqr"`) + `ui.priceFilterBuckets`, consumed by FilterBar/ItemGrid with a `?? "none"` runtime default (backward-compatible per the config-compat rule) |
| Newly Listed page 🎓👤 | `/newly-listed` route (`NewlyListedClient`) showing recent listings with incremental reveal |

---

Effort scale: XS (hours) · S (1 day) · M (2–4 days) · L (1–2 weeks) · XL (major scope)  
Value scale: ⭐ Nice to have · ⭐⭐ Meaningful improvement · ⭐⭐⭐ High impact  
User tags: 🎓 CS Student (primary) · 👤 Broader users (potential)

---

## Target User Context

| User segment | Setup comfort | Ongoing workflow | Priority features |
|---|---|---|---|
| 🎓 **CS Student (primary)** | High — git, terminal, JSON | `pnpm upload-images` + `git push` | Discord contact, semester-end tools, short-range distance tiers, textbook/electronics fields |
| 👤 **Non-CS user (potential)** | Low — needs one-time setup help | Only `content/` folder | CLI mark-sold tools, local dashboard, zero-code status updates |

Features tagged 🎓 are primarily motivated by the CS student profile. Features tagged 👤 primarily lower the barrier for non-technical users.

---

## Tier 1 — Quick Wins
*Low effort, can start immediately. Many can be added during Phase 13 (hardening) or Phase 10 (contact).*

### 1.1 Discord Contact Platform 🎓 ✅ Shipped in v1
**Effort:** XS · **Value:** ⭐⭐⭐

Discord is the dominant communication platform for CS students — it's where campus communities, club servers, and class Discord channels live. It is already the most common place CS students would share or discover a listing.

- Direct message (user profile) link: `https://discord.com/users/{user-id}`
- `PlatformButton` always constructs the user-profile URL — server invite (`discord.gg`) links are **not** supported

**This is a v1 feature for the primary user** — Discord should ship in the initial contact platform set alongside email and Instagram.

---

### 1.2 Pre-filled Contact Messages 🎓 👤 ✅ Shipped in v1
**Effort:** XS · **Value:** ⭐⭐⭐

When a visitor clicks a contact platform button, the outreach message is pre-filled with the item name and price — removing the friction of composing a message from scratch.

- WhatsApp: `https://wa.me/{number}?text=Hi, I'm interested in your {item.name} ({price}). Is it still available?` — `{price}` is the resolved tier formatted with the currency symbol (e.g. `$250`)
- Email: `mailto:{address}?subject=Inquiry: {item.name}&body=Hi, I'm interested in your {item.name}...`
- Applies to any platform that supports deep-link pre-fill

**Implementation:** Extend `PlatformButton` to accept optional `item` props; construct the pre-filled URL in `ContactSection`.

---

### 1.3 Native Share + Copy Link ✅ Shipped in v1
**Effort:** XS · **Value:** ⭐⭐⭐

A "Share" button on item detail pages.
- Mobile: invokes `navigator.share({ title, text, url })` — opens the OS share sheet
- Desktop: falls back to `navigator.clipboard.writeText(window.location.href)` with a "Copied!" toast
- Enables buyers to forward listings to friends via any app

**Implementation:** One new client component `ShareButton.tsx`.

---

### 1.4 Sort Options on Category Page ✅ Shipped in v1
**Effort:** XS · **Value:** ⭐⭐⭐

Sort the item grid by:
- Price low → high / high → low (on resolved distance price)
- Date listed (newest first — already the default)
- Condition (new first)

Client-side only, no rebuild. A dropdown in the filter bar.

---

### 1.5 "Listed X days ago" Freshness Indicator ✅ Shipped in v1
**Effort:** XS · **Value:** ⭐⭐

Show how long an item has been listed on the item card and detail page. Derived from `listed_date`.  
Examples: "Listed today" · "Listed 3 days ago" · "Listed 14 days ago" — `lib/utils/date.ts` only ever returns "Today" or "N days ago" (no week/month rollup), so a long-listed item just shows a larger day count rather than "2 weeks ago" style phrasing.

Adds urgency and transparency without any schema changes.

---

### 1.6 Condition Guide Tooltip 👤 ✅ Shipped in v1
**Effort:** XS · **Value:** ⭐⭐

A `?` icon next to the condition badge that opens a small tooltip or modal explaining what each condition value means:
- **New** — never used, original packaging
- **Like New** — used once or twice, no visible wear
- **Good** — normal use, minor cosmetic imperfections
- **Fair** — visible wear, fully functional
- **For Parts** — not fully functional, sold as-is

Reduces buyer uncertainty. One shared `ConditionGuide` component.

---

### 1.7 JSON-LD Structured Data (Product Schema) ✅ Shipped in v1
**Effort:** S · **Value:** ⭐⭐⭐

Embed `<script type="application/ld+json">` on item detail pages with `@type: "Product"`. Google uses this to show rich snippets in search results (price, availability, rating slot).

Fields available from existing data: `name`, `description`, `image`, `offers.price`, `offers.availability`, `brand`. (`color` was previously listed here too, but `buildProductJsonLd` doesn't actually emit it.)

**Also add:** `BreadcrumbList` JSON-LD on item detail pages for breadcrumb rich snippets. (This was previously described as running on category pages too — it doesn't; the category page has a visual `Breadcrumb` component with no matching JSON-LD.)

**Implementation:** Server-side builders in `lib/utils/jsonld.ts` rendered in the page body via the `JsonLd` component (`components/common/JsonLd.tsx`). Zero new data required.

---

### 1.8 Quantity Indicator ✅ Shipped in v1
**Effort:** XS · **Value:** ⭐⭐

The `quantity` field exists in `item.json` but is never displayed. Show "3 available" on item cards and detail pages when `quantity > 1`. Adds urgency for bulk listings.

---

### 1.9 Vercel Analytics + Speed Insights *(planned — not yet shipped)*
**Effort:** XS · **Value:** ⭐⭐

One script component in `app/layout.tsx`. Would show:
- Page views and most visited items
- Traffic sources
- Core Web Vitals per page

**Status:** The `@vercel/analytics` and `@vercel/speed-insights` packages are already installed as dependencies but are not wired up — nothing in `app/` or `components/` imports or renders them. Note the site deploys to GitHub Pages; Vercel Analytics requires Vercel hosting, so enabling it means either migrating deployment or choosing an alternative analytics provider.

**See also:** §1.13 Google Analytics (GA4) — shipped as an alternative that
needs no Vercel hosting.

---

### 1.10 PWA Web App Manifest ✅ Shipped
**Effort:** XS · **Value:** ⭐⭐

`app/manifest.ts` (the Next.js file-convention route, not a static `public/manifest.json`) makes the site installable as a home screen app on iPhone and Android: name/short name from `siteConfig.name`, theme/background colour, `display: "standalone"`, and a 192×192/512×512 icon set rasterized from `app/icon.svg` via `sharp`. Requires `export const dynamic = "force-static"` under `output: "export"` — without it, `next build` fails to collect page data for the manifest route.

No service worker — manifest alone enables installation.

---

### 1.11 Schema Additions for Free (add in Phase 3) 🎓 👤 ✅ Shipped in v1
**Effort:** XS · **Value:** ⭐⭐⭐

These fields cost nothing to add to `item.json` schema during Phase 3 (Content Schema). Retrofitting them later requires updating all existing `item.json` files.

```jsonc
"stripe_payment_link": "",    // Stripe Payment Link URL → "Pay Deposit" button
"pickup_windows": [],         // ["Weekday evenings", "Saturdays 10am–2pm"]
"no_lowball": false,          // shows "Firm Price" badge alongside price
"price_reduced": false,       // shows "Price Reduced" chip on card
"youtube_link": "",           // demo video URL (useful for electronics, appliances)

// 🎓 CS Student-specific additions:
"isbn": "",                   // textbook ISBN (enables lookup link to compare prices)
"course": "",                 // e.g. "CS101", "MATH230" — searchable, shown on textbook detail page
"edition": "",                // e.g. "3rd edition"
"semester_listed": ""         // e.g. "Spring 2026" — helps buyers know if textbook is current edition
```

All optional, all default to empty/false.

---

### 1.12 Semester-End Batch Actions 🎓 ✅ Shipped
**Effort:** S · **Value:** ⭐⭐⭐

CS students do most of their selling at the end of each semester. A single command to prepare for a sell-off:

```bash
pnpm semester-end
```

This script:
1. Prints all `available` items listed for > 60 days (shares its "stale" definition with `pnpm stale-check`, §2.4, so the two can never disagree)
2. Prompts, per stale item (via the shared `scripts/lib/cliPrompt.ts`): mark sold, reduce the lowest price tier, or leave as-is
3. Runs `pnpm upload-images` if anything changed
4. Prints a suggested commit message (`"chore: end-of-semester listing cleanup"`) and the exact `git add`/`commit`/`push` sequence to use it — or the plain `pnpm push` alternative

**Correction (2026-09-05):** the original spec above called for opening flagged `item.json` files in `$EDITOR` and for the script to generate the commit automatically. The shipped version instead prompts inline per item (simpler, no `$EDITOR` dependency) and deliberately does **not** run `git commit`/`git push` itself — publishing stays an explicit, seller-triggered step via `pnpm push` or the printed manual sequence, consistent with how every other content-mutating script in this project works.

---

### 1.13 Google Analytics (GA4) ✅ Shipped
**Effort:** XS · **Value:** ⭐⭐

Seller pastes a GA4 Measurement ID into `siteConfig.analytics.googleAnalyticsId`;
`<GoogleAnalytics />` (`@next/third-parties/google`) renders in the root
layout only when that field is set. Chosen alongside/over Vercel Analytics
(§1.9) specifically because it has **no hosting dependency** — it works on
GitHub Pages, whereas Vercel Analytics requires Vercel hosting. Editable
from Seller Studio's Config pane (Analytics tab) with inline format
validation (must be empty or start with `G-`).

---

### 1.14 EXIF/GPS Metadata Stripping on Upload ✅ Shipped
**Effort:** XS · **Value:** ⭐⭐⭐

Photos taken on a phone often embed GPS coordinates in EXIF metadata — for a single-seller marketplace where buyers meet the seller in person, an unstripped photo can leak the seller's home address to anyone who inspects the raw file. `pnpm upload-images` re-encodes every new/changed JPEG/PNG/WebP photo via `sharp` (`lib/images/stripMetadata.ts`) before it reaches the CDN, removing all EXIF/IPTC/XMP metadata — including GPS — while auto-rotating so orientation is preserved. GIFs pass through unchanged (no EXIF segment to begin with). The same stripping runs on Seller Studio's "Sync to CDN" path. See `docs/CURRENT_FUNCTIONALITY.md` ("Photo Privacy — EXIF/GPS Stripping").

**Correction (2026-09-05):** the prior revision of this document mistakenly logged this as an unimplemented idea from a 2026-09-04 serverless/backend options exploration. It was already shipped (`50d257e`, 2026-06-11) well before that exploration — the "no backend needed" conclusion was right, but the "not yet built" premise wasn't.

---

### 1.15 Item Flyer PDF Download ✅ Shipped
**Effort:** S · **Value:** ⭐⭐

A "Download Flyer" button on the item detail page (`components/item/FlyerButton.tsx`) generates a printable, single-item PDF (`lib/pdf/generateItemFlyer.ts` / `flyerContent.ts`) with the item's photo, price, and a QR code linking back to the live listing — useful for posting on a physical bulletin board or handing to someone in person.

On the `cloudflare-r2` provider this needs a one-time `pnpm configure-image-cors` run (see `docs/SCRIPTS.md`): the flyer button fetches image bytes cross-origin to embed them in the PDF, unlike the `<img>` tags used everywhere else on the site, so R2's CORS policy has to explicitly allow it.

Found during the 2026-09-05 documentation audit — a real, shipped feature that had no entry anywhere in this roadmap.

---

## Tier 2 — Medium-Term Features
*Meaningful improvements. Each standalone and independently shippable.*

### 2.1 Client-Side Full-Text Search 🎓 👤 ✅ Shipped in v1
**Effort:** M · **Value:** ⭐⭐⭐

`fuse.js` index built at build time from all item names, descriptions, brands, models, and tags. A search input in `SiteHeader` — results appear as the user types.

Already in the Extensibility Register (DESIGN.md §19). Requires no backend. Becomes essential once the collection exceeds ~30 items.

---

### 2.2 Tag Filtering 🎓 👤 ✅ Shipped
**Effort:** M · **Value:** ⭐⭐⭐

`lib/content/loader.ts`'s `loadTagIndex()` builds a slug → items map in a single `loadAllItemsRaw()` pass; a multi-select (AND-matching) tag-chip row was added to `components/filters/FilterBar.tsx`/`useFilters.ts` (same shape as the course-filter chips in §2.15, but multi-select since an item usefully carries several tags at once); and `app/tags/[tag]/page.tsx` is a fully static `generateStaticParams()` route listing every visible item with that tag across categories. Item detail pages link each tag badge to its `/tags/{tag}` page. Two distinct tag spellings that would slugify to the same route (a rare edge case) are both dropped from the index with a build-time warning rather than one silently winning.

Was already in the Extensibility Register.

---

### 2.3 Dark Mode 🎓 ✅ Shipped in v1
**Effort:** M · **Value:** ⭐⭐

`ThemeToggle` button in `SiteHeader` + `next-themes` (class-based), defaulting to the visitor's OS/browser preference and persisting an explicit choice in `localStorage`.

All Aceternity components are dark-mode aware. The seller's chosen background effect automatically adapts. Particularly relevant for the CS student audience who typically prefer dark UI.

---

### 2.4 Seller CLI Tools 🎓 👤 ✅ Shipped
**Effort:** S–M · **Value:** ⭐⭐⭐

Scripts that run on the seller's machine to reduce manual `item.json` editing. CS students will use these as power tools; non-technical users depend on them to avoid ever opening a JSON file.

**Shipped in v1 (template v1.4.2):** `pnpm create-item` / `pnpm new` (scaffold a 36-field `item.json`), `pnpm create-template` (commented `_template.json`), `pnpm mark-sold` (JSONC-surgical status + `sold_date` update), `pnpm upload-images` (CDN sync), `pnpm configure-image-cors` (one-time R2 CORS setup so the item flyer PDF, §1.15, can fetch photo bytes cross-origin), `pnpm fb-export` (§3.4), `pnpm studio` (§3.8), plus template-management tools for downstream sites: `pnpm update-site` (pull a template release without touching `content/`), `pnpm migrate-config` (auto-inject new optional config fields), `pnpm push` (commit + push `content/` and `lib/generated/image-manifest.json`), and `pnpm bump` (interactive version bump + GitHub release).

**Shipped 2026-09-05** (all follow the same pure-logic-in-`scripts/lib/`-plus-thin-CLI-wrapper pattern as `mark-sold.ts`, each with its own unit tests):

| Script | What it does | User |
|---|---|---|
| `pnpm mark-available houseware/ikea-lamp` | Resets `status` to `available` from any prior state, clears `sold_date`; no-ops if already `available` | 🎓 👤 |
| `pnpm duplicate houseware/ikea-lamp houseware/ikea-lamp-2` | Copies folder + photos, resets `status`/`listed_date`/`sold_date`/`price_reduced`/`previous_lowest_price`/`min_acceptable_offer` on the copy, strips `reserved_for` outright (Iron Rule 4 — a private note must never propagate to an unrelated new listing) | 🎓 |
| `pnpm inventory` | Prints a Markdown table of every item (all statuses): name, category, status, lowest resolved price, days listed | 🎓 👤 |
| `pnpm stale-check [--days N]` | Lists `available` items listed for more than N days (default 60) | 🎓 |
| `pnpm audit-listings` | Reports items (excluding sold ones) missing recommended fields: no photos, empty description, no tags, an open-ended shipping tier with no weight/dimensions, or no price tiers at all — criteria documented in the script header | 🎓 |
| `pnpm export-csv` | Exports every item as a flat CSV to `exports/listings.csv` for the seller's own record-keeping (distinct from `pnpm fb-export`'s Facebook-formatted CSV) | 🎓 👤 |
| `pnpm semester-end` | Batch review + cleanup (see §1.12) | 🎓 |

These are Node.js scripts in `scripts/` — no UI, no backend, no framework.

---

### 2.5 "Browse All" Cross-Category Page ✅ Shipped in v1
**Effort:** S · **Value:** ⭐⭐

A `/all` route that displays all non-draft items across every category in one scrollable grid with the full filter + sort bar.

**Implementation note (v0.8.1):** The page uses the single-pass `loadBrowseAllPageData()` (`app/all/page.tsx`), which parses every item once and derives the visible cross-category list from it; the home recently-listed strip comes from `loadHomePageData()` (`app/page.tsx`). `loadAllItems()` is no longer called by any page. The /all page shows `available`, `reserved`/`pending` (with badges), and toggleable `sold` items.

---

### 2.6 Stripe Payment Link Integration ✅ Implemented
**Effort:** S (schema + UI only) · **Value:** ⭐⭐⭐

`stripe_payment_link` is part of the `item.json` schema (`lib/content/schema.ts`), and the item detail page renders a **"Pay Deposit"** button linking to `itemData.stripePaymentLink` (shown alongside a "Pay with Venmo" button when `venmo_payment_request` is set).

No backend. Stripe handles the payment; seller fulfils locally. Removes the friction of buyers having to reach out just to pay.

---

### 2.7 Pickup Scheduling Link ✅ Shipped
**Effort:** XS (schema + UI only) · **Value:** ⭐⭐

`siteConfig.contact.schedulingUrl` (optional, site-level — not per-item) shows a "Schedule Viewing" button on item detail pages that opens the external scheduling link (Calendly, Cal.com, Google Calendar appointment page) in a new tab, following the same conditional-render pattern as the existing Stripe/Venmo payment buttons.

No backend. Eliminates back-and-forth messages to agree on a viewing time.

---

### 2.8 "Make an Offer" Flow 🎓 👤 ✅ Shipped in v1
**Effort:** S · **Value:** ⭐⭐

When `price.negotiable: true` **and** `min_acceptable_offer` is set, show a "Make an Offer" button on the item detail page (this document previously said "Send Offer" and only mentioned the `negotiable` flag — the actual label and gate are as stated here). A small inline form asks for the buyer's offer amount, then opens the configured contact platform with a pre-filled message: `"I'd like to offer $X for {item.name}."`.

No backend required — the form just constructs a deep-link message.

---

### 2.9 Recently Viewed Items ✅ Shipped in v1
**Effort:** S · **Value:** ⭐⭐

Store the last 5 viewed item slugs in `sessionStorage`. Display a "Recently Viewed" row at the bottom of the home page and item detail pages. Zero server changes; one client component.

---

### 2.10 Photo Quality Warnings ✅ Shipped in v1
**Effort:** XS · **Value:** ⭐⭐

During `pnpm upload-images`, warn (not block) if:
- Any image is < 800px wide (may appear blurry)
- Any image is > 8 MB (unnecessarily large; slow to load)
- An item folder has images but none named `cover.*`
- An item folder has no images at all

Advisory warnings only. Never blocks the upload or build.

---

### 2.11 Sitemap ✅ Shipped in v1
**Effort:** XS · **Value:** ⭐⭐⭐

`next-sitemap` generates `sitemap.xml` and `robots.txt` as a `postbuild` step. All static routes are already known at build time. Improves search engine crawlability significantly.

Already in the Extensibility Register.

---

### 2.12 Sold Items Archive Page ✅ Shipped in v1
**Effort:** S · **Value:** ⭐⭐

A `/sold` route listing all items with `status: "sold"`, regardless of retention. Acts as a "gallery of past sales" — provides social proof and helps buyers gauge typical pricing. Items shown with "SOLD" badge and no price prominence. The rendered grid is capped at `siteConfig.soldArchiveDisplayLimit`; the header still shows the full sold-item count.

---

### 2.13 Twitter/X + Pinterest Rich Cards ✅ Shipped in v1
**Effort:** XS · **Value:** ⭐⭐

- **Twitter card:** `twitter:card: "summary_large_image"` using item cover image → item previews look professional when shared on Twitter/X
- **Pinterest rich pin:** `product:price:amount` + `product:price:currency` meta tags (with `og:type` staying `"website"`) → shared items show price on Pinterest cards

Zero new data. Pure meta tag additions.

---

### 2.14 Distance Unit Toggle (mi ↔ km)
**Effort:** S · **Value:** ⭐⭐

Add `distanceUnit: "mi" | "km"` to site config. `useDistancePricing` converts before display. All `miles_min` / `miles_max` fields remain in miles internally; conversion is display-only.

Already in the Extensibility Register.

---

### 2.15 Textbook-Specific Fields & Category 🎓 ✅ Shipped in v1
**Effort:** S · **Value:** ⭐⭐⭐

CS students sell many textbooks. First-class textbook support makes the site significantly more useful for this user segment.

**Schema additions** (already proposed in 1.11): `isbn`, `course`, `edition`, `semester_listed`

**UI additions:**
- On item detail pages where `isbn` is present, show a "Compare prices" button linking to `https://bookfinder.com/search/?isbn={isbn}` — ✅ shipped (`TextbookBadge.tsx`)
- Show `course` prominently as a badge (e.g. "For CS101") — ✅ shipped
- Filter on category page by `course` code — ✅ **shipped 2026-09-05.** Single-select course chips in `FilterBar`/`useFilters.ts`, rendered only when the current category has items with a non-empty `course` field (same conditional-render pattern as the condition chips). Single-select because a textbook belongs to exactly one course, unlike tags (§2.2), which are multi-select.

**Implementation:** Additive — all new schema fields optional, all new UI conditional on field presence.

---

### 2.16 Non-Technical User Setup Guide 👤 ✅ Shipped in v1
**Effort:** S · **Value:** ⭐⭐⭐

A clear, illustrated `SETUP_GUIDE.md` written for the non-CS user who had the project set up by a friend. Its core sections cover the `content/` folder and explain:
1. How to add a new item (create folder → add item.json → add photos → run `pnpm upload-images`)
2. How to mark an item sold (`pnpm mark-sold category/item-name`)
3. How to change prices (edit the `amount` field in `item.json`)
4. How to take and name a good cover photo
5. What to do when something goes wrong (who to call for technical help)

**Correction (2026-09-05):** this document previously claimed the guide is "only `content/` operations" with "zero code/terminal jargon" throughout — that's true of the core sections above, but the guide also documents optional setup for site settings (`/setup`), Seller Studio (`pnpm studio`), the shipping Worker (`/setup-shipping`, a Cloudflare Worker deploy), and Facebook export (`pnpm fb-export`), all of which do involve running terminal or slash commands. Assumes the CS student friend handles any git issues.

---

## Tier 3 — Larger Features
*Meaningful scope. Each requires careful architectural planning.*

> **Backend architecture options (2026-09-04 exploration).** Several items below (and in Tier 4) call for some kind of serverless function or self-hosted service. They are not one project — each has a different justification and a different cost:
>
> | Category | Covers | Needs persistent storage? | Fits current architecture? |
> |---|---|---|---|
> | **Notification relay** | §3.1 Contact Form / Enquiry — forward a buyer's message or offer to the seller (email, Discord, Telegram) | No — stateless relay | ✅ Built 2026-09-05 — `workers/contact-form-proxy/`, same shape as `workers/shipping-rate-proxy/` |
> | **Local pre-upload hardening** | Stripping EXIF/GPS metadata from photos (§1.14) | No | ✅ Yes — and turned out to already be shipped as a `pnpm upload-images` step; no server was ever needed |
> | **Stateful engagement features** | §3.2 Item View Counter, §4.2 Real-Time Inventory Updates, §4.4 Buyer Reservation System | **Yes** — Cloudflare KV/D1 or similar | ⚠️ These are the only items that actually break the project's "zero database" principle. Each is its own sub-project with its own cost; a decision to accept persistent state should be made deliberately once, before starting any of the three — not implicitly by shipping the first one |
> | **AI workflow hosting** | Running `/update-items` / `/translate-items` as a hosted function instead of a local Claude Code session | No | ❌ Not recommended today — Seller Studio plus the local skills already cover this well; only worth revisiting if a future seller can't or won't run Claude Code locally |
>
> This was the strongest backend candidate identified in the exploration — it reused the already-proven Worker-proxy pattern, needed no persistent storage, and closed a real gap (the seller previously got zero in-app notification when a buyer contacted them or made an offer). It's now built — see §3.1 below.

### 3.1 Contact Form / Enquiry System 👤 ✅ Shipped
**Effort:** L · **Value:** ⭐⭐⭐

`workers/contact-form-proxy/` — a Cloudflare Worker matching `workers/shipping-rate-proxy/`'s architecture exactly (stateless relay, secrets via `wrangler secret`, `ALLOWED_ORIGIN`-restricted CORS, no persistent storage, no rate limiting/CAPTCHA — see "Not implemented" in its README for why and what a spammed seller could add later at the Cloudflare-dashboard level instead). A new `EnquiryForm.tsx` on the item detail page POSTs `{ itemCategory, itemSlug, itemName, buyerName, buyerContact, message, offerAmount?, honeypot }` to it; the Worker relays a formatted notification via a pluggable `NOTIFICATION_PROVIDER` (`"discord" | "telegram" | "email"`, mirroring `SHIPPING_PROVIDER`'s pattern), each behind its own secrets.

**Anti-spam:** an off-screen (not `display:none`, which some bots specifically detect and skip) honeypot field. A filled honeypot gets the exact same `200 {ok:true}` response as a real submission — a bot that gets a different response for "honeypot filled" vs. "field missing" could learn which check tripped.

**Config:** `siteConfig.notifications?: { enabled: boolean; proxyUrl: string }` — optional, disabled by default, registered in `scripts/lib/configDefaults.ts` per Iron Rule 8. Seller-facing setup walkthrough at `.claude/commands/setup-contact-form.md` (mirrors `/setup-shipping`).

**Correction (2026-09-05):** the previous revision of this section claimed "the `ContactSection` component already has a reserved slot for this." That wasn't true — `ContactSection.tsx` had no placeholder or extension point of any kind. `EnquiryForm` was added as a sibling alongside it on the item detail page instead.

---

### 3.2 Item View Counter
**Effort:** M · **Value:** ⭐⭐

A lightweight view counter per item using a privacy-friendly analytics service (GoatCounter — free, open source, self-hostable). One `<script>` tag + display component.

Enables a future "Most Viewed" section on the home page as a complement to "Recently Listed."

---

### 3.3 Offline Caching (PWA Service Worker)
**Effort:** M · **Value:** ⭐⭐

A service worker that caches recently visited item pages and images. Allows buyers to view previously visited items without connectivity — useful at garage sales or markets where signal is poor.

Builds on the PWA manifest (Tier 1.10).

---

### 3.4 Cross-Listing Export Templates — Facebook Marketplace ✅ Implemented
**Effort:** M · **Value:** ⭐⭐

`pnpm fb-export` interactively exports available / pending / reserved items as a Facebook Marketplace bulk-upload CSV. Guided UI:

0. **Export history** *(runs 2+ only)* — skip already-exported items, view previous runs, or export everything (see Smart Export History below)
1. **Item selection** — all items, a single category, or a manually picked subset (comma list or `1-4` range notation)
2. **Price tier** — a 5-option menu: `[1]` lowest price across all tiers (default; recommended), `[2]` highest price across all tiers, `[3]` average of lowest and highest, `[4]` local pickup price (miles-limited tiers only), `[5]` shipping price (open-ended tiers only). Options 4 and 5 are shown only when such tiers exist in the selection; items with no matching tier fall back to lowest / highest. (Corrected 2026-09-05 — this previously described only 4 options, missing the "average" choice in `scripts/export-facebook.ts`.)

CSV writing and photo-folder copying then happen automatically (there is no interactive "Output" step): writes `exports/facebook-marketplace.csv` (numbered `facebook-marketplace-<N>.csv` files if > 50 items — FB's per-upload limit) and copies local photos to `exports/facebook-marketplace-photos/NNN_category-item/` (row-numbered) for manual upload. Before exporting, the CLI warns about items without CDN photos and suggests running `pnpm upload-images` first.

**Smart category mapping** (`scripts/lib/fbCategoryMap.ts`): 40+ keyword rules (49 at present) match item tags, name, brand, and model to FB's `"Top Level//Sub Level//Leaf Level"` category format. Covers GPU/CPU/RAM, textbooks, furniture, audio, phones, gaming, clothing, and more. Falls back to the category slug when no rule matches (FB will prompt the seller to choose manually).

**Field mapping:**

| item.json field | FB CSV column | Notes |
|---|---|---|
| `name` (+ brand/model prefix) | TITLE | Truncated to 150 chars; brand/model prepended only if not already in name |
| lowest/highest `price.tiers[].amount` | PRICE | Rounded to nearest dollar; tier chosen interactively |
| `condition` | CONDITION | `good→"Used - Good"`, `like-new→"Used - Like New"`, `new→"New"`, `fair/for-parts→"Used - Fair"` |
| `description` + meta block | DESCRIPTION | Appends brand, model, color, age, original price, tags, ISBN, edition as `[key: value]` footer; truncated to 5000 chars |
| keyword rules | CATEGORY | Auto-detected from corpus |
| CDN image URLs | PHOTO 1…PHOTO 10 | Up to 10 columns filled with CDN (`https://`) URLs; local `/items/` paths are skipped — items without CDN photos are flagged with a reminder to run `pnpm upload-images` |
| `weight` (converted to lb) | SHIPPING WEIGHT | Only when a shipping tier (no `miles_max`) is present |
| has shipping tier AND `price.shipping_payer === "seller"` | OFFER FREE SHIPPING | Yes/No |
| has open-ended tier | OFFER SHIPPING | Yes/No |

**Smart Export History** (`scripts/lib/exportHistory.ts`): On the second run, Step 0 asks whether to skip items already exported in a previous session. History is keyed by `{categorySlug}/{itemSlug}` (stable filesystem identity), stored in `exports/.export-history.json` (gitignored). Each run appends an `ExportRun` entry recording the timestamp, price strategy, item count, CSV file paths, and per-item slug + name + price. This lets the seller re-export only newly available items without duplicating existing FB listings.

**Remaining platforms** (Craigslist, OfferUp, eBay) remain roadmap items for a future iteration.

---

### 3.5 "Bundle Deal" Multi-Item Contact
**Effort:** M · **Value:** ⭐⭐

Add `bundle_with` to `item.json` as a v2 schema addition (it is **not** part of the v1 schema). The item detail page shows a "Bundle available with {item X}" section listing the linked items with a combined total price. A "Contact about bundle" button pre-fills the contact message with all included items and the total.

---

### 3.6 Price Drop Tracking (history log)
**Effort:** M · **Value:** ⭐⭐

**Schema + UI already shipped in v1:** `price_reduced` and `previous_lowest_price` are v1 `item.json` fields (DESIGN.md §5); the "Price Reduced" chip and struck-through previous price already render on item cards and the detail page (DESIGN.md §10.3). **Only the price-history *log* below is a future (v2) addition** — the price-signal display is done.

`pnpm price-history` could maintain a local `price-history.json` per item tracking all price changes over time — useful for the seller to see how long items took to sell at various price points.

---

### 3.7 i18n — Multi-Language Support ✅ Shipped in v1
**Effort:** L · **Value:** ⭐⭐

Add language variants of text fields to `item.json` (`name_zh`, `description_zh`) plus `i18n.defaultLocale` / `i18n.availableLocales` config keys. Single-instance multi-locale: all locale variants ship in one deployment; the visitor switches language at runtime via the `LocaleSwitcher` in the header (selection persisted in `localStorage`; SSG HTML renders `defaultLocale`). Fields with no translation fall back to English automatically. The `/translate-items` AI skill batch-fills translations.

Already in the Extensibility Register.

---

### 3.8 Seller Studio (`pnpm studio`) 👤 ✅ Implemented
**Effort:** L · **Value:** ⭐⭐⭐

**This is the main accessibility feature for the non-CS user segment.** A local-only browser UI launched with `pnpm studio` (default port 5174, overridable with `--port <1024–65535>`) that lets the seller manage items visually — without editing JSON files directly. It ships to downstream sites via `pnpm update-site`, and all three implementation parts are complete: **Phase 18a** (item table + bulk status), **Phase 18b** (photos + CDN sync), **Phase 18c** (edit form + item creation + git publish).

**Architecture:** A Vite SPA in `studio/` started by `tsx scripts/studio.ts`, bound to **127.0.0.1 only** (never deployed). Unlike the original plan, it **does** have a backend: the `studioApiPlugin` middleware in `studio/vite.config.ts` routes all `/api/*` requests to the framework-agnostic handler in `scripts/lib/studioApi.ts` (Zod-validated, slug allowlist + path containment against `content/items/`). A CSRF guard (`studio/csrfGuard.ts`) requires `Content-Type: application/json` and a matching `Origin` on all non-GET/HEAD requests.

**Shipped features:**

- **Item table** — every item with thumbnails, lowest-tier price and currency; per-item load errors isolated; full server re-read after every write
- **Bulk status** — mark available / reserved / pending / sold / draft over a selection, with per-item failure reporting and an animated "sold" stamp
- **Image pane** — drag-and-drop upload (magic-byte content sniffing: jpg/png/webp/gif), drag-to-reorder, delete
- **CDN sync** — uploads new/changed photos to the configured CDN with Server-Sent-Events progress; a one-at-a-time mutex prevents concurrent runs; publishing is refused while a sync runs
- **Edit form** — schema-driven grouped fields; sends changed fields only; comment-preserving JSONC writes so seller formatting and `// options:` comments survive (`reserved_for` is never read or written)
- **Item-creation dialog** — category picker + kebab-case name, scaffolded from the 36-field template
- **Git publish pane** — uncommitted-change count, commit-message input, and push. Stages **only** `content/` and `lib/generated/image-manifest.json` (never `git add -A`, so `.env.local` with CDN credentials can never ride along), mirroring `pnpm push`
- **PDF catalog export** — `ExportPdfDialog` generates a multi-page PDF catalog of the current listing set: cover page, table of contents, per-category pricing summaries, and a per-item QR code linking to that item's contact info (`scripts/lib/pdfCatalog/`). Not previously documented anywhere in this roadmap — added during the 2026-09-05 audit. Distinct from the single-item flyer download in §1.15.

The non-technical user's workflow is entirely GUI-driven: `pnpm studio` (the one terminal command), then fill in forms, drag photos, click Sync and Publish. No JSON, no git commands visible to them.

---

## Tier 4 — Major Architecture Changes
*Would require significant redesign. Evaluate carefully before committing.*

### 4.1 Multi-Seller Support
**Effort:** XL · **Value:** ⭐⭐⭐ (if market justifies it)

Each seller has their own `content/` folder, separate `config.ts`, and possibly a separate subdomain. Requires:
- Authentication (seller login)
- Namespaced content directories
- Shared build infrastructure
- Per-seller image storage buckets

**Architecture decision needed before implementation:** This fundamentally changes the data model and deployment strategy. If multi-seller is in scope, the `content/` structure, loader functions, and routing all need to be redesigned from the start.

---

### 4.2 Real-Time Inventory Updates
**Effort:** XL · **Value:** ⭐⭐

Status changes (available → sold) reflected on the live site without a full rebuild. Requires a real-time data layer (Vercel KV + Server-Sent Events, or Supabase Realtime).

For a personal garage sale site this is low priority; re-triggering a Vercel build takes ~30 seconds and is simpler.

---

### 4.3 Shipping Calculator Integration ✅ Implemented (Optional)
**Effort:** L · **Value:** ⭐⭐

For items with a "Shipping" price tier: integrates Shippo/EasyPost APIs to calculate actual shipping cost based on buyer ZIP code, item dimensions, and weight, replacing the fixed "Shipping: $tier" amount with a live estimate.

Implemented as a fully optional, opt-in feature (`siteConfig.shipping.enabled`), with a configurable shipping payer (seller or buyer, site-wide default + per-item override via `price.shipping_payer`). API keys are proxied through an independently-deployed Cloudflare Worker (`workers/shipping-rate-proxy/`) so they never reach the browser bundle. See [DESIGN.md §21](DESIGN.md) for the full design and `.claude/commands/setup-shipping.md` for the seller setup walkthrough.

**Gating specifics:** the estimator renders only when `siteConfig.shipping` is enabled, the item has weight + dimensions, and the resolved price tier is the open-ended shipping tier. The Worker returns the cheapest rate (`{amount, currency, carrier, service, estimatedDays}`), converting units for the carrier API as needed (kg→lb/oz, cm→in).

---

### 4.4 Buyer Reservation System
**Effort:** L · **Value:** ⭐⭐

Automated `status` management: when a buyer completes a contact/deposit flow, the item automatically transitions to `pending`. When the sale completes, it transitions to `sold`. Currently all status changes are manual `item.json` edits.

Requires a serverless backend and persistent state (KV store).

---

## Schema Fields to Add in Phase 3 (Pre-emptive)

These fields are free to add during initial schema implementation (Phase 3). Retrofitting them later means editing every existing `item.json`.

```jsonc
// These fields are included in the v1 item.json schema (DESIGN.md §5).
// Add them during Phase 3 (Content Schema) — retrofitting costs editing every existing item.json.
// All optional, all gracefully defaulted.

"stripe_payment_link": "",          // Stripe Payment Link for instant deposit
"pickup_windows": [],               // ["Weekday evenings", "Saturdays 10am–2pm"]
"no_lowball": false,                // "Firm Price" badge
"price_reduced": false,             // "Price Reduced" chip
"previous_lowest_price": null,      // for price-drop display
"youtube_link": "",                 // demo video URL
```

> **`scheduling_url` is NOT a v1 field.** It is listed as a v1.1 feature in §2.7 and the priority table. Do not add it to the Phase 3 schema.

---

## Feature × Priority Summary — Post-v1 Roadmap Only

Features shipped in v1 have been moved to the "Shipped in v1" section at the top of this document.

🎓 = primarily serves CS student · 👤 = primarily serves non-CS user · 🎓👤 = both

| Feature | Users | Status |
|---|---|---|
| PWA manifest (installable) | 🎓👤 | ✅ Implemented |
| EXIF/GPS metadata stripping (`pnpm upload-images`) | 🎓👤 | ✅ Implemented |
| Semester-end batch actions (`pnpm semester-end`) | 🎓 | ✅ Implemented |
| Pickup scheduling link (Calendly/Cal.com field) | 🎓👤 | ✅ Implemented |
| Tag filter page (`/tags/{tag}`) | 🎓👤 | ✅ Implemented |
| Seller CLI toolkit (mark-available/duplicate/inventory/stale-check/audit-listings/export-csv) | 🎓👤 | ✅ Implemented |
| Distance unit toggle (mi ↔ km) | 🎓 | v1.1 |
| Stripe payment link button ("Pay Deposit") | 🎓👤 | ✅ Implemented |
| Item flyer PDF download (`FlyerButton`, §1.15) | 🎓👤 | ✅ Implemented |
| Facebook Marketplace export (`pnpm fb-export`) | 🎓 | ✅ Implemented |
| Cross-listing export (Craigslist / OfferUp / eBay) | 🎓 | v2 |
| Bundle deal multi-item contact | 🎓👤 | v2 |
| Contact form (Cloudflare Worker relay, hides contact info) | 👤 | ✅ Implemented |
| Item view counter (GoatCounter) | 🎓 | v2 |
| Offline caching (PWA service worker) | 🎓👤 | v2 |
| Price drop tracking (history log) | 🎓👤 | v2 |
| Vercel Analytics + Speed Insights | 🎓 | v2 (deps installed but unwired; needs Vercel hosting) |
| Google Analytics (GA4) | 🎓👤 | ✅ Implemented |
| **Seller Studio (`pnpm studio`)** | 👤 | ✅ Implemented |
| Multi-seller support | 👤 | v3 / architecture redesign required |
| Real-time inventory without rebuild | 👤 | v3 |
| Buyer reservation system | 👤 | v3 |
