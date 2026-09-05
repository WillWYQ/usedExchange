# contact-form-proxy

A small Cloudflare Worker that relays buyer enquiries from `EnquiryForm` (the
item detail page) to the seller via Discord, Telegram, or email. It exists
because notification-delivery secrets (a Discord webhook URL, a Telegram bot
token, or a Resend API key) must never ship in the browser bundle — see
[docs/FEATURES_ROADMAP.md §3.1](../../docs/FEATURES_ROADMAP.md).

This is a separate, independently deployed project. It is **not** part of the
Next.js build and has its own `package.json`.

## 1. Choose a notification provider

- **Discord** (default): create a webhook in your server → Server Settings →
  Integrations → Webhooks → New Webhook → copy the URL
- **Telegram**: message [@BotFather](https://t.me/BotFather) to create a bot
  and get its token, then message your bot (or add it to a group) and fetch
  your chat id via `https://api.telegram.org/bot<token>/getUpdates`
- **Email**: sign up at [resend.com](https://resend.com) → API Keys, and
  verify a sending domain (or use their test domain during development)

## 2. Install and configure

```bash
cd workers/contact-form-proxy
pnpm install
```

Edit `wrangler.toml`:
- `NOTIFICATION_PROVIDER` — `"discord"`, `"telegram"`, or `"email"`
- `ALLOWED_ORIGIN` — your site's `baseUrl` from `content/config.ts`, exactly
  (e.g. `https://usedexchangeproject.willsleep.dev`, no trailing slash)
- `SITE_BASE_URL` — same as `ALLOWED_ORIGIN`; used to build a link back to
  the live item page in the notification message
- `TELEGRAM_CHAT_ID` — only if using Telegram
- `NOTIFICATION_EMAIL_TO` / `NOTIFICATION_EMAIL_FROM` — only if using email

## 3. Local development

```bash
cp .dev.vars.example .dev.vars   # fill in your secret for the chosen provider
pnpm dev
```

## 4. Deploy

```bash
pnpm wrangler login               # one-time
pnpm wrangler secret put DISCORD_WEBHOOK_URL   # or TELEGRAM_BOT_TOKEN / RESEND_API_KEY
pnpm deploy
```

`wrangler deploy` prints the Worker's URL
(`https://contact-form-proxy.<your-subdomain>.workers.dev`).

## 5. Enable in the site

In `content/config.ts`, find the `notifications` block and set:

```ts
notifications: {
  enabled: true,
  proxyUrl: "https://contact-form-proxy.<your-subdomain>.workers.dev",
},
```

This turns on `EnquiryForm` on every item detail page.

## Environment variables (`wrangler.toml`)

| Variable | Required for | Notes |
|---|---|---|
| `NOTIFICATION_PROVIDER` | always | `"discord"` \| `"telegram"` \| `"email"` |
| `ALLOWED_ORIGIN` | always | Exact site origin; the Worker rejects any other `Origin` |
| `SITE_BASE_URL` | always | Used to build the "view live listing" link in the notification |
| `TELEGRAM_CHAT_ID` | `telegram` | The chat/channel to post into — not secret, but only meaningful for this provider |
| `NOTIFICATION_EMAIL_TO` | `email` | Seller's inbox address |
| `NOTIFICATION_EMAIL_FROM` | `email` | Must be on a domain verified with Resend |

## Secrets (`wrangler secret put <NAME>`)

| Secret | Required for |
|---|---|
| `DISCORD_WEBHOOK_URL` | `discord` |
| `TELEGRAM_BOT_TOKEN` | `telegram` |
| `RESEND_API_KEY` | `email` |

## API contract

`POST /` with body:

```json
{
  "itemCategory": "electronics",
  "itemSlug": "vintage-lamp",
  "itemName": "Vintage Lamp",
  "buyerName": "Jane Doe",
  "buyerContact": "jane@example.com or (555) 123-4567",
  "message": "Is this still available? Would you take $40?",
  "offerAmount": 40,
  "honeypot": ""
}
```

- All fields except `offerAmount` are required, non-empty strings.
- `message` is capped at 2000 characters (rejected with 400 if longer).
- `offerAmount` is optional; when present it must be a finite number.
- `honeypot` must be present as a string. It is a hidden form field a real
  visitor never fills. **A request with a non-empty `honeypot` is treated as
  spam and silently dropped — but the Worker still returns the exact same
  `200 { "ok": true }` response as a real success**, so a bot can't tell its
  submission was rejected.

Returns on success (real or silently-dropped spam):

```json
{ "ok": true }
```

Returns on validation failure:

```json
{ "error": "Missing or invalid fields" }
```

Returns on delivery failure (provider unreachable / misconfigured secret):

```json
{ "error": "Notification delivery failed" }
```

## Why a separate Worker?

Same reasoning as `workers/shipping-rate-proxy/`: UsedExchange is a fully
static export with no server and no way to keep a secret out of CI or the
browser bundle. A tiny, independently deployed Worker is the only place in
this architecture that can hold a secret and be called safely from the
static site.

## Not implemented (by design)

This Worker deliberately has **no persistent storage** (no KV, no D1) and
**no rate limiting or CAPTCHA**. That's a conscious architecture decision,
not an oversight — see the "Backend architecture options" note in
`docs/FEATURES_ROADMAP.md`'s Tier 3 section: this feature was chosen
specifically because a stateless relay needs no database, and adding
persistent state (e.g. Cloudflare KV counters for rate limiting) would break
that property for the whole project.

The honeypot field plus the `ALLOWED_ORIGIN` restriction is the intended spam
bar for v1. If a seller starts getting spammed in practice, the recommended
next steps are **infra-level**, not changes to this Worker's code:
- Add [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) in
  front of the form (a client-side widget + one server-side verification
  call — no storage required, so it doesn't conflict with the stateless
  design above)
- Add a rate-limiting rule at the Cloudflare dashboard level (WAF / Rate
  Limiting Rules), which lives outside this Worker's code entirely

Both are deliberately left for a future pass rather than built here.
