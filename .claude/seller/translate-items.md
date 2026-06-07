# Skill: /translate-items — Add Locale Translations to Listings

## Trigger

This skill activates when the seller runs `/translate-items` or asks to:
- "translate my listings"
- "add Chinese / Spanish / French / [any language] to my items"
- "fill in the translations"
- "translate the [category] folder"
- "add [locale] for items missing it"

---

## What This Skill Does

Detects which locales are configured in `siteConfig.i18n.availableLocales`, scans `content/items/` for item.json files that are missing translations for those locales, translates `name` and `description` into the target language(s), shows each translation for seller approval, and writes only the new locale fields — leaving everything else untouched.

**Output guarantee:** Only `name_{locale}` and `description_{locale}` fields are written. No other field is ever modified or removed. Existing non-empty translations are never overwritten unless the seller explicitly requests it.

---

## Step 0 — Detect Locales

Read `content/config.ts` and extract `siteConfig.i18n.availableLocales`.

- If `availableLocales` is `["en"]` (English only): tell the seller "Your site is set to English only. To add another language, first update `i18n.availableLocales` in `content/config.ts` via `/setup`, then run `/translate-items` again."
- If `availableLocales` contains exactly one non-English locale (e.g. `["en", "zh"]`): target that locale automatically, no need to ask.
- If `availableLocales` contains multiple non-English locales (e.g. `["en", "zh", "es"]`): ask the seller which locale(s) to target, or confirm "all".

**Target locale(s)** = all locales in `availableLocales` except `"en"` (English is the source language, never translated to itself).

---

## Step 1 — Verify Schema Precondition

Before translating anything, verify that `lib/content/schema.ts` includes the target locale fields.

Check for the presence of `name_{locale}` and `description_{locale}` in the Zod schema.

**If the fields are missing**, do NOT proceed with translation. Instead, print the exact code to add and stop:

```
⚠️  The schema does not yet support the "{locale}" locale.

Please add the following to lib/content/schema.ts (inside the itemJsonSchema object):

  name_{locale}: z.string().optional().default(""),
  description_{locale}: z.string().optional().default(""),

And add to lib/content/types.ts (inside the Item interface):

  name_{locale}: string;
  description_{locale}: string;

After adding these, run `pnpm type-check` to confirm, then run /translate-items again.
```

---

## Step 2 — Understand Scope

Check if the seller has specified a scope:

- "just electronics" → only scan `content/items/electronics/`
- "the blue-lamp item" → only that one item folder
- "everything missing Spanish" → all items where `name_es` is absent or empty
- "re-translate all" → include items that already have translations (ask for explicit confirmation before overwriting)
- No scope given → scan all items, skip already-translated ones

---

## Step 3 — Scan for Items Needing Translation

Walk through all `content/items/<category>/<item>/item.json` files in scope.

An item **needs translation** for a given locale if:
- `name_{locale}` is absent from the JSON, **or**
- `name_{locale}` is an empty string `""`

An item is **already translated** (skip it) if `name_{locale}` is a non-empty string — unless the seller requested a re-translate.

Build a list of items to translate. If the list is empty, tell the seller: "All items in scope already have {locale} translations."

Show the seller the list before translating:
```
Found 4 items needing {locale} translation:
  • electronics/iphone-14
  • houseware/coffee-maker
  • houseware/ikea-lamp
  • books/calculus-textbook

Proceed? (yes / scope down / cancel)
```

---

## Step 4 — Translate Each Item

For each item, translate the following fields:

| Source field | Target field | Notes |
|---|---|---|
| `name` | `name_{locale}` | Translate the item name. Keep brand names and model numbers untranslated. |
| `description` | `description_{locale}` | Translate the description prose. Preserve all Markdown syntax. |

### Translation Quality Rules

**Preserve verbatim (do not translate):**
- Brand names: "IKEA", "Apple", "Sony", "Nintendo" — keep as-is
- Model identifiers: "iPhone 14 Pro Max", "TRÅDFRI E14", "RTX 4090"
- Currency amounts: "$25", "USD 50"
- Measurements: "45 cm", "2.5 kg", "5 miles"
- URLs and links
- ISBN numbers
- Course codes: "CS101", "MATH230"
- Markdown syntax: `**bold**`, `*italic*`, `[link text](url)`, `` `code` ``, `- list item`

**Translate naturally:**
- Describe condition clearly in the target language
- Use peer-to-peer marketplace tone (casual, not formal retail language)
- Match the seller's energy: a casual description translates casually; a detailed technical description translates precisely

**Language-specific guidance:**

| Locale | Guidance |
|---|---|
| `zh` | Default to Simplified Chinese (简体中文). If the seller specified Traditional Chinese (繁體中文), use that instead. Keep measurement units in Arabic numerals. |
| `es` | Use neutral Latin American Spanish unless the seller specifies a region (Spain, Mexico, etc.) |
| `fr` | Use standard French. Apply correct gender agreement for item nouns. |
| `ja` | Use polite but casual form (です/ます) appropriate for a peer marketplace. |
| `ko` | Use 합쇼체 for descriptions; 이다 form is acceptable for short names. |
| Other | Use the most widely understood standard variant of the language. |

### Markdown Preservation Example

Source (English):
```
Works **perfectly**. Bought 2 years ago from [IKEA](https://ikea.com).
- Original box included
- Minor scratch on the base (see photo 3)
```

Correct translation (Chinese):
```
使用**完好**。2 年前从 [IKEA](https://ikea.com) 购入。
- 附原装包装盒
- 底座有轻微划痕（见图 3）
```

Incorrect (breaks Markdown):
```
使用完好。2 年前购入。附原装包装盒。底座有轻微划痕。
```

---

## Step 5 — Confirmation Flow

For each item, show the proposed translations:

```
📦 electronics/iphone-14

  name:        "iPhone 14 Pro Max 256GB — Deep Purple"
  name_zh:     "iPhone 14 Pro Max 256GB — 深紫色"

  description (EN):
    Works perfectly. Minor scuff on the back (see photo 2). Charger not included.

  description_zh:
    使用完好。背面有轻微划痕（见图 2）。不含充电器。

✅ Confirm / ✏️ Edit / ⏭️ Skip / 📋 Accept All
```

Accept one of:
- **confirm** / **yes** → write the locale fields for this item
- **edit name to [text]** → update `name_{locale}` in the preview, re-show, ask again
- **edit description to [text]** → update `description_{locale}` in the preview, re-show, ask again
- **skip** → do not write this item, move to next
- **accept all** → write all remaining items without individual confirmation
- **re-translate** → try a different phrasing for this item

---

## Step 6 — Write Locale Fields Only

For each confirmed item, merge **only** the new locale fields into the existing `item.json`. Do not rewrite the file; patch only the target fields.

Concretely: read the existing JSON, add or update `name_{locale}` and `description_{locale}`, preserve all other fields exactly (same key order if possible), write back.

**Only write files inside `content/`.** Never modify any other file.

---

## Step 7 — Summary

After processing all items, show a summary:

```
Translation complete for locale: zh

  ✅ Written:  4 items
  ⏭️  Skipped:  1 item (houseware/coffee-maker)
  ➡️  Already translated: 2 items (unchanged)

Next steps:
• Run `pnpm type-check` to confirm no errors
• Items with translations will show the translated name and description
  when a buyer selects that language via the language switcher
• To add more locales, update `i18n.availableLocales` in content/config.ts
  and run /translate-items again
```

---

## Edge Cases

| Situation | Behaviour |
|---|---|
| `name` is empty in the source item | Skip that item; note "name is empty in [item] — fill in the English name first, then re-translate." |
| `description` is empty | Translate `name` only; leave `description_{locale}` as `""` |
| Item status is `"draft"` or `"sold"` | Translate it anyway — translations persist and are useful when items are re-listed or viewed in the sold archive |
| `availableLocales` has `["en"]` only | Halt immediately with instructions to add a locale first (see Step 0) |
| Seller asks to translate to a locale not in `availableLocales` | Remind them to add it to `content/config.ts` first, then re-run |
| Description contains HTML tags | Preserve them as-is; translate only the surrounding prose |
| Item has `name_zh` set but `description_zh` empty | Only fill `description_zh`; do not touch `name_zh` |
