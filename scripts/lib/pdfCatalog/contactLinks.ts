import type { Platform } from "../../../lib/config/types";

// Pure, offline resolution of a seller's contact platforms into the same URLs
// the live storefront produces, for use by the catalog PDF's contact page and
// per-item quick-contact actions.
//
// This is a deliberate re-implementation of components/contact/PlatformButton.tsx's
// buildUrl() rather than an import: PlatformButton is a "use client" React module
// and cannot be pulled into a Node/tsx script. The URL formats below are kept
// byte-for-byte identical to that function so the PDF never disagrees with the
// seller's own site for the same config value; contactLinks.test.ts asserts that
// parity for the in-scope platforms. If PlatformButton.buildUrl changes, update
// both.

// Default human-readable label per platform type — mirrors PLATFORM_LABELS in
// PlatformButton.tsx.
const PLATFORM_LABELS: Record<string, string> = {
  email: "Email",
  discord: "Discord",
  facebook: "Facebook",
  instagram: "Instagram",
  snapchat: "Snapchat",
  whatsapp: "WhatsApp",
  twitter: "Twitter",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  venmo: "Venmo",
  zelle: "Zelle",
  wechat: "WeChat",
  line: "LINE",
};

const FACEBOOK_URL = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:facebook\.com|fb\.me)\/(.+)$/i;
const LINKEDIN_URL = /^(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(.+)$/i;

// Verbatim port of PlatformButton.tsx's normalizeProfilePath — so a pasted
// profile URL and a bare handle both resolve the way the live site resolves
// them (per-segment encoding that keeps "/" separators and the query string).
function normalizeProfilePath(value: string, urlPattern: RegExp): string {
  const trimmed = value.trim().replace(/^\/+/, "");
  const hostMatch = trimmed.match(urlPattern);
  const pathAndQuery = hostMatch?.[1] ?? trimmed;

  const queryIndex = pathAndQuery.indexOf("?");
  const path = queryIndex === -1 ? pathAndQuery : pathAndQuery.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : pathAndQuery.slice(queryIndex);

  const encodedPath = path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return encodedPath + query;
}

/**
 * Extract just the address from a possibly-messy email config value: take the
 * first whitespace/`?`-delimited token so a typo'd value can't smuggle extra
 * mailto headers (cc/bcc) after the address. Mirrors the `addr` handling in
 * PlatformButton.buildUrl's email case.
 */
export function sanitizeEmail(value: string): string {
  // Trim first, then take the leading token — identical to PlatformButton's
  // `value.split(...)[0].trim()` for realistic (untrimmed-but-not-leading-space)
  // values, and safer for a stray leading space, which would otherwise yield an
  // empty address.
  return (value.trim().split(/[\s?]/)[0] ?? "").trim();
}

/**
 * The catalog-level URL for a URL/handle platform (no per-item context) — the
 * value a QR on the contact page encodes. Returns null for platforms that have
 * no URL form (e.g. zelle) so callers can fall back to a text label.
 */
function platformUrl(type: string, value: string): string | null {
  switch (type) {
    case "email":
      return `mailto:${sanitizeEmail(value)}`;
    case "discord":
      return `https://discord.com/users/${encodeURIComponent(value)}`;
    case "facebook":
      return `https://facebook.com/${normalizeProfilePath(value, FACEBOOK_URL)}`;
    case "instagram":
      return `https://instagram.com/${encodeURIComponent(value)}`;
    case "snapchat":
      return `https://snapchat.com/add/${encodeURIComponent(value)}`;
    case "whatsapp":
      return `https://wa.me/${encodeURIComponent(value.replace(/^\+/, ""))}`;
    case "twitter":
      return `https://x.com/${encodeURIComponent(value)}`;
    case "tiktok":
      return `https://tiktok.com/${encodeURIComponent(value)}`;
    case "linkedin": {
      const path = normalizeProfilePath(value, LINKEDIN_URL);
      const hasProfileType = /^(in|company|school|pub)\//i.test(path);
      return `https://linkedin.com/${hasProfileType ? path : `in/${path}`}`;
    }
    case "youtube":
      return `https://youtube.com/${encodeURIComponent(value)}`;
    case "venmo":
      return `https://venmo.com/u/${encodeURIComponent(value)}`;
    default:
      return null;
  }
}

/** How a platform can be reached from the PDF. */
export type ContactTarget =
  | { kind: "url"; url: string } // scannable/clickable URL
  | { kind: "image"; qrImagePath: string } // a pre-made qr_image config path (/contact/…)
  | { kind: "text" }; // no scannable form — show the value as text

export type ResolvedPlatform = {
  type: string;
  /** Display label: platform.label ?? default ?? raw type. */
  label: string;
  /** Human-readable value shown beneath a QR/label (address, @handle, or "" ). */
  displayValue: string;
  target: ContactTarget;
};

function displayValueFor(type: string, value: string): string {
  if (type === "email") return sanitizeEmail(value);
  return value;
}

export function resolvePlatform(platform: Platform): ResolvedPlatform {
  const label = platform.label ?? PLATFORM_LABELS[platform.type] ?? platform.type;

  // qr_image-shaped platforms (wechat): embed the seller's pre-made image; do
  // not try to reconstruct a URL from it.
  if (platform.qr_image) {
    return { type: platform.type, label, displayValue: "", target: { kind: "image", qrImagePath: platform.qr_image } };
  }

  const value = platform.value ?? "";
  const url = platformUrl(platform.type, value);
  if (url !== null) {
    return { type: platform.type, label, displayValue: displayValueFor(platform.type, value), target: { kind: "url", url } };
  }
  return { type: platform.type, label, displayValue: value, target: { kind: "text" } };
}

/** Per-item quick-contact seed: the first email address and first discord URL. */
export type ContactActionSeed = {
  email?: string;
  discordUrl?: string;
};

export function resolveContactActionSeed(platforms: Platform[]): ContactActionSeed {
  const seed: ContactActionSeed = {};
  for (const platform of platforms) {
    if (platform.qr_image) continue;
    const value = platform.value ?? "";
    // Skip platforms with an empty/blank value entirely. Capturing one would
    // both suppress a later valid platform of the same type (the `undefined`
    // guards below) and, for discord, produce a truthy-but-dead
    // "https://discord.com/users/" link that would still render as a button.
    if (platform.type === "email") {
      const addr = sanitizeEmail(value);
      if (seed.email === undefined && addr !== "") seed.email = addr;
    }
    if (platform.type === "discord" && value.trim() !== "") {
      if (seed.discordUrl === undefined) {
        seed.discordUrl = `https://discord.com/users/${encodeURIComponent(value.trim())}`;
      }
    }
  }
  return seed;
}

/**
 * A per-item, pre-filled mailto: the buyer's mail composer opens with a subject
 * and body naming the item and linking its live listing. Mirrors the email case
 * of PlatformButton.buildUrl, extended with the live URL in the body per the
 * accessibility spec. Subject/body are English-only (fixed word order), the
 * same limitation every composed sentence in this template already has.
 */
export function buildItemMailto(email: string, itemName: string, liveUrl: string): string {
  const addr = sanitizeEmail(email);
  const subject = encodeURIComponent(`Inquiry: ${itemName}`);
  const body = encodeURIComponent(
    `Hi, I'm interested in your ${itemName} (${liveUrl}). Is it still available?`,
  );
  return `mailto:${addr}?subject=${subject}&body=${body}`;
}
