# UsedExchange — Seller Setup Guide

This guide explains how to manage your listing site without writing any code.
Every task here uses the AI assistant built into Claude Code — just describe what you want in plain language.

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

Copy your item photos into that folder. Any common image format works (JPG, PNG, WEBP). Name them clearly — they appear on the site in alphabetical order:
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

Then commit and push to GitHub. Your site rebuilds automatically and the item goes live.

---

## 2. Marking an Item as Sold

Run this command (replace with your category and item folder name):

```
pnpm mark-sold electronics/iphone-14-pro
```

This sets the status to `"sold"` and records today's date. The item shows a "SOLD" label on the site for a few days (configured in your settings), then disappears automatically.

---

## 3. Creating a Listing Without Photos

If you want to start a listing before you have photos ready:

```
pnpm create-item electronics/iphone-14-pro
```

This creates an empty `item.json` template. Fill in the details manually, set `status: "draft"` until it's ready, and add photos later.

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

Change the `"amount"` numbers to your new prices and save. Then push to GitHub — the site updates automatically.

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

This compares your photos to what's already on the CDN and only uploads new or changed ones. Then commit and push.

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

---

## 8. What to Back Up

The only folder you need to back up is **`content/`**. Everything else (the site code, design, build scripts) can be restored from the GitHub repository.

Inside `content/`, the most important files are:
- `content/config.ts` — your site settings
- `content/items/` — all your listings and photos

**Recommended:** keep your item photos backed up in a separate location (Google Photos, iCloud, external drive) before uploading to the CDN. The CDN is reliable but it's good practice to keep originals.

---

## 9. Who to Contact If Something Breaks

If the AI generates incorrect output, the site fails to build, or something looks wrong:

1. Run `pnpm type-check` — this tells you if any file has an error and points to the line.
2. Check that your last edit was inside the `content/` folder only.
3. If you changed a `.json` file manually, verify the JSON is valid (no missing commas, no unclosed brackets).
4. If the build fails on GitHub, check the Actions tab in your GitHub repository for the error message.

For help with Claude Code itself, visit [claude.ai](https://claude.ai) or open an issue on the [Claude Code GitHub page](https://github.com/anthropics/claude-code/issues).
