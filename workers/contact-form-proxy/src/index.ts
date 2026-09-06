// Cloudflare Worker — relays a buyer's enquiry (message and/or offer) from
// the item detail page to the seller via Discord, Telegram, or email.
//
// Why this exists: UsedExchange is a fully static site (no server, no
// credentials in CI). Notification delivery requires a secret — a Discord
// webhook URL, a Telegram bot token, or a Resend API key — that must never
// reach the browser. This Worker holds that secret (via `wrangler secret
// put`) and exposes a minimal, CORS-restricted endpoint the static site can
// call from EnquiryForm. See docs/FEATURES_ROADMAP.md §3.1.
//
// Deliberately stateless: no KV/D1, no rate limiting, no CAPTCHA. See
// README.md's "Not implemented" section for why, and what a seller can add
// later if needed.

export interface Env {
  NOTIFICATION_PROVIDER: "discord" | "telegram" | "email";
  // siteConfig.baseUrl — only this origin may call this Worker.
  ALLOWED_ORIGIN: string;
  // siteConfig.baseUrl — used to build a link back to the live item page in
  // the notification message (the Worker can't import content/config.ts).
  SITE_BASE_URL: string;

  // Discord (secret)
  DISCORD_WEBHOOK_URL?: string;

  // Telegram (secret + var)
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;

  // Email via Resend (secret + vars)
  RESEND_API_KEY?: string;
  NOTIFICATION_EMAIL_TO?: string;
  NOTIFICATION_EMAIL_FROM?: string;
}

type EnquiryRequestBody = {
  itemCategory: string;
  itemSlug: string;
  itemName: string;
  buyerName: string;
  buyerContact: string;
  message: string;
  offerAmount?: number;
  // The item's own price.currency (e.g. "USD", "GBP") — required so
  // formatOfferLine/sendDiscord can label an offer correctly instead of
  // assuming USD.
  currency: string;
  honeypot: string;
};

// Caps the message field to prevent abuse (a wall-of-text submission that
// would otherwise be forwarded verbatim to Discord/Telegram/email).
const MESSAGE_MAX_LENGTH = 2000;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(env.ALLOWED_ORIGIN);

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    // CORS headers only stop a *browser* from reading a cross-origin
    // response — they impose no server-side restriction on who can send the
    // request. A non-browser caller (curl, a script, another server) can hit
    // this endpoint directly with any or no Origin header, so the Origin
    // must actually be checked here to have any enforcement at all.
    if (request.headers.get("Origin") !== env.ALLOWED_ORIGIN) {
      return json({ error: "Forbidden" }, 403, cors);
    }

    if (request.method !== "POST") return json({ error: "Method Not Allowed" }, 405, cors);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400, cors);
    }

    // Honeypot check runs BEFORE full field validation. A hidden field a real
    // visitor never fills — most bots fill every field they can see in the
    // DOM, including this one. A submission with it filled is treated as
    // spam and gets the exact same generic success response as a real
    // submission (same status, same JSON shape), regardless of whether its
    // other fields are even well-formed. This is deliberate: a bot that
    // gets a different response for "honeypot filled" vs "field missing"
    // can learn which check tripped and adapt around it.
    if (isRecord(body) && typeof body["honeypot"] === "string" && body["honeypot"].length > 0) {
      return json({ ok: true }, 200, cors);
    }

    if (!isValidRequest(body)) {
      return json({ error: "Missing or invalid fields" }, 400, cors);
    }

    try {
      const send =
        env.NOTIFICATION_PROVIDER === "telegram"
          ? sendTelegram
          : env.NOTIFICATION_PROVIDER === "email"
            ? sendEmail
            : sendDiscord;

      const delivered = await send(body, env);
      if (!delivered) return json({ error: "Notification delivery failed" }, 502, cors);

      return json({ ok: true }, 200, cors);
    } catch {
      return json({ error: "Notification delivery failed" }, 502, cors);
    }
  },
};

function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data: unknown, status: number, cors: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function isRecord(body: unknown): body is Record<string, unknown> {
  return typeof body === "object" && body !== null;
}

function isValidRequest(body: unknown): body is EnquiryRequestBody {
  if (!isRecord(body)) return false;

  const requiredStrings = [
    "itemCategory",
    "itemSlug",
    "itemName",
    "buyerName",
    "buyerContact",
    "message",
    "currency",
  ] as const;

  for (const key of requiredStrings) {
    const value = body[key];
    if (typeof value !== "string" || value.trim().length === 0) return false;
  }

  if ((body["message"] as string).length > MESSAGE_MAX_LENGTH) return false;

  if (body["offerAmount"] !== undefined) {
    if (typeof body["offerAmount"] !== "number" || !Number.isFinite(body["offerAmount"])) {
      return false;
    }
  }

  return typeof body["honeypot"] === "string";
}

function itemUrl(env: Env, body: EnquiryRequestBody): string {
  return `${env.SITE_BASE_URL.replace(/\/$/, "")}/${body.itemCategory}/${body.itemSlug}`;
}

// Mirrors the client's own display rule (EnquiryForm.tsx's `currencyPrefix`):
// USD renders as a bare "$", every other ISO code renders as "<CODE> " —
// so a GBP/CAD/etc. offer isn't silently mislabeled as US dollars.
function formatOfferAmount(body: EnquiryRequestBody): string {
  const prefix = body.currency === "USD" ? "$" : `${body.currency} `;
  return `${prefix}${body.offerAmount}`;
}

function formatOfferLine(body: EnquiryRequestBody): string {
  return body.offerAmount !== undefined ? `Offer: ${formatOfferAmount(body)}\n` : "";
}

function formatPlainText(body: EnquiryRequestBody, env: Env): string {
  return (
    `New enquiry: ${body.itemName}\n` +
    `${itemUrl(env, body)}\n\n` +
    `From: ${body.buyerName}\n` +
    `Contact: ${body.buyerContact}\n` +
    formatOfferLine(body) +
    `\n${body.message}`
  );
}

// ── Discord ──────────────────────────────────────────────────────────────
async function sendDiscord(body: EnquiryRequestBody, env: Env): Promise<boolean> {
  if (!env.DISCORD_WEBHOOK_URL) return false;

  const res = await fetch(env.DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [
        {
          title: `New enquiry: ${body.itemName}`,
          url: itemUrl(env, body),
          description: body.message,
          fields: [
            { name: "From", value: body.buyerName, inline: true },
            { name: "Contact", value: body.buyerContact, inline: true },
            ...(body.offerAmount !== undefined
              ? [{ name: "Offer", value: formatOfferAmount(body), inline: true }]
              : []),
            { name: "Item", value: `${body.itemCategory}/${body.itemSlug}` },
          ],
        },
      ],
    }),
  });

  return res.ok;
}

// ── Telegram ─────────────────────────────────────────────────────────────
async function sendTelegram(body: EnquiryRequestBody, env: Env): Promise<boolean> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return false;

  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text: formatPlainText(body, env),
    }),
  });

  return res.ok;
}

// ── Email (Resend) ───────────────────────────────────────────────────────
async function sendEmail(body: EnquiryRequestBody, env: Env): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.NOTIFICATION_EMAIL_TO || !env.NOTIFICATION_EMAIL_FROM) {
    return false;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.NOTIFICATION_EMAIL_FROM,
      to: env.NOTIFICATION_EMAIL_TO,
      subject: `New enquiry: ${body.itemName}`,
      text: formatPlainText(body, env),
    }),
  });

  return res.ok;
}
