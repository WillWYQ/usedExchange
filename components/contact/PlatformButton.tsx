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
      const subject = encodeURIComponent(`Inquiry: ${item?.name ?? ""}`);
      const body = encodeURIComponent(
        item
          ? `Hi, I'm interested in your ${item.name}${priceStr ? ` listed at ${priceStr.trim()}` : ""}. Is it still available?`
          : "",
      );
      return item
        ? `mailto:${value}?subject=${subject}&body=${body}`
        : `mailto:${value}`;
    }
    case "discord":
      return `https://discord.com/users/${encodeURIComponent(value)}`;
    case "facebook":
      return `https://facebook.com/${encodeURIComponent(value)}`;
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
    case "linkedin":
      return `https://linkedin.com/${encodeURIComponent(value)}`;
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
  "inline-flex items-center gap-2 rounded-full border border-foreground/15 px-4 py-2 text-sm text-foreground/70 transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50 disabled:cursor-not-allowed disabled:opacity-40";

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
