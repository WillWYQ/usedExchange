# Skill: /setup — Site Setup Wizard

## Trigger

This skill activates when the seller runs `/setup` or asks to:
- "set up my site"
- "configure my settings"
- "update my contact info / location / appearance"
- "change my site name"
- "first-time setup"

---

## What This Skill Does

Guides the seller through 8 question groups to generate or update `content/config.ts` — the single file that controls everything about their site. Asks questions conversationally, one group at a time. Writes the file only after the seller reviews and confirms.

**Output:** A complete, TypeScript-valid `content/config.ts` that passes `pnpm type-check`.

---

## Step 0 — Idempotency Check

**Before asking any questions**, check if `content/config.ts` already exists:

- If it **exists**: Read it. Pre-fill all answers with the current values. Tell the seller: "I found your existing config. I'll show you each section and you can update anything or press Enter to keep it." Only ask about sections the seller explicitly wants to change, or walk through all if they say "full setup".
- If it **does not exist**: Start from scratch with the full wizard.

Partial re-run: If the seller says "just update my contact info" or "only change the appearance", jump directly to the relevant question group(s) and skip the rest.

---

## Question Groups

Work through these in order. Wait for the seller's answer before moving to the next group. Accept short, natural-language answers — do not require the seller to know TypeScript syntax.

---

### Group 1 — Site Identity

Ask:
> What would you like to call your site? (Example: "Will's Used Exchange", "Emma's Closet", "Tech Deals by Alex")

> Add a short tagline — one sentence about what you're selling or your vibe. (Example: "Quality second-hand items — local pickup preferred." Leave blank to skip.)

> Do you have a logo image? If yes, what's the filename in your `/public` folder? (Leave blank to use your site name as text.)

Map to: `name`, `tagline`, `logo`

---

### Group 2 — Deployment

Ask:
> What is the URL where your site will be live? (Example: "https://will.github.io/usedExchange" or "https://my-items.com" — include https://)

> How are you hosting the site?
> 1. GitHub Pages (static — recommended for most sellers)
> 2. Vercel

Map to: `baseUrl`, `deploymentMode` (`"static"` for option 1, `"vercel"` for option 2)

---

### Group 3 — Image Storage

Ask:
> Where will your item photos be stored?
> 1. Cloudflare R2 (free, fast CDN — recommended)
> 2. Vercel Blob (good if you're using Vercel hosting)
> 3. Local only (photos served from the repo — only for testing)

Map to: `imageStorage.provider` (`"cloudflare-r2"` / `"vercel-blob"` / `"local"`)

If they choose Cloudflare R2 or Vercel Blob, remind them: "You'll need to add your API keys to a `.env.local` file. See SETUP_GUIDE.md for instructions."

---

### Group 4 — Your Location

Ask:
> What city or neighbourhood are you in? (This is used to calculate distances for buyers so they know if local pickup is practical. Example: "San Francisco, CA" or "Brooklyn, NY")

> Optional: Do you want to use a nearby landmark or intersection instead of your exact address? (e.g. "near Dolores Park, San Francisco" — recommended for privacy)

After the seller answers, **use your knowledge to look up the approximate latitude and longitude** for that location. Show the coordinates for confirmation:

> Based on "[location]", I suggest:
> - `lat: 37.7749`
> - `lng: -122.4194`
> - `label: "San Francisco, CA"`
>
> Does this look right? (These coordinates are visible in your site's page source, so using a nearby landmark is fine.)

If the seller wants to adjust, accept corrected coordinates or a more specific location and recalculate.

Map to: `location.lat`, `location.lng`, `location.label`

---

### Group 5 — Contact Information

Ask:
> How should buyers contact you? List the platforms you use. I'll help you set them up.
> Options: Email, Instagram, WhatsApp, WeChat (QR code), LINE (QR code), Venmo, Zelle (QR code), Facebook, Snapchat, Discord, Twitter/X, TikTok, LinkedIn, YouTube

For each platform the seller mentions, ask for the relevant value:
- Email → email address
- Instagram → username (without @)
- WhatsApp → phone number in E.164 format (e.g. +12125551234)
- WeChat / LINE / Zelle → confirm they have a QR code image saved to `content/contact/` and ask for the filename
- Venmo → username **or** QR code image (ask which they prefer)
- Discord → numeric User ID (explain: Settings → Advanced → Developer Mode → right-click your name → Copy User ID)
- Twitter/X → handle (without @)
- TikTok → handle (with @, e.g. @username)

Ask:
> Should contact info be hidden behind a "Show Contact" button, or always visible?
> 1. Hidden behind button (recommended — reduces spam)
> 2. Always visible

Map to: `contact.reveal_behavior` (`"click"` or `"always"`), `contact.platforms`

---

### Group 6 — Content Defaults

Ask:
> What currency should prices be displayed in? (Default: USD. Other examples: CAD, EUR, GBP, AUD)

> How many items should appear in the "Recently Listed" strip on the home page? (Default: 6)

> After an item sells, how many days should it stay visible on the site with a "SOLD" label? (Default: 3 days. Enter 0 to keep sold items forever, -1 to hide them immediately.)

Map to: `currency`, `recentlyListedCount`, `soldItemRetentionDays`

---

### Group 7 — Appearance

**Before presenting options, read `lib/ui/types.ts` to get the live list of valid values.** The options below are current as of the last update but the type file is authoritative — if they differ, use the type file.

Ask:
> Let's choose your visual style. I'll describe the options.
>
> **Background effect** (what's behind your content):
> - `none` — clean white/dark background (default, loads fastest)
> - `aurora` — slow animated colour gradient
> - `shooting-stars` — floating shooting-star particles
> - `meteors` — streaking meteor effect
> - `vortex` — spinning vortex tunnel
> - `wavy` — gentle wave animation
> - `spotlight` / `spotlight-new` — cursor-following spotlight
> - `background-beams` / `background-beams-collision` — animated light beams
> - `background-gradient-animation` — shifting gradient
> - `background-boxes` — animated box grid
> - `grid-and-dot` — static dot-grid pattern
> - `background-lines` — subtle line pattern
>
> Which background would you like? (Type the exact value, or "none")

> **Item grid style** (how item cards are arranged):
> - `simple` — clean CSS grid (recommended)
> - `focus-cards` — cards expand and dim others on hover
> - `bento-grid` — variable-size bento layout
> - `layout-grid` — masonry-style layout
>
> Which grid style? (Type the exact value, or "simple")

> **Gallery style** (photo viewer on item detail pages):
> - `simple` — main image + thumbnail strip (recommended)
> - `apple-cards-carousel` — swipeable card carousel
> - `images-slider` — full-width sliding images
> - `carousel` — standard auto-advancing carousel
> - `parallax-scroll` — depth parallax on scroll
>
> Which gallery style?

> **Item card style** (how individual item cards look):
> - `simple` — clean card with shadow (recommended)
> - `wobble-card` — wobbles on hover
> - `3d-card` — lifts in 3D on hover
> - `card-spotlight` — spotlight follows cursor
> - `card-hover-effect` — subtle lift and glow
> - `direction-aware-hover` — hover effect follows mouse direction
> - `glare-card` — glare/shine effect
> - `evervault-card` — matrix-style pattern
>
> Which card style?

Map to: `ui.background`, `ui.itemGrid`, `ui.gallery`, `ui.itemCard`

After the seller picks, **validate each value against `lib/ui/types.ts`** before writing the config. If a value isn't in the type, tell the seller and ask them to pick from the real list.

---

### Group 8 — Languages

Ask:
> What language is your site in? (Default: English — just press Enter to keep it.)

> Do you want to support multiple languages? For example, if you want listings in both English and Chinese, buyers can switch between them. (yes / no)

If yes:
> Which additional languages? (Common options: zh — Chinese, es — Spanish, fr — French, ja — Japanese, ko — Korean. You can add more later.)

> For Chinese: do you want Simplified Chinese (简体, mainland China standard) or Traditional Chinese (繁體, Taiwan/HK standard)?

Note: If multiple locales are configured, a language switcher will appear in the site header. Sellers then use `/translate-items` to add translations to their listings.

Map to: `i18n.defaultLocale`, `i18n.availableLocales`

---

## Step — Category Scaffold

After the config questions, ask:
> What categories of items will you be selling? I can create the folder structure for you. (Examples: "electronics, furniture, clothing, books" or "houseware, outdoor-gear, textbooks")

For each category name the seller provides:
1. Suggest a URL-friendly slug (lowercase, hyphens): "Outdoor Gear" → `outdoor-gear`
2. Suggest a display name and an icon from the Tabler Icons set
3. Confirm the list before creating folders

Then generate a `_category.json` for each new category that doesn't already exist:
```json
{
  "display_name": "Electronics",
  "description": "Laptops, phones, cables, and other tech.",
  "icon": "💻",
  "sort_order": 10
}
```

Use an appropriate emoji for `icon`. Use snake_case for all keys (`display_name`, `sort_order`).

**Only create folders and `_category.json` files inside `content/items/`.** Never modify any other files.

---

## Step — Generate `content/config.ts`

Compile all answers into a complete `content/config.ts` using the template below. Show the full file for the seller to review before writing.

```typescript
import type { SiteConfig } from "@/lib/config/types";

export const siteConfig: SiteConfig = {
  // ── Identity ─────────────────────────────────────────────────────────────
  name: "{{name}}",
  tagline: "{{tagline}}",
  logo: "{{logo}}",

  // ── Deployment ───────────────────────────────────────────────────────────
  deploymentMode: "{{deploymentMode}}",
  baseUrl: "{{baseUrl}}",

  // ── Image Storage ─────────────────────────────────────────────────────────
  imageStorage: {
    provider: "{{imageStorage.provider}}",
  },

  // ── Seller Location ───────────────────────────────────────────────────────
  location: {
    lat: {{location.lat}},
    lng: {{location.lng}},
    label: "{{location.label}}",
  },

  // ── Content Defaults ──────────────────────────────────────────────────────
  currency: "{{currency}}",
  recentlyListedCount: {{recentlyListedCount}},
  soldItemRetentionDays: {{soldItemRetentionDays}},

  // ── Contact ───────────────────────────────────────────────────────────────
  contact: {
    reveal_behavior: "{{contact.reveal_behavior}}",
    platforms: [
      // {{contact.platforms entries}}
    ],
  },

  // ── Home Page ─────────────────────────────────────────────────────────────
  hero: {
    cta_label: "Browse Items",
    cta_href: "#categories",
  },

  // ── SEO ───────────────────────────────────────────────────────────────────
  meta: {
    description: "{{meta.description}}",
    twitterHandle: "",
  },

  // ── UI Component Slots ────────────────────────────────────────────────────
  ui: {
    background: "{{ui.background}}",
    itemGrid:   "{{ui.itemGrid}}",
    gallery:    "{{ui.gallery}}",
    itemCard:   "{{ui.itemCard}}",
  },

  // ── Dark Mode ─────────────────────────────────────────────────────────────
  darkMode: "media",

  // ── Analytics ─────────────────────────────────────────────────────────────
  analytics: {
    vercel:        false,
    speedInsights: false,
  },

  // ── Full-Text Search ──────────────────────────────────────────────────────
  search: {
    enabled:     true,
    placeholder: "Search items...",
  },

  // ── Sitemap ───────────────────────────────────────────────────────────────
  sitemap: {
    enabled: true,
  },

  // ── Internationalisation ──────────────────────────────────────────────────
  i18n: {
    defaultLocale: "{{i18n.defaultLocale}}",
    availableLocales: [{{i18n.availableLocales}}],
    showLocaleSwitcher: true,
    strings: {
      heroTagline:    "",
      recentlyListed: "",
      browseAll:      "",
      makeOffer:      "",
      contactSeller:  "",
      soldBanner:     "",
    },
  },
};
```

---

## Step — Confirmation and Write

Show the generated file. Ask:
> Does this look right? I'll write it to `content/config.ts`. (yes / make a change)

If the seller wants to change something, update the relevant section and show the diff before writing.

After writing, tell the seller:
1. Run `pnpm type-check` to confirm the file has no errors.
2. If they added new categories, folders are ready for item photos.
3. Run `/update-items` to generate listing files from photos.
4. Run `pnpm upload-images` to push photos to the CDN before deploying.

---

## Validation Rules

Before writing, verify:
- `baseUrl` starts with `https://` (not `http://`)
- `location.lat` is between -90 and 90
- `location.lng` is between -180 and 180
- `recentlyListedCount` is a positive integer
- `soldItemRetentionDays` is an integer ≥ -1
- `currency` is a 3-letter uppercase string
- All platform entries use recognised `type` values
- QR-based platforms (`wechat`, `line`, `zelle`, venmo with QR) have `qr_image` set
- Link-based platforms have `value` set and non-empty

If any value fails validation, tell the seller what's wrong and ask for a corrected value before writing.
