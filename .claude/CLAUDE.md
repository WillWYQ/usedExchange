# UsedExchange — Seller Guide for AI Assistant

> This file is loaded automatically by Claude Code (and compatible AI tools) when you open this project.
> It tells the AI everything it needs to help you list items, set up your site, and translate listings.

---

## What This Project Is

**UsedExchange** is your personal second-hand item listing site.
- You add items by editing files in the `content/` folder — no coding required.
- Photos are stored on Cloudflare R2 (a free image host); everything else is on GitHub Pages.
- The AI assistant can generate listing files from your photos, set up your site config, and translate listings into other languages.

---

## ⚠️ The One Rule: Only Edit Inside `content/`

**You should never need to touch any file outside the `content/` folder.**
The AI assistant follows this rule strictly. If it suggests editing a file outside `content/`, decline.

Files you own:
- `content/config.ts` — your site settings (name, contact, pricing, appearance)
- `content/items/<category>/<item-name>/item.json` — each item's listing data
- `content/items/<category>/_category.json` — category display name and icon
- `content/contact/` — QR code images for WeChat, Zelle, LINE, Venmo

---

## AI Skills (Slash Commands)

### `/setup` — First-time site setup or update settings
Run this when you first clone the project, or whenever you want to change site-wide settings like your contact info, location, or appearance. The AI will ask you questions and generate `content/config.ts` for you.

### `/update-items` — Generate listing files from photos
Put your item photos in `content/items/<category>/<item-name>/` and run this. The AI will look at the photos (and any notes you've written) and generate a complete `item.json` listing file. The item starts as a **draft** — you review and approve before it goes live.

You can also include a notes file alongside your photos:
- `notes.txt` or `notes.md` — free-form description, price, pickup times, etc.
- `info.yaml` or `info.json` — structured fields (brand, model, price, etc.)

### `/translate-items` — Add translations to your listings
If your site supports multiple languages (set in `content/config.ts`), run this to translate your item names and descriptions. The AI will show you the translation for each item and ask you to confirm before writing anything.

---

## Common Tasks (No AI Needed)

| Task | Command |
|---|---|
| Mark an item as sold | `pnpm mark-sold <category>/<item-name>` |
| Create a blank item listing | `pnpm create-item <category>/<item-name>` |
| Upload photos to CDN | `pnpm upload-images` |
| Check for errors after AI edits | `pnpm type-check` |

---

## Item Status Values

| Status | Meaning | Visible on site? |
|---|---|---|
| `draft` | Not ready yet | No |
| `available` | Listed for sale | Yes |
| `pending` | Buyer interested | Yes (with badge) |
| `reserved` | Held for buyer | Yes (with badge) |
| `sold` | Completed sale | Yes (briefly, then hidden) |

**After the AI generates an item as `draft`, change `status` to `"available"` when you're ready to publish.**

---

## Pricing Format

Prices are distance-based tiers. Buyers closer to you pay less (local pickup); buyers farther away pay more (they need shipping or a longer drive).

```json
"price": {
  "currency": "USD",
  "tiers": [
    { "label": "Local pickup (≤ 5 mi)",  "miles_max": 5,  "amount": 15 },
    { "label": "6 – 20 mi",  "miles_min": 5,  "miles_max": 20, "amount": 20 },
    { "label": "Shipping",   "miles_min": 20, "amount": 30 }
  ],
  "negotiable": false
}
```

A single flat price (no distance tiers) is also valid:
```json
"price": {
  "tiers": [{ "label": "Flat price", "amount": 25 }]
}
```

---

## After the AI Writes Files

1. Run `pnpm type-check` — confirms the generated JSON/TypeScript has no errors.
2. Change `status` from `"draft"` to `"available"` when the listing looks good.
3. Run `pnpm upload-images` to push photos to the CDN.
4. Commit and push to GitHub — the site rebuilds automatically.

For a full walkthrough with no terminal commands, see **SETUP_GUIDE.md** in this folder.
