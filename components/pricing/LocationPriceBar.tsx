"use client";

import { useState, useRef, useId } from "react";
import type { GeolocationState, ResolvedDistance } from "@/lib/content/types";

// Earth's antipodal distance (~12,450 mi) — any larger value is meaningless
// for a buyer/seller distance and would push resolveItemPrice into degenerate
// "gap between tiers" branches.
const MAX_MANUAL_MILES = 12_500;

type LocationPriceBarProps = {
  geoState: GeolocationState;
  resolved: ResolvedDistance;
  // Call with a positive number to set a manual distance override.
  // Call with null to clear the override and revert to detected / fallback.
  onManualMiles: (miles: number | null) => void;
};

// Narrows ResolvedDistance to the two variants that carry a `miles` field —
// avoids repeated `as { source: "..."; miles: number }` casts below.
function hasMiles(r: ResolvedDistance): r is Extract<ResolvedDistance, { miles: number }> {
  return r.source === "detected" || r.source === "manual";
}

// Renders one of four states reflecting the current geolocation + distance resolution:
//
//   idle / pending  → spinner + "Detecting location…"
//   granted         → detected distance + "Enter manually" toggle
//   manual          → editable distance input + clear button
//   fallback        → explanation + "Enter distance" toggle
//       (fallback covers denied + unavailable + the initial idle/pending transient)
//
// The manual distance input is shown inline in either granted or fallback contexts
// whenever the user activates it.
export function LocationPriceBar({
  geoState,
  resolved,
  onManualMiles,
}: LocationPriceBarProps) {
  const [showInput, setShowInput] = useState(false);
  const [draft, setDraft] = useState("");
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const isManual = resolved.source === "manual";

  function openInput() {
    setDraft(hasMiles(resolved) ? String(Math.round(resolved.miles)) : "");
    setShowInput(true);
    // Focus after state update
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function closeInput() {
    setShowInput(false);
    setDraft("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const miles = parseFloat(draft);
    if (!isNaN(miles) && miles >= 0 && miles <= MAX_MANUAL_MILES) {
      onManualMiles(miles);
      closeInput();
    }
  }

  function clearManual() {
    onManualMiles(null);
    closeInput();
  }

  // ── Shared inline distance input ──────────────────────────────────────────
  const distanceInput = showInput && (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <label htmlFor={inputId} className="sr-only">
        Distance in miles
      </label>
      <input
        id={inputId}
        ref={inputRef}
        type="number"
        min={0}
        max={MAX_MANUAL_MILES}
        step={0.1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && closeInput()}
        placeholder="0"
        className="w-20 rounded-md border border-foreground/20 bg-foreground/5 px-2 py-1 text-sm text-foreground placeholder-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50"
      />
      <span className="text-sm text-foreground/50">mi</span>
      <button
        type="submit"
        className="rounded-md bg-foreground/10 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50"
      >
        Apply
      </button>
      <button
        type="button"
        onClick={closeInput}
        aria-label="Cancel"
        className="text-xs text-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50"
      >
        ✕
      </button>
    </form>
  );

  // ── State: idle / pending ─────────────────────────────────────────────────
  if (geoState.status === "idle" || geoState.status === "pending") {
    return (
      <div
        className="flex items-center gap-2 text-sm text-foreground/50"
        aria-live="polite"
        aria-label="Location status"
      >
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground/60" />
        Detecting location…
      </div>
    );
  }

  // ── State: granted (detected distance) ────────────────────────────────────
  if (geoState.status === "granted" && !isManual) {
    const miles = resolved.source === "detected" ? resolved.miles : null;

    return (
      <div
        className="flex flex-wrap items-center gap-3 text-sm"
        aria-live="polite"
        aria-label="Location status"
      >
        <span className="flex items-center gap-1.5 text-foreground/70">
          <PinIcon />
          {miles !== null ? (
            <>
              <span className="font-medium text-foreground">{miles.toFixed(1)} mi</span>
              {" from seller"}
            </>
          ) : (
            "Location detected"
          )}
        </span>
        {showInput ? (
          distanceInput
        ) : (
          <button
            type="button"
            onClick={openInput}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openInput()}
            className="text-xs text-foreground/40 underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50"
          >
            Enter manually
          </button>
        )}
      </div>
    );
  }

  // ── State: manual distance override ──────────────────────────────────────
  if (isManual && resolved.source === "manual") {
    const manualMiles = resolved.miles;

    return (
      <div
        className="flex flex-wrap items-center gap-3 text-sm"
        aria-live="polite"
        aria-label="Location status"
      >
        <span className="flex items-center gap-1.5 text-foreground/70">
          <PinIcon />
          {showInput ? null : (
            <>
              <span className="font-medium text-foreground">{manualMiles.toFixed(1)} mi</span>
              {" (manual)"}
            </>
          )}
        </span>
        {showInput ? (
          distanceInput
        ) : (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={openInput}
              className="text-xs text-foreground/40 underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={clearManual}
              className="text-xs text-foreground/40 underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50"
            >
              Clear
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── State: fallback (denied / unavailable) ────────────────────────────────
  return (
    <div
      className="flex flex-wrap items-center gap-3 text-sm"
      aria-live="polite"
      aria-label="Location status"
    >
      <span className="flex items-center gap-1.5 text-foreground/50">
        <PinIcon />
        Prices shown at pickup rate
      </span>
      {showInput ? (
        distanceInput
      ) : (
        <button
          type="button"
          onClick={openInput}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openInput()}
          className="text-xs text-foreground/60 underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50"
        >
          Enter distance
        </button>
      )}
    </div>
  );
}

function PinIcon() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M8 1.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9ZM2 6a6 6 0 1 1 10.743 3.657L8.35 14.43a.45.45 0 0 1-.7 0L3.257 9.657A5.973 5.973 0 0 1 2 6Zm6-1.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
