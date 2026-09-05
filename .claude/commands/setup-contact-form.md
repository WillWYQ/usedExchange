# Skill: /setup-contact-form — Contact Form / Enquiry Relay Setup

## Trigger

This skill activates when the seller runs `/setup-contact-form` or asks to:
- "let buyers message me from the item page"
- "set up the enquiry form"
- "add a contact form to my listings"
- "I deployed the contact-form Worker, now what"
- "switch my notification provider to Discord/Telegram/email"
- "disable the enquiry form"

---

## What This Skill Does

Walks the seller through enabling the **optional** buyer enquiry form (a form on
each item detail page that relays messages to the seller via Discord,
Telegram, or email through a Cloudflare Worker proxy). Covers:

1. Deciding whether to enable the feature at all (it's off by default and
   changes nothing if skipped)
2. Picking a notification provider (Discord webhook, Telegram bot, or Resend
   email) and getting its credentials
3. Deploying the Cloudflare Worker proxy that holds the notification secret
   (one-time, outside `content/`)
4. Configuring `siteConfig.notifications` in `content/config.ts` (enabled
   flag + proxy URL)
5. Confirming the footer `ContactSection` is untouched — this feature only
   adds a new form on item detail pages, it does not change the existing
   platform-buttons contact flow anywhere

**Output:** An updated `content/config.ts`. No other files are written by
this skill.

Full design reference: [docs/FEATURES_ROADMAP.md §3.1](../../docs/FEATURES_ROADMAP.md)
([docs/FEATURES_ROADMAP_zh.md §3.1](../../docs/FEATURES_ROADMAP_zh.md) for
Chinese) and [workers/contact-form-proxy/README.md](../../workers/contact-form-proxy/README.md).

---

## Step 0 — Idempotency Check

**Before asking anything**, read `content/config.ts`:

- If a `notifications` block exists and is **`enabled: true`**: summarise the
  current `proxyUrl` and ask what the seller wants to change — switch
  provider (a Worker-side change, see Step 2), update the proxy URL, or
  disable the feature entirely.
- If `notifications` is **absent or `enabled: false`**: this is a first-time
  setup — proceed from Step 1.
- If the seller just wants to **disable** it: set `notifications.enabled:
  false` (keep the rest of the block so it's easy to re-enable later),
  confirm, and stop.

---

## Step 1 — Confirm the Seller Wants This

Explain briefly, then ask for a yes/no:

> This adds a "Send an Enquiry" form to every item detail page, so buyers can
> message you (with an optional offer amount) without needing to know your
> contact handles up front. It requires deploying a small, free Cloudflare
> Worker that holds your notification-delivery secret — that secret must
> never be in the site's public files.
>
> This is separate from your existing contact buttons (email/Instagram/
> Discord/etc. in "Contact Seller") — those keep working exactly as they do
> today, on every page including the footer. The enquiry form is an
> additional option on item pages only.
>
> Want to set this up now? (yes / no — you can run `/setup-contact-form`
> again anytime)

If **no**: stop here. The site behaves exactly as before — nothing to undo.

---

## Step 2 — Choose a Notification Provider

Ask:

> **How do you want to be notified of new enquiries?**
> 1. Discord — posted to a channel via a webhook (recommended if you're
>    already on Discord)
> 2. Telegram — sent to a chat via a bot
> 3. Email — sent via [Resend](https://resend.com)'s API

Then, depending on the choice, walk the seller through
`workers/contact-form-proxy/README.md`'s "Choose a notification provider"
section at a high level — these are things the seller does themselves
outside this skill:

- **Discord**: create a webhook in their server (Server Settings →
  Integrations → Webhooks → New Webhook) and copy its URL
- **Telegram**: message [@BotFather](https://t.me/BotFather) to create a bot
  and get its token, then find their chat id via
  `https://api.telegram.org/bot<token>/getUpdates`
- **Email**: sign up at [resend.com](https://resend.com), create an API key,
  and verify a sending domain (or use their test domain during development)

---

## Step 3 — Cloudflare Worker Proxy

Ask:

> Have you already deployed `workers/contact-form-proxy` and have its URL
> (something like `https://contact-form-proxy.<your-subdomain>.workers.dev`)?

**If not deployed yet**, walk them through
`workers/contact-form-proxy/README.md` at a high level — these are terminal
commands the seller runs themselves, not files this skill writes:

1. `cd workers/contact-form-proxy && pnpm install`
2. Edit `workers/contact-form-proxy/wrangler.toml`: set
   `NOTIFICATION_PROVIDER` (`"discord"` | `"telegram"` | `"email"`),
   `ALLOWED_ORIGIN` and `SITE_BASE_URL` (their site's `baseUrl` from
   `content/config.ts`, no trailing slash), and — depending on the provider
   — `TELEGRAM_CHAT_ID` or `NOTIFICATION_EMAIL_TO`/`NOTIFICATION_EMAIL_FROM`
3. `pnpm wrangler login` (one-time)
4. `pnpm wrangler secret put DISCORD_WEBHOOK_URL` (or `TELEGRAM_BOT_TOKEN` /
   `RESEND_API_KEY`, matching the chosen provider) — paste the secret when
   prompted
5. `pnpm deploy` — prints the Worker URL

> ⚠️ Steps 1–5 happen in `workers/contact-form-proxy/` and are **not** part
> of `content/` — this skill only reads back the resulting URL, it does not
> run these commands or edit Worker files for you.

If the seller isn't ready to deploy the Worker yet, you can still complete
Step 4 below using a placeholder `proxyUrl` and tell them to come back and
update it once deployed — but `notifications.enabled` should stay `false`
until a real `proxyUrl` is set.

---

## Step 4 — Update `content/config.ts`

In `content/config.ts`, find the `notifications` block (it sits right after
the shipping calculator section and before `contact:`) and set:

```ts
notifications: {
  enabled: true,
  proxyUrl: "{{proxyUrl}}",
},
```

Show the diff and confirm before writing. This is the **only required edit**
to `content/config.ts` for this feature.

---

## Step 5 — Verify

After writing the change, tell the seller to run, in order:
1. `pnpm type-check` — confirms `content/config.ts` is valid
2. `pnpm dev` → open any item page → confirm the "Send an Enquiry" form
   appears below "Contact Seller", and that submitting a test message
   (with a throwaway name/contact) results in a notification landing in
   the configured Discord channel / Telegram chat / inbox
3. Confirm the footer's "Contact Seller" (which has no item context) still
   renders exactly as before, with no enquiry form attached to it

---

## Edge Cases

| Situation | Handling |
|---|---|
| `proxyUrl` unreachable / Worker not deployed | The form will show its inline error message ("Something went wrong…") on submit — not a build error; remind the seller to finish Step 3 |
| Seller wants to switch provider later | That's a Worker-side change (`wrangler.toml` `NOTIFICATION_PROVIDER` + new secret) — `content/config.ts` doesn't need to change |
| Item is priced `negotiable: true` | The enquiry form automatically shows an optional offer-amount field for that item; no extra config needed |
| Seller is getting spammed | This Worker deliberately has no rate limiting or CAPTCHA (see its README's "Not implemented" section) — the honeypot field plus `ALLOWED_ORIGIN` restriction is the v1 spam bar. Point the seller to Cloudflare Turnstile or a dashboard-level rate-limiting rule as an infra-level next step, not a code change here |
