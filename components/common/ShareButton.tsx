"use client";

import { useState } from "react";
import { IconShare, IconCheck } from "@tabler/icons-react";
import { useT } from "@/components/i18n/useT";

type ShareButtonProps = {
  title: string;
  url?: string; // defaults to window.location.href
};

// Uses navigator.share() on mobile; clipboard fallback on desktop.
// Shows "Copied!" toast for 2 s after copy.
export function ShareButton({ title, url }: ShareButtonProps) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const shareUrl = url ?? window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title, url: shareUrl });
      } catch {
        // User cancelled — not an error
      }
      return;
    }

    // Desktop fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available — silent fail
    }
  }

  return (
    <button
      onClick={handleShare}
      aria-label={copied ? t.linkCopied : t.share}
      className="inline-flex items-center gap-2 rounded-full border border-foreground/15 px-4 py-2 text-sm text-foreground/60 transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50"
    >
      {copied ? <IconCheck size={15} /> : <IconShare size={15} />}
      {copied ? t.copied : t.share}
    </button>
  );
}
