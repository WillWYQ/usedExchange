"use client";

import { useState } from "react";
import { IconMessageCircle } from "@tabler/icons-react";
import { siteConfig } from "@/content/config";
import type { Item } from "@/lib/content/types";
import { resolveItemPrice } from "@/lib/utils/pricing";
import { useGeolocation } from "@/components/pricing/useGeolocation";
import { useDistancePricing } from "@/components/pricing/useDistancePricing";
import { PlatformButton } from "./PlatformButton";

type ContactSectionProps = {
  // Item context — omit for footer usage. Never pass reserved_for.
  item?: Item;
  // Item-level overrides. Pass [] / "" for footer usage.
  preferredPayment?: string[];
  contactNote?: string;
};

export function ContactSection({
  item,
  preferredPayment = [],
  contactNote = "",
}: ContactSectionProps) {
  const { reveal_behavior, platforms } = siteConfig.contact;
  const [revealed, setRevealed] = useState(reveal_behavior === "always");

  // Geo state for price pre-fill. The browser returns cached position instantly
  // (maximumAge: 300_000 in useGeolocation), so there is no second permission prompt.
  const geoState = useGeolocation();
  const { resolved } = useDistancePricing(siteConfig.location, geoState);
  const resolvedTier = item ? (resolveItemPrice(item.price, resolved) ?? undefined) : undefined;

  if (platforms.length === 0) return null;

  const isSold = item?.status === "sold";
  const contactLabel =
    siteConfig.i18n.strings.contactSeller || "Contact Seller";

  return (
    <div className="flex flex-col gap-4">
      {/* Toggle button — shown only when reveal_behavior is "click" and not yet revealed */}
      {!revealed && (
        <button
          onClick={() => setRevealed(true)}
          disabled={isSold}
          className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <IconMessageCircle size={16} />
          {isSold ? "Item sold" : contactLabel}
        </button>
      )}

      {revealed && (
        <div className="flex flex-col gap-3">
          {/* Platform buttons */}
          <div className="flex flex-wrap gap-2">
            {platforms.map((platform, i) => (
              <PlatformButton
                key={i}
                platform={platform}
                item={item ? { name: item.name, price: item.price } : undefined}
                resolvedTier={resolvedTier}
                disabled={isSold}
              />
            ))}
          </div>

          {/* Item-level preferred payment methods */}
          {preferredPayment.length > 0 && (
            <p className="text-xs text-white/50">
              Preferred payment:{" "}
              <span className="text-white/70">
                {preferredPayment.join(", ")}
              </span>
            </p>
          )}

          {/* Item-level contact note */}
          {contactNote && (
            <p className="text-sm text-white/60">{contactNote}</p>
          )}
        </div>
      )}
    </div>
  );
}
