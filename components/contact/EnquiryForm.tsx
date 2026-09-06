"use client";

import { useState } from "react";
import { IconSend } from "@tabler/icons-react";
import { siteConfig } from "@/content/config";
import type { Item } from "@/lib/content/types";
import { useT } from "@/components/i18n/useT";

type EnquiryFormProps = {
  item: Item;
};

type Status = "idle" | "submitting" | "success" | "error";

// Buyer-initiated enquiry form for the item detail page — posts to the
// seller's contact-form-proxy Worker (siteConfig.notifications.proxyUrl),
// which relays the message to Discord/Telegram/email. Rendered by the item
// detail page only when siteConfig.notifications?.enabled and ?.proxyUrl are
// both truthy; this component itself doesn't re-check that gate, matching
// how ShippingEstimator/MakeOfferButton are gated by their callers.
//
// Never used for the footer's ContactSection (no `item` context there) —
// see the item detail page for how the two are composed side by side.
export function EnquiryForm({ item }: EnquiryFormProps) {
  const t = useT();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [offerAmount, setOfferAmount] = useState("");
  // Hidden honeypot field — a real visitor never sees or fills this, but a
  // bot that blindly fills every input it finds in the DOM will. See the
  // off-screen-but-focusable markup below for why this isn't display:none
  // or type="hidden".
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  const showOfferField = item.price.negotiable;
  const currencyPrefix = item.price.currency === "USD" ? "$" : `${item.price.currency} `;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;

    const proxyUrl = siteConfig.notifications?.proxyUrl ?? "";
    if (!proxyUrl) {
      setStatus("error");
      return;
    }

    const trimmedOffer = offerAmount.trim();
    let parsedOffer: number | null = null;
    if (showOfferField && trimmedOffer !== "") {
      parsedOffer = Number(trimmedOffer);
      if (!Number.isFinite(parsedOffer)) {
        // input[type=number] already sanitizes anything that doesn't parse
        // as a float back to "" (verified: this is why a plain typo can't
        // reach here as literal garbage) — but it does NOT reject syntax
        // that's valid-but-overflows, e.g. scientific notation like "1e400"
        // parses to Infinity. Fail loudly rather than silently omitting the
        // offer and showing a false "sent" confirmation, matching the same
        // Number.isFinite guard the Worker already enforces server-side.
        setStatus("error");
        return;
      }
    }

    setStatus("submitting");

    try {
      const res = await fetch(proxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemCategory: item.categorySlug,
          itemSlug: item.itemSlug,
          itemName: item.name,
          buyerName: name.trim(),
          buyerContact: contact.trim(),
          message: message.trim(),
          ...(parsedOffer !== null ? { offerAmount: parsedOffer } : {}),
          currency: item.price.currency,
          honeypot,
        }),
      });

      if (!res.ok) throw new Error(`Enquiry failed: ${res.status}`);

      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-xl border border-foreground/10 bg-foreground/5 p-4 text-sm text-foreground/80">
        {t.enquirySuccess}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border border-foreground/10 bg-foreground/5 p-4"
    >
      <h3 className="text-sm font-semibold text-foreground/80">{t.enquiryFormHeading}</h3>

      {/* Off-screen-but-focusable honeypot — NOT display:none/visibility:hidden
          (some bots skip fields hidden that way) and NOT type="hidden"
          (some bots skip that too). Positioned far off-screen instead, and
          kept out of the tab order / accessibility tree for real visitors. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: "-9999px" }}>
        <label htmlFor="enquiry-website">Leave this field blank</label>
        <input
          id="enquiry-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="enquiry-name" className="text-xs text-foreground/60">
          {t.enquiryNameLabel}
        </label>
        <input
          id="enquiry-name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-foreground/10 bg-background/40 px-3 py-1.5 text-sm text-foreground placeholder:text-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="enquiry-contact" className="text-xs text-foreground/60">
          {t.enquiryContactLabel}
        </label>
        <input
          id="enquiry-contact"
          type="text"
          required
          placeholder={t.enquiryContactPlaceholder}
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          className="rounded-lg border border-foreground/10 bg-background/40 px-3 py-1.5 text-sm text-foreground placeholder:text-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="enquiry-message" className="text-xs text-foreground/60">
          {t.enquiryMessageLabel}
        </label>
        <textarea
          id="enquiry-message"
          required
          rows={3}
          maxLength={2000}
          placeholder={t.enquiryMessagePlaceholder}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="resize-y rounded-lg border border-foreground/10 bg-background/40 px-3 py-1.5 text-sm text-foreground placeholder:text-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
        />
      </div>

      {showOfferField && (
        <div className="flex flex-col gap-1">
          <label htmlFor="enquiry-offer" className="text-xs text-foreground/60">
            {t.enquiryOfferLabel}
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-foreground/50">{currencyPrefix}</span>
            <input
              id="enquiry-offer"
              type="number"
              min={1}
              step={1}
              value={offerAmount}
              onChange={(e) => setOfferAmount(e.target.value)}
              placeholder="Enter amount"
              className="flex-1 rounded-lg border border-foreground/10 bg-background/40 px-3 py-1.5 text-sm text-foreground placeholder:text-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
            />
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="inline-flex w-fit items-center gap-2 rounded-full bg-foreground/10 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <IconSend size={15} />
        {status === "submitting" ? t.enquirySubmitting : t.enquirySubmit}
      </button>

      {status === "error" && (
        <p className="text-xs text-[#a8584a] dark:text-accent-soft">{t.enquiryError}</p>
      )}
    </form>
  );
}
