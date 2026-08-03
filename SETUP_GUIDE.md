# UsedExchange — Seller Setup Guide

**Version:** 1.4.2 · **Updated:** 2026-08-02

This guide explains how to manage your listing site without writing any code.
Every task here uses the AI assistant built into Claude Code — just describe what you want in plain language.
Most tasks can also be done without any commands at all in **Seller Studio**, a browser-based interface — see [Section 8](#8-managing-listings-in-a-browser--seller-studio).

---

## Before You Start

You need two things installed on your computer:
- **Claude Code** — the AI assistant (get it at [claude.ai/code](https://claude.ai/code))
- **Node.js** and **pnpm** — for running site commands (your developer may have set these up already)

Open Claude Code inside your project folder. The AI will automatically read your site settings and know what to do.

---

## 1. Adding a New Item

**Quick answer: yes, you create one folder per item. The AI generates everything inside it.**

### Step 1 — Create a folder for the item

Inside `content/items/`, create a new folder for each item you want to sell. The folder name becomes part of the URL, so keep it short and lowercase with hyphens.

Example:
```
content/items/electronics/iphone-14-pro/
content/items/houseware/ikea-lamp/
content/items/books/calculus-8th-edition/
```

### Step 2 — Add your photos

Copy your item photos into that folder. Any common image format works (JPG/JPEG, PNG, WEBP, or GIF). Name them clearly — they appear on the site in alphabetical order:
- `01-front.jpg`
- `02-back.jpg`
- `03-detail.jpg`

### Step 3 — (Optional) Write a notes file

Create a `notes.txt` file in the same folder and jot down anything you know about the item:

```
iPhone 14 Pro Max, 256GB, Deep Purple
Bought from Apple Store in May 2024, 14 months old
Condition: great, no cracks, minor scratches on the screen protector (replaced)
Comes with original cable (no charger brick), original box
Asking $750 local, $800 shipped
Willing to negotiate slightly
```

The AI uses these notes to fill in details it can't see in photos (exact model, your asking price, etc.).

### Step 4 — Run the AI skill

In Claude Code, type:

```
/update-items
```

The AI will look at your photos and notes, then show you a preview of the listing it would create. Review it, make any corrections, and confirm. The AI writes the `item.json` file for you.

### Step 5 — Review and publish

Open the generated `item.json`. Find the line that says `"status": "draft"` and change it to `"status": "available"`.

### Step 6 — Upload photos and deploy

```
pnpm upload-images
```

Then run `pnpm push` — this commits your `content/` folder and the image manifest and pushes to GitHub in one step. Your site rebuilds automatically and the item goes live.

---

## 2. Marking an Item as Sold

Run this command (replace with your category and item folder name):

```
pnpm mark-sold electronics/iphone-14-pro
```

This sets the status to `"sold"` and records today's date. Then run `pnpm push` to publish the change. The item shows a "SOLD" label on the site for a few days (configured in your settings), then disappears automatically.

---

## 3. Creating a Listing Without Photos

If you want to start a listing before you have photos ready:

```
pnpm create-item electronics/iphone-14-pro
```

This creates a fully scaffolded `item.json` — all 36 fields, with the status already set to `"draft"`, today's date, your site's measurement unit, and your default price tiers filled in. Fill in the details, add photos later, and change the status to `"available"` when it's ready.

> **Note:** the category folder (`content/items/electronics/` in this example) must already exist. If it's a brand-new category, create the folder first (see [Step 1](#1-adding-a-new-item)), then run the command above.

You can also create a reusable template for a whole category (same precondition — the category folder must already exist):

```
pnpm create-template electronics
```

Then copy the template whenever you add a new electronics item.

---

## 4. Changing Prices

Open the item's `item.json` file and find the `"price"` section:

```json
"price": {
  "tiers": [
    { "label": "Local pickup", "miles_max": 5, "amount": 750 },
    { "label": "Shipping", "miles_min": 5, "amount": 800 }
  ],
  "negotiable": false
}
```

Change the `"amount"` numbers to your new prices and save. Then run `pnpm push` — the site updates automatically.

To mark a price as reduced from a previous amount:
```json
"price_reduced": true,
"previous_lowest_price": 850
```

---

## 5. Uploading New Photos

After adding or replacing photos in an item folder:

```
pnpm upload-images
```

This compares your photos to what's already on the CDN and only uploads new or changed ones. Then run `pnpm push`.

---

## 6. Translating Listings into Another Language

If your site is configured for multiple languages (set during `/setup`), you can add translations to all your listings at once:

In Claude Code, type:

```
/translate-items
```

The AI will find every item that's missing a translation, show you the proposed translation, and ask you to confirm before writing anything. Existing translations are never overwritten without your permission.

---

## 7. Updating Your Site Settings

To change your contact info, location, site name, appearance, or any other site-wide setting:

In Claude Code, type:

```
/setup
```

The AI will read your current settings and ask what you'd like to change. You don't need to know any code — just answer in plain language.

New settings added in updates are always optional — your site keeps working with built-in defaults until you choose to configure them.

---

## 8. Managing Listings in a Browser — Seller Studio

If you'd rather not touch files at all, Seller Studio is a no-code web interface that covers most of sections 1–5:

```
pnpm studio
```

This opens a page in your browser (at `http://127.0.0.1:5174`) that runs **only on your own computer** — it is never published anywhere. From it you can:

- See all your items in a table and change their status (available / pending / sold / draft), one at a time or in bulk
- Create new items through a form — no JSON editing
- Edit any listing field through a form; your file's comments and formatting are preserved
- Upload photos by drag-and-drop, reorder them, and delete them
- Sync photos to the CDN with a live progress bar
- Publish — commit and push everything in one click

Seller Studio writes only to your `content/` folder (plus the auto-generated image manifest), and its publish step only ever commits `content/` and that manifest — credentials and other files can't be pushed by accident. You can freely mix it with the manual steps above; they work on the same files.

---

## 9. Shipping Cost Estimates (Optional)

Your site can show buyers a live shipping-cost estimate on item pages that have weight and dimensions set. This feature is **opt-in** and needs two things:

1. A free Cloudflare account — rates are looked up by a small "Worker" program that runs there
2. An API key from a shipping-rate provider (Shippo or EasyPost)

The setup is guided — in Claude Code, type:

```
/setup-shipping
```

Your provider API key lives only in the Cloudflare Worker, never in your site's public files. If you skip this, items simply won't show a shipping estimate — nothing else changes. For details, see the "Shipping Cost Estimation" section of [docs/CURRENT_FUNCTIONALITY.md](docs/CURRENT_FUNCTIONALITY.md).

---

## 10. Exporting to Facebook Marketplace

To list your items on Facebook Marketplace in bulk, run:

```
pnpm fb-export
```

The command walks you through choosing items and choosing a price (plus, on re-runs, an initial prompt about items you've already exported):

1. **Choose items** — export everything, a single category, or pick specific items by number (you can type `1,3,5` or a range like `2-6`)
2. **Choose price** — the lowest price across all tiers (recommended) or the highest price across all tiers; plus a local-pickup price (miles-limited tiers only) and a shipping price (open-ended tiers only), which appear only when your items actually have those tier types
3. **Done** — the file `exports/facebook-marketplace.csv` is ready to upload to Facebook Marketplace's bulk listing tool

If you have more than 50 items, the file is automatically split into numbered batches (Facebook's per-upload limit). The export also copies your photos into `exports/facebook-marketplace-photos/` and fills the CSV's photo columns with your CDN photo links (up to 10 per item).

**Re-running later:** the second time you run `pnpm fb-export`, it asks if you want to skip items you already exported. This way you only add newly listed items without re-creating duplicates.

The CSV is not committed to git — it stays on your computer only.

---

## 11. What to Back Up

The only folder you need to back up is **`content/`**. Everything else (the site code, design, build scripts) can be restored from the GitHub repository.

Inside `content/`, the most important files are:
- `content/config.ts` — your site settings
- `content/items/` — all your listings and photos

**Recommended:** keep your item photos backed up in a separate location (Google Photos, iCloud, external drive) before uploading to the CDN. The CDN is reliable but it's good practice to keep originals.

---

## 12. Who to Contact If Something Breaks

If the AI generates incorrect output, the site fails to build, or something looks wrong:

1. Run `pnpm type-check` (and optionally `pnpm lint`) — this tells you if any file has an error and points to the line.
2. Check that your last edit was inside the `content/` folder only.
3. If you changed a `.json` file manually, verify the JSON is valid (no missing commas, no unclosed brackets). When in doubt, use Seller Studio ([Section 8](#8-managing-listings-in-a-browser--seller-studio)) instead of hand-editing — it validates every field before saving.
4. If the build fails with a message about your site URL or missing translations, open `content/config.ts`: the build deliberately stops if your site address is still the placeholder, or if a language is only partially translated. The `/setup` skill can fix both.
5. If the build fails on GitHub, check the Actions tab in your GitHub repository for the error message.

For help with Claude Code itself, visit [claude.ai](https://claude.ai) or open an issue on the [Claude Code GitHub page](https://github.com/anthropics/claude-code/issues).
