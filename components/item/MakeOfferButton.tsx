"use client";

import { useState } from "react";
import { IconTag } from "@tabler/icons-react";
import { siteConfig } from "@/content/config";
import type { PriceTier } from "@/lib/content/types";

type MakeOfferButtonProps = {
  itemName: string;
  minAcceptableOffer: number;
  currency: string;
  resolvedTier?: PriceTier | null;
};

// Shown when price.negotiable === true AND minAcceptableOffer is set (item detail page).
// Client-side threshold check — offers below minimum are rejected without sending anything.
export function MakeOfferButton({
  itemName,
  minAcceptableOffer,
  currency,
  resolvedTier,
}: MakeOfferButtonProps) {
  const [open, setOpen] = useState(false);
  const [offerValue, setOfferValue] = useState("");
  const [status, setStatus] = useState<"idle" | "rejected" | "prefilled">(
    "idle",
  );

  const makeOfferLabel = siteConfig.i18n.strings.makeOffer || "Make an Offer";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(offerValue);
    // Number.isFinite rejects NaN *and* ±Infinity (e.g. pasted "1e999"); the
    // upper bound guards against absurd values that would produce a garbled
    // prefilled message (`$Infinity` survives `isNaN`/`isFinite` checks alone).
    if (
      !Number.isFinite(amount) ||
      amount < minAcceptableOffer ||
      amount > 1_000_000
    ) {
      setStatus("rejected");
      return;
    }

    // Pre-fill the first available contact platform (WhatsApp → email fallback).
    // The buyer is taken to the contact section to complete the conversation.
    const platform = siteConfig.contact.platforms.find(
      (p) => p.type === "whatsapp" || p.type === "email",
    );

    const message = `I'd like to offer $${amount} for ${itemName}.`;

    if (platform?.type === "whatsapp" && platform.value) {
      const phone = platform.value.replace(/^\+/, "");
      const text = encodeURIComponent(message);
      window.open(`https://wa.me/${phone}?text=${text}`, "_blank", "noopener,noreferrer");
    } else if (platform?.type === "email" && platform.value) {
      const subject = encodeURIComponent(`Offer for: ${itemName}`);
      const body = encodeURIComponent(message);
      // mailto: links spawn a blank tab/window when opened via window.open
      // (the mail client takes over the new context, leaving an empty tab
      // behind). Navigating the current document is the standard pattern.
      window.location.href = `mailto:${platform.value}?subject=${subject}&body=${body}`;
    }

    setStatus("prefilled");
    setOpen(false);
  }

  const priceHint = resolvedTier
    ? ` (listed at $${resolvedTier.amount})`
    : "";

  return (
    <div>
      <button
        onClick={() => { setOpen((o) => !o); setStatus("idle"); }}
        className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm text-white/70 transition-colors hover:border-white/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
      >
        <IconTag size={15} />
        {makeOfferLabel}
      </button>

      {open && (
        <form
          onSubmit={handleSubmit}
          className="mt-3 flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-4"
        >
          <label
            htmlFor="offer-amount"
            className="text-xs text-white/60"
          >
            Your offer{priceHint}
          </label>

          <div className="flex items-center gap-2">
            <span className="text-sm text-white/50">{currency === "USD" ? "$" : currency}</span>
            <input
              id="offer-amount"
              type="number"
              min={1}
              step={1}
              value={offerValue}
              onChange={(e) => { setOfferValue(e.target.value); setStatus("idle"); }}
              placeholder="Enter amount"
              className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            />
            <button
              type="submit"
              className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              Send
            </button>
          </div>

          {status === "rejected" && (
            <p className="text-xs text-red-400">
              That offer is below the minimum we can accept. Please try a higher amount.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
