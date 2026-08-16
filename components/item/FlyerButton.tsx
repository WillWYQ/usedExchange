"use client";

import { useEffect, useRef, useState } from "react";
import { IconFileTypePdf, IconCheck } from "@tabler/icons-react";
import { useT } from "@/components/i18n/useT";
import { useDistancePricingContext } from "@/components/pricing/DistancePricingContext";
import { useMeasurementUnit } from "@/components/units/useMeasurementUnit";
import { resolveItemPrice } from "@/lib/utils/pricing";
import type { PriceTier } from "@/lib/content/types";
import { buildFlyerFilename, DEFAULT_FLYER_LABELS, type FlyerItemView, type FlyerLabels } from "@/lib/pdf/flyerContent";

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
// PDF at all. Node (SSG) has a global URL without createObjectURL too, so
// this only ever returns a meaningful `false` in the browser — see the
// useEffect-based re-check in the component below.
function supportsFlyerDownload(): boolean {
  return typeof URL !== "undefined" && typeof URL.createObjectURL === "function";
}

// Lazily loads jsPDF (via lib/pdf/generateItemFlyer.ts) only when a visitor
// actually clicks — see docs/superpowers/specs/2026-08-16-item-flyer-pdf-design.md §3.2.
// This is a separate, new public-site feature; it does not read or reuse the
// existing Seller Studio catalog PDF export (scripts/lib/pdfCatalog/**).
//
// lib/pdf/flyerContent.ts is imported statically (unlike lib/pdf/generateItemFlyer.ts)
// — it's pure, has no jsPDF/DOM dependency, and app/[category]/[item]/page.tsx
// already imports it eagerly for toFlyerItemView(), so dynamically importing
// it here again would only add an extra failure mode to the "could not load
// the flyer generator" branch for a module that cannot realistically fail to load.
export function FlyerButton({ item, initialResolvedTier, siteName, baseUrl }: FlyerButtonProps) {
  const t = useT();
  const { resolved } = useDistancePricingContext();
  const { unit: unitSystem } = useMeasurementUnit();
  const [state, setState] = useState<FlyerState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Matches the server-rendered default (true) so hydration never mismatches;
  // corrected to the real value after mount, see the effect below.
  const [supported, setSupported] = useState(true);
  const revertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSupported(supportsFlyerDownload());
  }, []);

  useEffect(() => {
    return () => {
      if (revertTimeoutRef.current) clearTimeout(revertTimeoutRef.current);
    };
  }, []);

  const resolvedTier = resolveItemPrice(item.price, resolved) ?? initialResolvedTier;

  const labels: FlyerLabels = {
    contactForPrice: t.contactForPrice,
    obo: t.obo,
    brand: t.brand,
    model: t.model,
    color: t.color,
    age: t.age,
    dimensions: t.dimensions,
    weight: t.weight,
    conditionLabel: DEFAULT_FLYER_LABELS.conditionLabel,
    conditionNew: t.conditionNew,
    conditionLikeNew: t.conditionLikeNew,
    conditionGood: t.conditionGood,
    conditionFair: t.conditionFair,
    conditionForParts: t.conditionForParts,
    viewLiveListing: DEFAULT_FLYER_LABELS.viewLiveListing,
  };

  async function handleClick() {
    if (revertTimeoutRef.current) clearTimeout(revertTimeoutRef.current);
    setState("generating");
    setErrorMessage(null);

    // Loading the chunk and generating the PDF are separate failure modes
    // (offline/redeploy vs. a generation bug) — each gets its own message
    // (spec §3.6) rather than one generic "something went wrong".
    let flyerModule: typeof import("@/lib/pdf/generateItemFlyer");
    try {
      flyerModule = await import("@/lib/pdf/generateItemFlyer");
    } catch {
      setErrorMessage(t.flyerLoadError);
      setState("error");
      return;
    }

    try {
      const blob = await flyerModule.generateItemFlyerPdf({
        item,
        resolvedTier,
        siteName,
        baseUrl,
        unitSystem,
        labels,
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = buildFlyerFilename(item);
      link.click();
      // Deferred rather than called immediately after click(): revoking the
      // object URL synchronously can race the browser's download start in
      // some engines and cancel it.
      setTimeout(() => URL.revokeObjectURL(url), 0);

      setState("success");
      revertTimeoutRef.current = setTimeout(() => setState("idle"), 2500);
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
        type="button"
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
      {!supported && <p className="text-xs text-foreground/40">{t.flyerUnsupported}</p>}
    </div>
  );
}
