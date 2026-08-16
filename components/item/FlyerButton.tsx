"use client";

import { useState } from "react";
import { IconFileTypePdf, IconCheck } from "@tabler/icons-react";
import { useT } from "@/components/i18n/useT";
import { useDistancePricingContext } from "@/components/pricing/DistancePricingContext";
import { resolveItemPrice } from "@/lib/utils/pricing";
import type { PriceTier } from "@/lib/content/types";
import type { FlyerItemView } from "@/lib/pdf/flyerContent";

type FlyerButtonProps = {
  item: FlyerItemView;
  // Server-computed fallback tier — same role as PricingSection's prop of
  // the same name; used until/unless the client-side resolved tier differs.
  initialResolvedTier: PriceTier | null;
  siteName: string;
  baseUrl: string;
};

type FlyerState = "idle" | "generating" | "success" | "error";

// Browsers old enough to lack Blob object URLs cannot download the generated
// PDF at all — detected once per render rather than only inside the click
// handler, so the button can render disabled instead of clickable-then-failing.
function supportsFlyerDownload(): boolean {
  return typeof URL !== "undefined" && typeof URL.createObjectURL === "function";
}

// Lazily loads jsPDF (via lib/pdf/generateItemFlyer.ts) only when a visitor
// actually clicks — see docs/superpowers/specs/2026-08-16-item-flyer-pdf-design.md §3.2.
// This is a separate, new public-site feature; it does not read or reuse the
// existing Seller Studio catalog PDF export (scripts/lib/pdfCatalog/**).
export function FlyerButton({ item, initialResolvedTier, siteName, baseUrl }: FlyerButtonProps) {
  const t = useT();
  const { resolved } = useDistancePricingContext();
  const [state, setState] = useState<FlyerState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resolvedTier = resolveItemPrice(item.price, resolved) ?? initialResolvedTier;
  const supported = supportsFlyerDownload();

  async function handleClick() {
    setState("generating");
    setErrorMessage(null);

    // Loading the chunk and generating the PDF are separate failure modes
    // (offline/redeploy vs. a generation bug) — each gets its own message
    // (spec §3.6) rather than one generic "something went wrong".
    let flyerModule: typeof import("@/lib/pdf/generateItemFlyer");
    let contentModule: typeof import("@/lib/pdf/flyerContent");
    try {
      [flyerModule, contentModule] = await Promise.all([
        import("@/lib/pdf/generateItemFlyer"),
        import("@/lib/pdf/flyerContent"),
      ]);
    } catch {
      setErrorMessage(t.flyerLoadError);
      setState("error");
      return;
    }

    try {
      const blob = await flyerModule.generateItemFlyerPdf({ item, resolvedTier, siteName, baseUrl });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = contentModule.buildFlyerFilename(item);
      link.click();
      URL.revokeObjectURL(url);

      setState("success");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      setErrorMessage(t.flyerGenerateError);
      setState("error");
    }
  }

  const label =
    state === "generating"
      ? t.generatingFlyer
      : state === "success"
        ? t.flyerDownloaded
        : t.downloadFlyer;

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={() => void handleClick()}
        disabled={!supported || state === "generating"}
        title={!supported ? t.flyerUnsupported : undefined}
        aria-label={label}
        className="inline-flex items-center gap-2 rounded-full border border-foreground/15 px-4 py-2 text-sm text-foreground/60 transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {state === "success" ? <IconCheck size={15} /> : <IconFileTypePdf size={15} />}
        {label}
      </button>
      {state === "error" && errorMessage && (
        <p role="alert" className="text-xs text-[#a8584a]">
          {errorMessage}
        </p>
      )}
      {!supported && (
        <p role="alert" className="text-xs text-foreground/40">
          {t.flyerUnsupported}
        </p>
      )}
    </div>
  );
}
