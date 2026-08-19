import { describe, expect, it } from "vitest";
import type { Platform } from "../../../lib/config/types";
import {
  buildItemMailto,
  resolveContactActionSeed,
  resolvePlatform,
  sanitizeEmail,
} from "./contactLinks";

describe("sanitizeEmail", () => {
  it("keeps a clean address", () => {
    expect(sanitizeEmail("you@example.com")).toBe("you@example.com");
  });
  it("strips smuggled mailto headers after the address", () => {
    expect(sanitizeEmail("you@example.com?cc=evil@x.com")).toBe("you@example.com");
    expect(sanitizeEmail("  you@example.com  extra")).toBe("you@example.com");
  });
});

describe("resolvePlatform — URL formats mirror the live site's PlatformButton.buildUrl", () => {
  const cases: Array<[Platform, string]> = [
    [{ type: "email", value: "you@example.com" }, "mailto:you@example.com"],
    [{ type: "instagram", value: "your_handle" }, "https://instagram.com/your_handle"],
    [{ type: "discord", value: "123456789012345678" }, "https://discord.com/users/123456789012345678"],
    [{ type: "twitter", value: "jack" }, "https://x.com/jack"],
    [{ type: "tiktok", value: "@dance" }, "https://tiktok.com/%40dance"],
    [{ type: "youtube", value: "@chan" }, "https://youtube.com/%40chan"],
    [{ type: "snapchat", value: "ghost" }, "https://snapchat.com/add/ghost"],
    [{ type: "venmo", value: "jane" }, "https://venmo.com/u/jane"],
  ];
  for (const [platform, expected] of cases) {
    it(`${platform.type} → ${expected}`, () => {
      const r = resolvePlatform(platform);
      expect(r.target).toEqual({ kind: "url", url: expected });
    });
  }

  it("whatsapp strips a leading + and encodes digits", () => {
    const r = resolvePlatform({ type: "whatsapp", value: "+1 (555) 000" });
    expect(r.target).toEqual({ kind: "url", url: "https://wa.me/1%20(555)%20000" });
  });

  it("facebook accepts a bare handle", () => {
    const r = resolvePlatform({ type: "facebook", value: "my.page" });
    expect(r.target).toEqual({ kind: "url", url: "https://facebook.com/my.page" });
  });

  it("facebook accepts a pasted profile URL without double-encoding", () => {
    const r = resolvePlatform({
      type: "facebook",
      value: "https://www.facebook.com/profile.php?id=100012345678",
    });
    expect(r.target).toEqual({
      kind: "url",
      url: "https://facebook.com/profile.php?id=100012345678",
    });
  });

  it("linkedin defaults a bare handle to /in/", () => {
    const r = resolvePlatform({ type: "linkedin", value: "jane-doe" });
    expect(r.target).toEqual({ kind: "url", url: "https://linkedin.com/in/jane-doe" });
  });

  it("linkedin keeps an explicit company path", () => {
    const r = resolvePlatform({ type: "linkedin", value: "company/acme" });
    expect(r.target).toEqual({ kind: "url", url: "https://linkedin.com/company/acme" });
  });
});

describe("resolvePlatform — non-URL shapes", () => {
  it("a qr_image platform resolves to an image target carrying the config path", () => {
    const r = resolvePlatform({ type: "wechat", qr_image: "/contact/wechat-qr.png", label: "WeChat" });
    expect(r.target).toEqual({ kind: "image", qrImagePath: "/contact/wechat-qr.png" });
    expect(r.label).toBe("WeChat");
  });

  it("a handle platform with no URL pattern (zelle) resolves to text", () => {
    const r = resolvePlatform({ type: "zelle", value: "pay-me@bank.com" });
    expect(r.target).toEqual({ kind: "text" });
    expect(r.displayValue).toBe("pay-me@bank.com");
  });

  it("uses the platform's own label when provided, else a default", () => {
    expect(resolvePlatform({ type: "email", value: "a@b.com" }).label).toBe("Email");
    expect(resolvePlatform({ type: "email", value: "a@b.com", label: "Reach me" }).label).toBe("Reach me");
    expect(resolvePlatform({ type: "signal", value: "x" }).label).toBe("signal");
  });
});

describe("resolveContactActionSeed", () => {
  it("returns the first email and first discord", () => {
    const seed = resolveContactActionSeed([
      { type: "instagram", value: "ig" },
      { type: "email", value: "first@x.com" },
      { type: "email", value: "second@x.com" },
      { type: "discord", value: "123" },
    ]);
    expect(seed.email).toBe("first@x.com");
    expect(seed.discordUrl).toBe("https://discord.com/users/123");
  });

  it("omits keys when a platform is absent", () => {
    expect(resolveContactActionSeed([{ type: "instagram", value: "ig" }])).toEqual({});
  });

  it("sanitizes the email it captures", () => {
    const seed = resolveContactActionSeed([{ type: "email", value: "a@b.com?cc=x" }]);
    expect(seed.email).toBe("a@b.com");
  });

  it("skips an empty-valued platform so a later valid one still wins", () => {
    const seed = resolveContactActionSeed([
      { type: "email", value: "" },
      { type: "discord", value: "   " },
      { type: "email", value: "real@x.com" },
      { type: "discord", value: "999" },
    ]);
    expect(seed.email).toBe("real@x.com");
    expect(seed.discordUrl).toBe("https://discord.com/users/999");
  });

  it("never produces a dead discord URL from a blank value", () => {
    const seed = resolveContactActionSeed([{ type: "discord", value: "" }]);
    expect(seed.discordUrl).toBeUndefined();
  });
});

describe("buildItemMailto", () => {
  it("encodes an item-specific subject and a body containing the live URL", () => {
    const href = buildItemMailto("you@example.com", "Blue Chair", "https://shop.example/furniture/blue-chair");
    expect(href.startsWith("mailto:you@example.com?")).toBe(true);
    const query = href.slice(href.indexOf("?") + 1);
    const params = new URLSearchParams(query);
    expect(params.get("subject")).toBe("Inquiry: Blue Chair");
    const body = params.get("body") ?? "";
    expect(body).toContain("Blue Chair");
    expect(body).toContain("https://shop.example/furniture/blue-chair");
  });

  it("sanitizes the address so config typos cannot inject headers", () => {
    const href = buildItemMailto("you@example.com?bcc=evil@x.com", "X", "https://s/x");
    expect(href.startsWith("mailto:you@example.com?")).toBe(true);
    expect(href).not.toContain("bcc=evil");
  });
});
