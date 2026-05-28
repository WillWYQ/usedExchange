# UsedExchange — Features Roadmap

**Date:** 2026-05-27  
**Scope:** Features beyond v1. Not committed — prioritised for planning discussions.

---

## ✅ Shipped in v1

The following features were initially on the roadmap and have been moved into the v1 build:

| Feature | Notes |
|---|---|
| Discord contact platform 🎓 | Full support: DM link or server invite |
| Pre-filled contact messages 🎓👤 | WhatsApp, email, Venmo pre-filled with item name + price |
| Native share + copy link 🎓👤 | `navigator.share()` + clipboard fallback |
| Sort options on category page 🎓👤 | Price (lo/hi), date listed, condition |
| "Listed X days ago" freshness 🎓👤 | Derived from `listed_date` |
| Condition guide tooltip 👤 | `?` icon explains each condition enum |
| JSON-LD structured data (Product schema) 🎓👤 | Rich snippets + BreadcrumbList |
| Quantity indicator 🎓👤 | "3 available" badge when `quantity > 1` |
| Vercel Analytics + Speed Insights 🎓 | Free on Hobby; enabled via config |
| Schema additions 🎓 | stripe_payment_link, pickup_windows, no_lowball, bundle_with, price_reduced, youtube_link, isbn, course, edition, semester_listed, name_zh, description_zh, venmo_payment_request, min_acceptable_offer |
| Client-side full-text search 🎓👤 | fuse.js; build-time index; search bar in header |
| Auto dark mode (system setting) 🎓 | Tailwind `darkMode: "media"` — no toggle needed |
| Seller CLI tools 🎓👤 | `pnpm create-item`, `pnpm create-template`, `pnpm new`, `pnpm mark-sold` |
| "Browse All" cross-category page 🎓👤 | `/all` route with full filter + sort |
| "Make an Offer" flow 🎓👤 | Inline form + pre-filled contact message; `min_acceptable_offer` gate |
| Recently viewed items 🎓👤 | `sessionStorage`-based strip on home + detail pages |
| Photo quality warnings 🎓 | Advisory during `pnpm upload-images` |
| Sitemap 🎓👤 | `next-sitemap`; runs in `postbuild` |
| Sold items archive page 🎓👤 | `/sold` route; all sold items regardless of retention |
| Twitter/X + Pinterest rich cards 🎓👤 | `twitter:card: "summary_large_image"` + `og:type: "product"` |
| Textbook-specific fields & category 🎓 | isbn, course, edition, semester_listed; Compare prices link |
| Non-technical user setup guide 👤 | `SETUP_GUIDE.md` in plain English; only `content/` operations |
| i18n — multi-language support 🎓👤 | Single-locale per deployment; `name_zh`/`description_zh` pattern; `siteConfig.i18n.strings` |
| Venmo + Zelle payment (QR or link) 🎓👤 | Venmo: link-based or QR; Zelle: QR-only |

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
*Low effort, immediately actionable. Many can be added during Phase 12 (hardening) or Phase 10 (contact).*

### 1.1 Discord Contact Platform 🎓
**Effort:** XS · **Value:** ⭐⭐⭐

Discord is the dominant communication platform for CS students — it's where campus communities, club servers, and class Discord channels live. It is already the most common place CS students would share or discover a listing.

- Direct message link: `https://discord.com/users/{user-id}` (17–19 digits; typically 18)
- Server invite link: `https://discord.gg/{invite-code}` (for sellers who post listings in a trade server)
- Value field accepts either format; `constructUrl` auto-detects via `/^\d{17,19}$/` — all digits = user ID, otherwise = invite code

**This is a v1 feature for the primary user** — Discord should ship in the initial contact platform set alongside email and Instagram.

---

### 1.2 Pre-filled Contact Messages 🎓 👤
**Effort:** XS · **Value:** ⭐⭐⭐

When a visitor clicks a contact platform button, the outreach message is pre-filled with the item name and price — removing the friction of composing a message from scratch.

- WhatsApp: `https://wa.me/{number}?text=Hi, I'm interested in your {item.name} priced at {price}. Is it still available?`
- Email: `mailto:{address}?subject=Inquiry: {item.name}&body=Hi, I'm interested in your {item.name}...`
- Applies to any platform that supports deep-link pre-fill

**Implementation:** Extend `PlatformButton` to accept optional `item` props; construct the pre-filled URL in `ContactSection`.

---

### 1.3 Native Share + Copy Link
**Effort:** XS · **Value:** ⭐⭐⭐

A "Share" button on item detail pages.
- Mobile: invokes `navigator.share({ title, text, url })` — opens the OS share sheet
- Desktop: falls back to `navigator.clipboard.writeText(window.location.href)` with a "Copied!" toast
- Enables buyers to forward listings to friends via any app

**Implementation:** One new client component `ShareButton.tsx`.

---

### 1.4 Sort Options on Category Page
**Effort:** XS · **Value:** ⭐⭐⭐

Sort the item grid by:
- Price low → high / high → low (on resolved distance price)
- Date listed (newest first — already the default)
- Condition (new first)

Client-side only, no rebuild. A dropdown in the filter bar.

---

### 1.5 "Listed X days ago" Freshness Indicator
**Effort:** XS · **Value:** ⭐⭐

Show how long an item has been listed on the item card and detail page. Derived from `listed_date`.  
Examples: "Listed today" · "Listed 3 days ago" · "Listed 2 weeks ago"

Adds urgency and transparency without any schema changes.

---

### 1.6 Condition Guide Tooltip 👤
**Effort:** XS · **Value:** ⭐⭐

A `?` icon next to the condition badge that opens a small tooltip or modal explaining what each condition value means:
- **New** — never used, original packaging
- **Like New** — used once or twice, no visible wear
- **Good** — normal use, minor cosmetic imperfections
- **Fair** — visible wear, fully functional
- **For Parts** — not fully functional, sold as-is

Reduces buyer uncertainty. One shared `ConditionGuide` component.

---

### 1.7 JSON-LD Structured Data (Product Schema)
**Effort:** S · **Value:** ⭐⭐⭐

Embed `<script type="application/ld+json">` on item detail pages with `@type: "Product"`. Google uses this to show rich snippets in search results (price, availability, rating slot).

Fields available from existing data: `name`, `description`, `image`, `offers.price`, `offers.availability`, `brand`, `color`.

**Also add:** `BreadcrumbList` JSON-LD on category and item pages for breadcrumb rich snippets.

**Implementation:** Two server-side utility functions called in `generateMetadata`. Zero new data required.

---

### 1.8 Quantity Indicator
**Effort:** XS · **Value:** ⭐⭐

The `quantity` field exists in `item.json` but is never displayed. Show "3 available" on item cards and detail pages when `quantity > 1`. Adds urgency for bulk listings.

---

### 1.9 Vercel Analytics + Speed Insights
**Effort:** XS · **Value:** ⭐⭐

One script component in `app/layout.tsx`. Free on Vercel Hobby. Shows:
- Page views and most visited items
- Traffic sources
- Core Web Vitals per page

No backend required. Privacy-friendly by default.

---

### 1.10 PWA Web App Manifest
**Effort:** XS · **Value:** ⭐⭐

A `public/manifest.json` file makes the site installable as a home screen app on iPhone and Android. Includes:
- App name and short name
- Theme colour (matches site branding)
- Icon set (192×192 and 512×512)
- `display: "standalone"` for full-screen feel

No service worker needed for v1 — manifest alone enables installation.

---

### 1.11 Schema Additions for Free (add in Phase 3) 🎓 👤
**Effort:** XS · **Value:** ⭐⭐⭐

These fields cost nothing to add to `item.json` schema during Phase 3 (Content Schema). Retrofitting them later requires updating all existing `item.json` files.

```jsonc
"stripe_payment_link": "",    // Stripe Payment Link URL → "Buy Now (pay deposit)" button
"pickup_windows": [],         // ["Weekday evenings", "Saturdays 10am–2pm"]
"no_lowball": false,          // shows "Firm Price" badge alongside price
"bundle_with": [],            // item slugs this item can be sold with
"price_reduced": false,       // shows "Price Reduced" chip on card
"youtube_link": "",           // demo video URL (useful for electronics, appliances)

// 🎓 CS Student-specific additions:
"isbn": "",                   // textbook ISBN (enables lookup link to compare prices)
"course": "",                 // e.g. "CS101", "MATH230" — searchable, shown on textbook detail page
"edition": "",                // e.g. "3rd edition"
"semester_listed": ""         // e.g. "Spring 2026" — helps buyers know if textbook is current edition
```

All optional, all gracefully defaulted to empty/false.

---

### 1.12 Semester-End Batch Actions 🎓
**Effort:** S · **Value:** ⭐⭐⭐

CS students do most of their selling at the end of each semester. A single command to prepare for a sell-off:

```bash
pnpm semester-end
```

This script:
1. Prints all `available` items that have been listed for > 60 days (likely stale listings)
2. Prompts: "Mark these as sold, reduce price, or leave as-is?"
3. Opens all `item.json` files flagged for editing simultaneously (using `$EDITOR`)
4. Runs `pnpm upload-images` and generates the git commit message: `"chore: end-of-semester listing cleanup"`

A single command handles the entire end-of-semester workflow in under 5 minutes.

---

## Tier 2 — Medium-Term Features
*Meaningful improvements. Each standalone and independently shippable.*

### 2.1 Client-Side Full-Text Search 🎓 👤 ✅ Shipped in v1
**Effort:** M · **Value:** ⭐⭐⭐

`fuse.js` index built at build time from all item names, descriptions, brands, models, and tags. A search input in `SiteHeader` — results appear as the user types.

Already in the Extensibility Register (DESIGN.md §19). Requires no backend. Becomes essential once the collection exceeds ~30 items.

---

### 2.2 Tag Filtering 🎓 👤
**Effort:** M · **Value:** ⭐⭐⭐

Tags already exist on every item. Build a tag index at load time. Add a tag filter to the category page filter bar and a `/tags/{tag}` route listing all items with that tag across categories.

Already in the Extensibility Register.

---

### 2.3 Dark Mode 🎓
**Effort:** M · **Value:** ⭐⭐

`tailwind darkMode: 'class'` + a toggle button in `SiteHeader` + system preference detection on first load.

All Aceternity components are dark-mode aware. The seller's chosen background effect automatically adapts. Particularly relevant for the CS student audience who typically prefer dark UI.

Already in the Extensibility Register.

---

### 2.4 Seller CLI Tools 🎓 👤
**Effort:** S–M · **Value:** ⭐⭐⭐

Scripts that run on the seller's machine to reduce manual `item.json` editing. CS students will use these as power tools; non-technical users depend on them to avoid ever opening a JSON file.

| Script | What it does | User |
|---|---|---|
| `pnpm mark-sold houseware/ikea-lamp` | Sets `status: "sold"` and `sold_date: today` — **shipped in v1** (required by SETUP_GUIDE.md) | 🎓 👤 |
| `pnpm mark-available houseware/ikea-lamp` | Resets status to `available` | 🎓 👤 |
| `pnpm duplicate houseware/ikea-lamp houseware/ikea-lamp-2` | Copies folder + item.json, sets copy to `draft` | 🎓 |
| `pnpm inventory` | Prints a Markdown table of all items: name, status, price, days listed | 🎓 👤 |
| `pnpm stale-check` | Lists items that have been `available` for > N days | 🎓 |
| `pnpm audit-listings` | Reports items missing recommended fields | 🎓 |
| `pnpm export-csv` | Exports all items as a CSV for record-keeping | 🎓 👤 |
| `pnpm semester-end` | Batch review + cleanup (see 1.11) | 🎓 |

These are Node.js scripts in `scripts/` — no UI, no backend, no framework.

---

### 2.5 "Browse All" Cross-Category Page ✅ Shipped in v1
**Effort:** S · **Value:** ⭐⭐

A `/all` route that displays all non-draft items across every category in one scrollable grid with the full filter + sort bar.

**Implementation note (v0.8.0):** The page aggregates `loadItemsByCategory()` across all categories — the same data set as individual category pages. `loadAllItems()` is used only for the home recently-listed strip (available-only, count-limited). The /all page shows `available`, `reserved`/`pending` (with badges), and toggleable `sold` items.

---

### 2.6 Stripe Payment Link Integration
**Effort:** S (schema + UI only) · **Value:** ⭐⭐⭐

Add `stripe_payment_link` to `item.json` (already proposed as a schema addition in Tier 1). Show a "Pay Deposit" or "Buy Now" button on the item detail page that opens the Stripe Payment Link.

No backend. Stripe handles the payment; seller fulfils locally. Removes the friction of buyers having to reach out just to pay.

---

### 2.7 Pickup Scheduling Link
**Effort:** XS (schema + UI only) · **Value:** ⭐⭐

Add `scheduling_url` to site config or per-item `item.json`. A "Schedule Viewing" button on item detail pages opens the external scheduling link (Calendly, Cal.com, Google Calendar appointment page).

No backend. Eliminates back-and-forth messages to agree on a viewing time.

---

### 2.8 "Make an Offer" Flow 🎓 👤 ✅ Shipped in v1
**Effort:** S · **Value:** ⭐⭐

When `price.negotiable: true`, show a "Send Offer" button on the item detail page. A small inline form asks for the buyer's offer amount, then opens the configured contact platform with a pre-filled message: `"I'd like to offer $X for {item.name}."`.

No backend required — the form just constructs a deep-link message.

---

### 2.9 Recently Viewed Items ✅ Shipped in v1
**Effort:** S · **Value:** ⭐⭐

Store the last 5 viewed item slugs in `sessionStorage`. Display a "Recently Viewed" row at the bottom of category and item detail pages. Zero server changes; one client component.

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

A `/sold` route listing all items with `status: "sold"`, regardless of retention. Acts as a "gallery of past sales" — provides social proof and helps buyers gauge typical pricing. Items shown with "SOLD" badge and no price prominence.

---

### 2.13 Twitter/X + Pinterest Rich Cards ✅ Shipped in v1
**Effort:** XS · **Value:** ⭐⭐

- **Twitter card:** `twitter:card: "summary_large_image"` using item cover image → item previews look professional when shared on Twitter/X
- **Pinterest rich pin:** `og:type: "product"` with price meta → shared items show price on Pinterest cards

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

**Schema additions** (already proposed in 1.10): `isbn`, `course`, `edition`, `semester_listed`

**UI additions:**
- On item detail pages where `isbn` is present, show a "Compare prices" button linking to `https://bookfinder.com/search/?isbn={isbn}`
- Show `course` prominently as a badge (e.g. "For CS101") — buyers search by course, not item name
- Filter on category page: filter by `course` code when any items have that field

**Implementation:** Additive — all new schema fields optional, all new UI conditional on field presence.

---

### 2.16 Non-Technical User Setup Guide 👤 ✅ Shipped in v1
**Effort:** S · **Value:** ⭐⭐⭐

A clear, illustrated `SETUP_GUIDE.md` written for the non-CS user who had the project set up by a friend. It covers only the `content/` folder and explains:
1. How to add a new item (create folder → add item.json → add photos → run `pnpm upload-images`)
2. How to mark an item sold (`pnpm mark-sold category/item-name`)
3. How to change prices (edit the `amount` field in `item.json`)
4. How to take and name a good cover photo
5. What to do when something goes wrong (who to call for technical help)

Written with zero code/terminal jargon. Assumes the CS student friend handles any git or Vercel issues.

---

## Tier 3 — Larger Features
*Meaningful scope. Each requires careful architectural planning.*

### 3.1 Contact Form / Enquiry System 👤
**Effort:** L · **Value:** ⭐⭐⭐

A serverless function (Vercel Function) that accepts a buyer's name, message, and item reference, then emails or notifies the seller. Eliminates the need to expose any contact details publicly.

**Architecture notes:**
- The `ContactSection` component already has a reserved slot for this
- Email delivery: Resend or SendGrid (both have generous free tiers)
- Rate limiting required to prevent spam
- CAPTCHA or honeypot field recommended

---

### 3.2 Item View Counter
**Effort:** M · **Value:** ⭐⭐

A lightweight view counter per item using a privacy-friendly analytics service (GoatCounter — free, open source, self-hostable). One `<script>` tag + display component.

Enables a future "Most Viewed" section on the home page as a complement to "Recently Listed."

---

### 3.3 Offline Caching (PWA Service Worker)
**Effort:** M · **Value:** ⭐⭐

A service worker that caches recently visited item pages and images. Allows buyers to view previously visited items without connectivity — useful at garage sales or markets where signal is poor.

Builds on the PWA manifest (Tier 1.9).

---

### 3.4 Cross-Listing Export Templates
**Effort:** M · **Value:** ⭐⭐

`pnpm export-marketplace houseware/ikea-lamp` generates a formatted text block ready to paste into:
- Facebook Marketplace
- Craigslist
- OfferUp / Letgo
- eBay (description template)

Reads `item.json` and formats fields per each platform's conventions (title length limits, description format, etc.).

---

### 3.5 "Bundle Deal" Multi-Item Contact
**Effort:** M · **Value:** ⭐⭐

Add `bundle_with` to `item.json` (already proposed as a schema addition). The item detail page shows a "Bundle available with {item X}" section listing the linked items with a combined total price. A "Contact about bundle" button pre-fills the contact message with all included items and the total.

---

### 3.6 Price Drop Tracking
**Effort:** M · **Value:** ⭐⭐

Add `price_reduced: true` and optional `previous_lowest_price` to `item.json`. Shows a "Price Reduced" chip on item cards with the old price struck through.

`pnpm price-history` could maintain a local `price-history.json` per item tracking all price changes over time — useful for the seller to see how long items took to sell at various price points.

---

### 3.7 i18n — Multi-Language Support ✅ Shipped in v1
**Effort:** L · **Value:** ⭐⭐

Add language variants of text fields to `item.json` (`name_zh`, `description_zh`) and a `locale` config key. The site renders in the configured language, with automatic fallback to English if a field has no translation.

Already in the Extensibility Register.

---

### 3.8 Seller Dashboard (Local-Only) 👤
**Effort:** L · **Value:** ⭐⭐⭐

**This is the primary accessibility unlock for the non-CS user segment.** A local-only web UI (runs on `localhost` only, never deployed) that lets the seller manage items visually: add/edit `item.json` fields, change status, trigger uploads — without editing JSON files directly.

Built as a Next.js dev-mode-only route or a separate Electron/Tauri app. No backend server required; reads/writes `content/items/` directly from the local filesystem.

Once this exists, the non-technical user's workflow becomes entirely GUI-driven: open the dashboard, fill in the form, click "Upload & Publish." No JSON, no terminal, no git commands visible to them.

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

### 4.3 Shipping Calculator Integration
**Effort:** L · **Value:** ⭐⭐

For items with a "Shipping" price tier: integrate USPS/UPS/FedEx APIs to calculate actual shipping cost based on buyer ZIP code, item dimensions, and weight. Replace the fixed "Shipping: $35" with a dynamically calculated figure.

Requires a serverless function to proxy the shipping API calls (API keys must not be in the browser bundle).

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
"bundle_with": [],                  // slugs of bundleable items
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
| PWA manifest (installable) | 🎓👤 | v1.1 |
| Semester-end batch actions (`pnpm semester-end`) | 🎓 | v1.1 |
| Pickup scheduling link (Calendly/Cal.com field) | 🎓👤 | v1.1 |
| Tag filter page (`/tags/{tag}`) | 🎓👤 | v1.1 |
| Distance unit toggle (mi ↔ km) | 🎓 | v1.1 |
| Cross-listing export templates | 🎓 | v2 |
| Bundle deal multi-item contact | 🎓👤 | v2 |
| Contact form (serverless, hides contact info) | 👤 | v2 |
| Item view counter (GoatCounter) | 🎓 | v2 |
| Offline caching (PWA service worker) | 🎓👤 | v2 |
| Price drop tracking (history log) | 🎓👤 | v2 |
| Manual dark mode toggle | 🎓 | v2 |
| **Seller dashboard (local-only GUI)** | 👤 | v2 — key non-CS growth unlock |
| Multi-seller support | 👤 | v3 / architecture redesign required |
| Real-time inventory without rebuild | 👤 | v3 |
| Shipping calculator (USPS/UPS API) | 🎓👤 | v3 |
| Buyer reservation system | 👤 | v3 |
