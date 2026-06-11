"use client";

import { useState } from "react";
import {
  IconBrandDiscord,
  IconBrandFacebook,
  IconBrandInstagram,
  IconBrandLine,
  IconBrandLinkedin,
  IconBrandSnapchat,
  IconBrandTiktok,
  IconBrandTwitter,
  IconBrandWechat,
  IconBrandWhatsapp,
  IconBrandX,
  IconBrandYoutube,
  IconCash,
  IconMail,
  IconQrcode,
} from "@tabler/icons-react";
import type { Platform } from "@/lib/config/types";
import type { PriceTier, Price } from "@/lib/content/types";
import { QRModal } from "./QRModal";

type PlatformButtonProps = {
  platform: Platform;
  // Optional item context for pre-filled messages.
  item?: { name: string; price: Price };
  resolvedTier?: PriceTier;
  disabled?: boolean;
};

const PLATFORM_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  email: IconMail,
  discord: IconBrandDiscord,
  facebook: IconBrandFacebook,
  instagram: IconBrandInstagram,
  snapchat: IconBrandSnapchat,
  whatsapp: IconBrandWhatsapp,
  twitter: IconBrandX,
  tiktok: IconBrandTiktok,
  linkedin: IconBrandLinkedin,
  youtube: IconBrandYoutube,
  venmo: IconCash,
  zelle: IconQrcode,
  wechat: IconBrandWechat,
  line: IconBrandLine,
};

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

function formatPrice(tier: PriceTier, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(tier.amount);
  } catch {
    return `$${tier.amount}`;
  }
}

// Matches a pasted Facebook profile/page URL, capturing the "path?query" tail
// (e.g. "profile.php?id=100012345678" or "your.username").
const FACEBOOK_URL = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:facebook\.com|fb\.me)\/(.+)$/i;

// Matches a pasted LinkedIn profile/company URL, capturing the "path" tail
// (e.g. "in/jane-doe" or "company/acme").
const LINKEDIN_URL = /^(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(.+)$/i;

/**
 * Normalizes a Facebook/LinkedIn config `value` into a URL path + query.
 *
 * Sellers may enter either a bare handle/path (e.g. "in/jane-doe") or a full
 * profile URL copied from their browser (e.g.
 * "https://www.facebook.com/profile.php?id=100012345678"). A plain
 * `encodeURIComponent(value)` breaks both: it turns "in/jane-doe" into
 * "in%2Fjane-doe" (a 404 on LinkedIn), and it double-encodes a pasted URL
 * into a nonsensical "facebook.com/https%3A%2F%2F..." link.
 *
 * `urlPattern` strips a recognized "<scheme>://<www.><platform domain>/"
 * prefix down to its path+query; the remainder is then re-segmented on "/"
 * and each segment is encoded individually, so "/" separators and the query
 * string survive intact.
 */
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

function buildUrl(
  type: string,
  value: string,
  item?: { name: string; price: Price },
  resolvedTier?: PriceTier,
): string {
  const priceStr =
    item && resolvedTier
      ? ` (${formatPrice(resolvedTier, item.price.currency)})`
      : "";

  switch (type) {
    case "email": {
      // Take only the address itself: split on whitespace or a stray "?" so a
      // typo'd config value can't inject extra mailto headers (cc/bcc) after the
      // address. The subject/body we add are encodeURIComponent'd below.
      const addr = (value.split(/[\s?]/)[0] ?? "").trim();
      const subject = encodeURIComponent(`Inquiry: ${item?.name ?? ""}`);
      const body = encodeURIComponent(
        item
          ? `Hi, I'm interested in your ${item.name}${priceStr ? ` listed at ${priceStr.trim()}` : ""}. Is it still available?`
          : "",
      );
      return item
        ? `mailto:${addr}?subject=${subject}&body=${body}`
        : `mailto:${addr}`;
    }
    case "discord":
      return `https://discord.com/users/${encodeURIComponent(value)}`;
    case "facebook":
      return `https://facebook.com/${normalizeProfilePath(value, FACEBOOK_URL)}`;
    case "instagram":
      return `https://instagram.com/${encodeURIComponent(value)}`;
    case "snapchat":
      return `https://snapchat.com/add/${encodeURIComponent(value)}`;
    case "whatsapp": {
      const phone = encodeURIComponent(value.replace(/^\+/, ""));
      if (!item) return `https://wa.me/${phone}`;
      const text = encodeURIComponent(
        `Hi, I'm interested in your ${item.name}${priceStr}. Is it still available?`,
      );
      return `https://wa.me/${phone}?text=${text}`;
    }
    case "twitter":
      return `https://x.com/${encodeURIComponent(value)}`;
    case "tiktok":
      return `https://tiktok.com/${encodeURIComponent(value)}`;
    case "linkedin": {
      const path = normalizeProfilePath(value, LINKEDIN_URL);
      // Bare handles (no "in/", "company/", "school/" or "pub/" prefix)
      // default to a personal profile, matching LinkedIn's own URL scheme.
      const hasProfileType = /^(in|company|school|pub)\//i.test(path);
      return `https://linkedin.com/${hasProfileType ? path : `in/${path}`}`;
    }
    case "youtube":
      return `https://youtube.com/${encodeURIComponent(value)}`;
    case "venmo": {
      const base = `https://venmo.com/u/${encodeURIComponent(value)}`;
      if (!item) return base;
      const note = encodeURIComponent(item.name);
      return `${base}?txn=pay&audience=private&note=${note}`;
    }
    default:
      return "#";
  }
}

const BUTTON_BASE =
  "inline-flex min-h-12 items-center gap-2 rounded-full border-0 px-5 py-3 text-sm text-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50 disabled:cursor-not-allowed disabled:opacity-40";

export function PlatformButton({
  platform,
  item,
  resolvedTier,
  disabled = false,
}: PlatformButtonProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const Icon = PLATFORM_ICONS[platform.type] ?? IconBrandTwitter;
  const label =
    platform.label ?? PLATFORM_LABELS[platform.type] ?? platform.type;

  // QR mode: render <button> that opens the modal.
  // Condition: qr_image present OR (type has no URL pattern like "zelle").
  const isQr = Boolean(platform.qr_image);

  if (isQr) {
    return (
      <>
        <button
          onClick={() => setModalOpen(true)}
          disabled={disabled}
          className={BUTTON_BASE}
          aria-label={`Show ${label} QR code`}
        >
          <Icon size={16} />
          {label}
        </button>

        {modalOpen && (
          <QRModal
            imageSrc={platform.qr_image!}
            label={label}
            onClose={() => setModalOpen(false)}
          />
        )}
      </>
    );
  }

  // Link mode: render <a>.
  const href = buildUrl(
    platform.type,
    platform.value ?? "",
    item,
    resolvedTier,
  );

  return (
    <a
      href={href}
      target={platform.type === "email" ? undefined : "_blank"}
      rel={platform.type === "email" ? undefined : "noopener noreferrer"}
      aria-label={label}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : undefined}
      className={BUTTON_BASE}
      style={disabled ? { pointerEvents: "none" } : undefined}
    >
      <Icon size={16} />
      {label}
    </a>
  );
}
