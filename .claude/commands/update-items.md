# Skill: /update-items — Generate item.json from Photos

## Trigger

This skill activates when the seller runs `/update-items` or asks to:
- "generate a listing from my photos"
- "create item.json for [item]"
- "update items in [category]"
- "fill in the listing for [folder name]"

---

## What This Skill Does

Scans `content/items/` for item folders that are **missing `item.json` or have `status: "draft"`**, analyzes the photos using vision, merges in any notes the seller has written, shows a preview, and writes `item.json` only after the seller confirms.

**Output guarantee:** The generated `item.json` always has `status: "draft"`. The seller manually changes it to `"available"` when ready to publish. The field `reserved_for` is **never written**.

---

## Step 0 — Understand Scope

Before scanning, check if the seller has specified a scope:

- "just the electronics folder" → only scan `content/items/electronics/`
- "the blue-lamp item" → only process that one subfolder
- "everything missing a listing" → scan all categories, skip folders that already have a non-draft `item.json`
- No scope given → ask: "Should I process all items, or just a specific category or item?"

---

## Step 1 — Scan for Target Folders

A folder is a target if it contains at least one image file (`.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`) **and** either:
- Has no `item.json`, **or**
- Has `item.json` with `"status": "draft"`

List all target folders to the seller before proceeding. If none found, explain why (no images, all already published).

---

## Step 2 — Read Description File (If Present)

Before analyzing photos, look for a description/notes file in the item folder. Supported formats (checked in this priority order):

| File | Format | How to parse |
|---|---|---|
| `info.json` | JSON object | Parse as structured fields directly |
| `info.yaml` | YAML object | Parse as structured fields directly |
| `notes.md` | Markdown prose | Extract fields from free-form text |
| `notes.txt` | Plain text | Extract fields from free-form text |
| `description.md` | Markdown prose | Same as notes.md |
| `description.txt` | Plain text | Same as notes.txt |

**Merge rule:** Values from the description file **always override** vision analysis for the same field. If the description file says `brand: "Sony"`, use `"Sony"` even if the photo shows a different logo. Vision fills gaps; the description file is authoritative.

---

## Step 3 — Analyze Photos with Vision

Look at every image in the folder. Extract as many fields as possible using the confidence table below.

### Photo Analysis Instructions

- Look for visible text: brand names, model numbers, serial numbers, condition labels, dimensions printed on packaging.
- Count items if multiple are visible (`quantity`).
- Assess physical condition: scratches, wear, missing parts, original packaging present.
- Identify the item category from context: electronics, furniture, clothing, books, kitchenware, etc.
- Suggest descriptive tags based on what you see.
- Note the dominant color(s).

### Field Extraction Table

| Field | Extract from | Confidence | Notes |
|---|---|---|---|
| `name` | Vision + description file | High | Use description file if present. Be specific: "IKEA TRÅDFRI Desk Lamp" not "lamp" |
| `description` | Description file, then vision | High from file, Medium from vision | Write 2–4 sentences in seller's voice. Mention notable flaws clearly. |
| `condition` | Vision | Medium | Must be: `"new"` / `"like-new"` / `"good"` / `"fair"` / `"for-parts"`. When in doubt, choose the more conservative value. |
| `brand` | Vision (logo/text) + description | High if visible | Leave `""` if not identifiable. Never guess. |
| `model` | Vision (text on item) + description | Medium | Leave `""` if not readable. |
| `color` | Vision | High | Primary color only, e.g. `"black"`, `"silver"`, `"navy blue"` |
| `quantity` | Vision (count items in photo) | High | Default `1` if unclear. |
| `age_years` | Description file only | N/A from vision | Leave `null` unless seller provides it. |
| `dimensions` | Description file or printed label | Low from vision | Leave `null` unless clearly visible or stated. Include `"unit"`: `"cm"` or `"in"`. |
| `weight` | Description file only | N/A from vision | Leave `null` unless stated. |
| `original_source` | Description file + visible packaging | Medium | e.g. `"Amazon"`, `"IKEA"`, `"Target"` |
| `original_price` | Description file | N/A from vision | Leave `null` unless stated. |
| `tags` | Vision + description | Medium | 2–6 lowercase hyphenated tags. e.g. `["desk-lamp", "smart-home", "energy-saving"]` |
| `isbn` | Vision (back cover barcode) + description | High if visible | Books only. Normalize to ISBN-13 if possible. |
| `course` | Description file | N/A from vision | e.g. `"CS101"`. Leave `""` if not a textbook. |
| `edition` | Vision (cover text) + description | High if visible | e.g. `"3rd Edition"`. Leave `""` if unclear. |

**Fields always set by this skill (never left to vision or description):**
- `status`: always `"draft"`
- `listed_date`: today's date in `YYYY-MM-DD` format

**Fields never written by this skill:**
- `reserved_for` — private buyer info, never populated by AI
- `sold_date` — only set when marking sold
- `stripe_payment_link`, `venmo_payment_request` — seller adds manually
- `name_{locale}`, `description_{locale}` — use `/translate-items` instead

**Fields left as defaults unless the description file provides them:**
- `price` — seller must set pricing (AI generates a blank tier scaffold to fill in)
- `pickup_windows` — seller knows their schedule
- `preferred_payment`, `contact_note` — from description file only
- `no_lowball`, `price_reduced`, `previous_lowest_price`, `min_acceptable_offer` — from description file only
- `youtube_link` — from description file only

---

## Step 4 — Generate Preview

Show the proposed `item.json` for each item **before writing anything**. Format it as a readable JSON code block. Highlight:

- Fields where confidence was **low** (suggest the seller verify these).
- Fields left blank that the seller should fill in (especially `price.tiers`).
- The condition assessment with a one-sentence justification.

Example preview format:

```
📦 content/items/electronics/ikea-lamp/

Proposed item.json:
[code block]

⚠️  Please verify:
• dimensions — not visible in photos; update if you know them
• price.tiers — filled with a placeholder scaffold; update with your pricing

✅ Confirm / ✏️ Edit / ⏭️ Skip  (or "accept all" to confirm every item)
```

---

## Step 5 — Seller Confirmation Flow

For each item, accept one of:
- **confirm** / **yes** / **looks good** → write the file
- **edit [field] to [value]** → update that field in the preview, show updated preview, ask again
- **skip** → do not write this item, move to next
- **accept all** → write all remaining items without individual confirmation

If the seller edits a field, validate the value against the schema (correct enum, correct type) before accepting.

---

## Step 6 — Write `item.json`

Write the confirmed JSON to `content/items/<category>/<item-name>/item.json`.

**Only write files inside `content/`.** Never modify any other file.

After writing, tell the seller:
1. Which files were written.
2. Run `pnpm type-check` to confirm no schema errors.
3. Change `"status": "draft"` to `"status": "available"` in each file when ready to publish.
4. Run `pnpm upload-images` to push photos to the CDN.

---

## Full `item.json` Schema Reference

Use this as the output template. Omit any field whose value is `null`, `""`, or `[]` **unless** it is one of the required fields: `name`, `status`, `listed_date`, `price`.

```jsonc
{
  // ── Identity ───────────────────────────────────────────────────────────────
  "name": "",                           // REQUIRED — specific and descriptive

  // ── Pricing ───────────────────────────────────────────────────────────────
  "price": {
    "currency": "USD",                  // ISO 4217; omit to inherit from siteConfig
    "tiers": [
      // Distance-based tiers. miles_max absent = open-ended (shipping/far pickup).
      // Boundaries should be inclusive/overlapping to avoid gaps.
      // Example:
      { "label": "Local pickup (≤ 5 mi)", "miles_max": 5, "amount": 0 },
      { "label": "6 – 20 mi", "miles_min": 5, "miles_max": 20, "amount": 0 },
      { "label": "Shipping", "miles_min": 20, "amount": 0 }
      // For a flat price, use a single tier with no miles fields:
      // { "label": "Flat price", "amount": 0 }
    ],
    "negotiable": false
  },

  // ── Item Details ──────────────────────────────────────────────────────────
  "description": "",                    // GitHub-flavoured Markdown supported
  "condition": "good",                  // "new"|"like-new"|"good"|"fair"|"for-parts"
  "brand": "",
  "model": "",
  "age_years": null,
  "dimensions": null,                   // { length, width, height, unit: "cm"|"in" }
  "weight": null,                       // { value, unit: "kg"|"lb" }
  "color": "",
  "quantity": 1,

  // ── Provenance ────────────────────────────────────────────────────────────
  "original_source": "",
  "original_link": "",
  "original_price": null,

  // ── Listing Lifecycle ─────────────────────────────────────────────────────
  "status": "draft",                    // ALWAYS "draft" — seller changes to "available"
  "listed_date": "YYYY-MM-DD",         // today's date

  // ── Categorisation ────────────────────────────────────────────────────────
  "tags": [],
  "category_override": "",

  // ── SEO ───────────────────────────────────────────────────────────────────
  "meta_description": "",              // leave "" to auto-generate from description

  // ── Pricing Signals ──────────────────────────────────────────────────────
  "no_lowball": false,
  "price_reduced": false,
  "previous_lowest_price": null,
  "min_acceptable_offer": null,

  // ── Payment Links ─────────────────────────────────────────────────────────
  "stripe_payment_link": "",
  "venmo_payment_request": "",

  // ── Logistics ─────────────────────────────────────────────────────────────
  "pickup_windows": [],
  "youtube_link": "",

  // ── Textbook-Specific ─────────────────────────────────────────────────────
  "isbn": "",
  "course": "",
  "edition": "",
  "semester_listed": "",

  // ── Contact Preferences (item-level overrides) ────────────────────────────
  "preferred_payment": [],
  "contact_note": "",

  // ── Internationalisation (use /translate-items to fill these) ─────────────
  "name_zh": "",
  "description_zh": ""
  // Pattern: name_{locale} / description_{locale} for each availableLocale
}
```

---

## Edge Cases

| Situation | Behaviour |
|---|---|
| Folder has no images at all | Skip with message: "No images found in [folder]. Add photos and run again." |
| `item.json` already exists with `status: "available"` or `"sold"` | Skip — never overwrite a published or sold listing. Inform the seller. |
| Description file has an unrecognised field | Ignore it; only map recognised fields. |
| Vision cannot identify the item at all | Generate a minimal skeleton with `name: ""` and ask the seller to fill in name and description manually. |
| Multiple items in one photo | Set `quantity` to the count visible; note in the description that quantity may vary. |
| Item is clearly a textbook (ISBN visible or course mentioned) | Populate `isbn`, `course`, `edition` fields; suggest adding `semester_listed`. |
