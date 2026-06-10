"use client";

import { useState } from "react";
import { IconMessageCircle } from "@tabler/icons-react";
import { siteConfig } from "@/content/config";
import type { Item } from "@/lib/content/types";
import { resolveItemPrice } from "@/lib/utils/pricing";
import { useDistancePricingContext } from "@/components/pricing/DistancePricingContext";
import { PlatformButton } from "./PlatformButton";
import { useT } from "@/components/i18n/useT";

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
  const t = useT();
  const { reveal_behavior, platforms } = siteConfig.contact;
  const [revealed, setRevealed] = useState(reveal_behavior === "always");

  // Distance state comes from the shared DistancePricingProvider (wrapping the
  // item detail page) so this sibling of PricingSection reads the exact same
  // `resolved` value rather than instantiating its own useGeolocation() call.
  // Footer usage (no `item`, no provider in the tree) gets FALLBACK_VALUE and
  // never triggers a geolocation permission prompt — see DistancePricingContext.
  const { resolved } = useDistancePricingContext();
  const resolvedTier = item ? (resolveItemPrice(item.price, resolved) ?? undefined) : undefined;

  if (platforms.length === 0) return null;

  const isSold = item?.status === "sold";
  const contactLabel = t.contactSeller;

  return (
    <div className="flex flex-col gap-4">
      {/* Toggle button — shown only when reveal_behavior is "click" and not yet revealed */}
      {!revealed && (
        <button
          onClick={() => setRevealed(true)}
          disabled={isSold}
          className="inline-flex min-h-12 w-fit items-center gap-2 rounded-full bg-foreground/10 px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <IconMessageCircle size={16} />
          {isSold ? t.itemSold : contactLabel}
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
            <p className="text-xs text-foreground/50">
              {t.preferredPayment}:{" "}
              <span className="text-foreground/70">
                {preferredPayment.join(", ")}
              </span>
            </p>
          )}

          {/* Item-level contact note */}
          {contactNote && (
            <p className="text-sm text-foreground/60">{contactNote}</p>
          )}
        </div>
      )}
    </div>
  );
}
