// Plain Vitest tests for the Worker's fetch handler. No Cloudflare runtime
// needed: this file only uses standard Fetch API globals (Request/Response),
// which Node provides natively — the handler has no KV/D1/other Workers-only
// bindings, so it can be exercised directly.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "./index";

const ALLOWED_ORIGIN = "https://example.com";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    NOTIFICATION_PROVIDER: "discord",
    ALLOWED_ORIGIN,
    SITE_BASE_URL: ALLOWED_ORIGIN,
    DISCORD_WEBHOOK_URL: "https://discord.example/webhook",
    ...overrides,
  };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    itemCategory: "electronics",
    itemSlug: "iphone-14-pro",
    itemName: "iPhone 14 Pro",
    buyerName: "Alice",
    buyerContact: "alice@example.com",
    message: "Is this still available?",
    currency: "USD",
    honeypot: "",
    ...overrides,
  };
}

function post(body: unknown, origin: string | null = ALLOWED_ORIGIN): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (origin !== null) headers["Origin"] = origin;
  return new Request("https://contact-form-proxy.example.workers.dev/", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("contact-form-proxy fetch handler", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("Origin enforcement", () => {
    it("rejects a POST whose Origin header does not match ALLOWED_ORIGIN, without delivering a notification", async () => {
      const res = await worker.fetch(post(validBody(), "https://evil.example"), makeEnv());
      expect(res.status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a POST with no Origin header at all (e.g. curl/script), without delivering a notification", async () => {
      const res = await worker.fetch(post(validBody(), null), makeEnv());
      expect(res.status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("accepts a POST whose Origin header matches ALLOWED_ORIGIN", async () => {
      const res = await worker.fetch(post(validBody(), ALLOWED_ORIGIN), makeEnv());
      expect(res.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("does not gate CORS preflight (OPTIONS) on Origin", async () => {
      const req = new Request("https://contact-form-proxy.example.workers.dev/", {
        method: "OPTIONS",
        headers: { Origin: "https://evil.example" },
      });
      const res = await worker.fetch(req, makeEnv());
      expect(res.status).not.toBe(403);
    });
  });

  describe("honeypot", () => {
    it("returns a generic success without delivering a notification when the honeypot is filled", async () => {
      const res = await worker.fetch(post(validBody({ honeypot: "i-am-a-bot" })), makeEnv());
      const json = (await res.json()) as { ok: boolean };
      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("currency in offer notifications", () => {
    it("uses the item's real currency code, not a hardcoded $, in the Discord embed", async () => {
      await worker.fetch(
        post(validBody({ offerAmount: 45, currency: "GBP" })),
        makeEnv(),
      );
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const payload = JSON.parse(init.body as string);
      const offerField = payload.embeds[0].fields.find((f: { name: string }) => f.name === "Offer");
      expect(offerField.value).toBe("GBP 45");
    });

    it("still renders a plain $ for USD (no double-prefix regression)", async () => {
      await worker.fetch(
        post(validBody({ offerAmount: 45, currency: "USD" })),
        makeEnv(),
      );
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const payload = JSON.parse(init.body as string);
      const offerField = payload.embeds[0].fields.find((f: { name: string }) => f.name === "Offer");
      expect(offerField.value).toBe("$45");
    });

    it("uses the real currency code in the Telegram/email plain-text template too", async () => {
      await worker.fetch(
        post(validBody({ offerAmount: 45, currency: "GBP" })),
        makeEnv({ NOTIFICATION_PROVIDER: "telegram", TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "c" }),
      );
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const payload = JSON.parse(init.body as string);
      expect(payload.text).toContain("Offer: GBP 45");
    });
  });
});
