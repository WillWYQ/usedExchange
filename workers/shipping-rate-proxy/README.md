# shipping-rate-proxy

A small Cloudflare Worker that proxies shipping rate requests from
ShippingEstimator (the static site) to Shippo or EasyPost. It exists because
carrier API keys must never ship in the browser bundle — see
[docs/DESIGN.md §21](../../docs/DESIGN.md).

This is a separate, independently deployed project. It is **not** part of the
Next.js build and has its own `package.json`.

## 1. Get an API key

- **Shippo** (default): sign up at goshippo.com → API → get a token (test
  tokens start with `shippo_test_`, live tokens with `shippo_live_`)
- **EasyPost**: sign up at easypost.com → API Keys

## 2. Install and configure

```bash
cd workers/shipping-rate-proxy
pnpm install
```

Edit `wrangler.toml`:
- `SHIPPING_PROVIDER` — `"shippo"` or `"easypost"`
- `ALLOWED_ORIGIN` — your site's `baseUrl` from `content/config.ts`, exactly
  (e.g. `https://usedexchangeproject.willsleep.dev`, no trailing slash)
- `ORIGIN_ZIP` / `ORIGIN_COUNTRY` — where your parcels ship from

## 3. Local development

```bash
cp .dev.vars.example .dev.vars   # fill in your test API key
pnpm dev
```

## 4. Deploy

```bash
pnpm wrangler login               # one-time
pnpm wrangler secret put SHIPPO_API_KEY     # or EASYPOST_API_KEY
pnpm deploy
```

`wrangler deploy` prints the Worker's URL
(`https://shipping-rate-proxy.<your-subdomain>.workers.dev`).

## 5. Enable in the site

In `content/config.ts`, uncomment the `shipping` block and set:

```ts
shipping: {
  enabled: true,
  proxyUrl: "https://shipping-rate-proxy.<your-subdomain>.workers.dev",
  defaultPayer: "buyer", // or "seller"
  origin: { zip: "94103", country: "US" },
},
```

Or run `/setup-shipping` for a guided walkthrough.

## API contract

`POST /` with body:

```json
{
  "destinationZip": "10001",
  "destinationCountry": "US",
  "weight": { "value": 0.8, "unit": "kg" },
  "dimensions": { "length": 45, "width": 15, "height": 15, "unit": "cm" },
  "currency": "USD"
}
```

Returns the cheapest available rate:

```json
{
  "amount": 12.50,
  "currency": "USD",
  "carrier": "USPS",
  "service": "Priority Mail",
  "estimatedDays": 2
}
```
