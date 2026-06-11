# Skill: /setup-shipping — Shipping Calculator Setup

## Trigger

This skill activates when the seller runs `/setup-shipping` or asks to:
- "set up shipping costs"
- "enable the shipping calculator"
- "show buyers a real shipping price"
- "who pays for shipping"
- "I deployed the shipping worker, now what"
- "disable shipping estimates"

---

## What This Skill Does

Walks the seller through enabling the **optional** live shipping-rate estimator (Shippo/EasyPost via a Cloudflare Worker proxy). Covers:

1. Deciding whether to enable the feature at all (it's off by default and changes nothing if skipped)
2. Deploying the Cloudflare Worker proxy that holds the carrier API key (one-time, outside `content/`)
3. Configuring `siteConfig.shipping` in `content/config.ts` (proxy URL, default payer, ship-from address)
4. Checking which items need `weight` + `dimensions` added to qualify for an estimate
5. Optionally setting a per-item `shipping_payer` override
6. Filling in the `shipping*` UI strings for any extra locales

**Output:** An updated `content/config.ts` (and, if needed, `weight`/`dimensions`/`shipping_payer` additions to specific `content/items/*/item.json` files). No other files are written by this skill.

Full design reference: [docs/DESIGN.md §21](../../docs/DESIGN.md) ([docs/DESIGN_zh.md §21](../../docs/DESIGN_zh.md) for Chinese).

---

## Step 0 — Idempotency Check

**Before asking anything**, read `content/config.ts`:

- If a `shipping` block exists and is **uncommented with `enabled: true`**: summarise the current settings (`proxyUrl`, `defaultPayer`, `origin`) and ask what the seller wants to change — payer, ship-from address, proxy URL, or disable the feature entirely.
- If `shipping` is **absent or commented out**: this is a first-time setup — proceed from Step 1.
- If the seller just wants to **disable** it: set `shipping.enabled: false` (keep the rest of the block so it's easy to re-enable later), confirm, and stop.

---

## Step 1 — Confirm the Seller Wants This

Explain briefly, then ask for a yes/no:

> This adds a live shipping-cost estimate to items priced in your open-ended "Shipping" tier (the price tier with no `miles_max` — see your pricing setup). It requires deploying a small, free Cloudflare Worker that holds your shipping-API key, since that key must never be in the site's public files.
>
> Want to set this up now? (yes / no — you can run `/setup-shipping` again anytime)

If **no**: stop here. The site behaves exactly as before — nothing to undo.

---

## Step 2 — Cloudflare Worker Proxy

Ask:

> Have you already deployed `workers/shipping-rate-proxy` and have its URL (something like `https://shipping-rate-proxy.<your-subdomain>.workers.dev`)?

**If not deployed yet**, walk them through `workers/shipping-rate-proxy/README.md` at a high level — these are terminal commands the seller runs themselves, not files this skill writes:

1. Get an API key from [Shippo](https://goshippo.com) (recommended default) or [EasyPost](https://easypost.com)
2. `cd workers/shipping-rate-proxy && pnpm install`
3. Edit `workers/shipping-rate-proxy/wrangler.toml`: set `SHIPPING_PROVIDER` (`"shippo"` or `"easypost"`), `ALLOWED_ORIGIN` (their site's `baseUrl` from `content/config.ts`, no trailing slash), and `ORIGIN_ZIP` / `ORIGIN_COUNTRY` (where parcels ship from)
4. `pnpm wrangler login` (one-time)
5. `pnpm wrangler secret put SHIPPO_API_KEY` (or `EASYPOST_API_KEY`) — paste the key when prompted
6. `pnpm deploy` — prints the Worker URL

> ⚠️ Steps 2–6 happen in `workers/shipping-rate-proxy/` and are **not** part of `content/` — this skill only reads back the resulting URL, it does not run these commands or edit Worker files for you.

If the seller isn't ready to deploy the Worker yet, you can still complete Steps 3–5 below using a placeholder `proxyUrl` and tell them to come back and update it once deployed — but `shipping.enabled` should stay `false` until a real `proxyUrl` is set.

---

## Step 3 — Site-Wide Shipping Settings

Ask:

> **Who pays for shipping by default?**
> 1. Buyer pays — they'll see a live shipping estimate and enter their ZIP code (most common)
> 2. Seller pays — buyers see "Free shipping (included by seller)", no calculation needed
>
> (You can override this for individual items later.)

> **Where do your packages ship from?** Give me a ZIP/postal code and a 2-letter country code (e.g. `94103`, `US`). This is used by the Worker to calculate rates — it should match `ORIGIN_ZIP` / `ORIGIN_COUNTRY` in `workers/shipping-rate-proxy/wrangler.toml`.

> **What's your deployed Worker URL?** (from Step 2, e.g. `https://shipping-rate-proxy.your-name.workers.dev`)

Map answers to: `shipping.defaultPayer` (`"seller"` | `"buyer"`), `shipping.origin.zip`, `shipping.origin.country`, `shipping.proxyUrl`.

---

## Step 4 — Update `content/config.ts`

In `content/config.ts`, find the commented `shipping` block (it sits just before the `// ── Contact ──` section) and replace it with an active block using the answers from Step 3:

```ts
shipping: {
  enabled: true,
  proxyUrl: "{{proxyUrl}}",
  defaultPayer: "{{defaultPayer}}", // "seller" | "buyer"
  origin: {
    zip: "{{origin.zip}}",
    country: "{{origin.country}}", // ISO 3166-1 alpha-2
  },
},
```

Show the diff and confirm before writing. This is the **only required edit** to `content/config.ts` for this feature.

---

## Step 5 — Check Items for `weight` + `dimensions`

The estimator only appears on an item page when **all** of these are true:
- `siteConfig.shipping.enabled` is `true` (done in Step 4)
- the item's resolved price tier is the open-ended "Shipping" tier (no `miles_max`)
- the item's `item.json` has both `weight` and `dimensions` set

Scan `content/items/**/item.json` for items whose `price.tiers` includes an open-ended tier, and report which of those are **missing** `weight` and/or `dimensions`. For each one, ask the seller for:

> Weight (a number + unit, `kg` or `lb`) and dimensions (length × width × height + unit, `cm` or `in`) for **{{item name}}**? (Skip to leave the shipping estimate hidden for this item.)

Write the answers into that item's `item.json`:

```json
"weight": { "value": 0.8, "unit": "kg" },
"dimensions": { "length": 45, "width": 15, "height": 15, "unit": "cm" }
```

All values must be positive numbers. Skip items the seller doesn't want to provide data for — they simply won't show an estimate, with no error.

---

## Step 6 — Per-Item Payer Override (Optional)

Explain:

> By default, every item uses the site-wide payer setting from Step 3. If a specific item should work differently — e.g. you normally pay shipping but this one item is too heavy/bulky — you can override it per item.

If the seller names specific items, add to that item's `item.json`:

```json
"price": {
  "...": "...",
  "shipping_payer": "buyer"
}
```

(`"seller"` or `"buyer"`, only on the items that need to differ from the default.)

---

## Step 7 — Extra Locale Strings (If Applicable)

If `siteConfig.i18n.availableLocales` includes locales beyond the default, check that each `translations.<locale>` block includes all 6 shipping UI strings:

```
shippingEstimateLabel
shippingZipPlaceholder
shippingCalculating
shippingUnavailable
shippingIncludedBySeller
shippingEstimateSuffix
```

`content/config.ts` ships with a commented Chinese (`zh`) example near the `en` block — uncomment and translate it for `zh`, or translate fresh for other locales. If a locale's `translations` block is missing any of these 6 keys, the build will fail (`pnpm type-check` / `scripts/check-config.ts`) — this skill should add them before finishing.

---

## Step 8 — Verify

After writing all changes, tell the seller to run, in order:
1. `pnpm type-check` — confirms `content/config.ts` and any edited `item.json` files are valid
2. `pnpm exec tsx scripts/check-config.ts` — validates `siteConfig.shipping` values (URL format, payer enum, etc.)
3. `pnpm dev` → open an item in the Shipping tier with `weight`/`dimensions` set → confirm either "Free shipping (included by seller)" or a ZIP input that returns a live rate

---

## Edge Cases

| Situation | Handling |
|---|---|
| Seller has no items in an open-ended "Shipping" tier | Feature can still be enabled, but explain the estimator won't appear anywhere until at least one item has such a tier |
| `proxyUrl` unreachable / Worker not deployed | `pnpm dev` will show "Shipping estimate unavailable" for buyer-pays items — not a build error; remind the seller to finish Step 2 |
| Seller wants to switch provider (Shippo ↔ EasyPost) later | That's a Worker-side change (`wrangler.toml` `SHIPPING_PROVIDER` + new secret) — `content/config.ts` doesn't need to change |
| `origin.zip`/`origin.country` in `content/config.ts` differs from `ORIGIN_ZIP`/`ORIGIN_COUNTRY` in `wrangler.toml` | Point this out — they should match; the Worker's values are authoritative for the actual rate request |
