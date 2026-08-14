import { useEffect, useState } from "react";
import { useStudioT } from "../i18n/StudioI18n";
import { Button } from "./Button";

export type Tier = {
  label: string;
  miles_min?: number;
  miles_max?: number;
  amount: number;
};

export function isTier(value: unknown): value is Tier {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { label?: unknown }).label === "string"
  );
}

export function isTierArray(value: unknown): value is Tier[] {
  return Array.isArray(value) && value.every(isTier);
}

// Shared by the item edit form (per-item tiers) and the Item defaults pane
// (default tiers). Rows are a staging copy of `initialTiers`: they resync
// whenever that prop changes identity (parent reloaded from disk) or
// `resetToken` bumps (parent's Discard).
export function TierEditor({
  initialTiers,
  resetToken,
  onDirtyChange,
  registerCollector,
}: {
  initialTiers: Tier[];
  /** Bumped by the parent to force rows back to `initialTiers` without the prop changing. */
  resetToken: number;
  onDirtyChange?: (dirty: boolean) => void;
  /** Save calls this to collect the current rows, or null when unchanged. */
  registerCollector: (collect: () => Tier[] | null) => void;
}) {
  const { t } = useStudioT();
  const blank = (): Tier => ({ label: "", amount: 0 });
  const [rows, setRows] = useState<Tier[]>(initialTiers);
  const [baseline, setBaseline] = useState<Tier[]>(initialTiers);

  useEffect(() => {
    setRows(initialTiers);
    setBaseline(initialTiers);
  }, [initialTiers, resetToken]);

  useEffect(() => {
    onDirtyChange?.(JSON.stringify(rows) !== JSON.stringify(baseline));
    registerCollector(() =>
      JSON.stringify(rows) === JSON.stringify(baseline) ? null : rows,
    );
  }, [rows, baseline, onDirtyChange, registerCollector]);
  // Both props must be referentially stable or this effect re-runs on every
  // parent render. Parents keep the collector in a ref for exactly that
  // reason — storing it in state made each registration re-render the parent,
  // which handed down a new registerCollector, which re-ran this effect:
  // React logged "Maximum update depth exceeded" every time the drawer opened.

  const setRow = (index: number, next: Tier) =>
    setRows((prev) => prev.map((row, i) => (i === index ? next : row)));

  return (
    <fieldset>
      <legend>{t("tierEditor.title")}</legend>
      {rows.length === 0 && (
        <p className="field-hint">{t("tierEditor.noTiers")}</p>
      )}
      <ol className="tier-list">
        {rows.map((tier, index) => (
          <li key={index} className="tier-row">
            <label className="tier-cell">
              <span className="field-label">{t("tierEditor.label")}</span>
              <input
                type="text"
                value={tier.label}
                onChange={(e) => setRow(index, { ...tier, label: e.target.value })}
              />
            </label>
            <label className="tier-cell">
              <span className="field-label">{t("tierEditor.from")}</span>
              <input
                type="text"
                inputMode="decimal"
                value={tier.miles_min ?? ""}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  const next = { ...tier };
                  if (raw === "") delete next.miles_min;
                  else {
                    const n = Number(raw);
                    if (Number.isFinite(n)) next.miles_min = n;
                  }
                  setRow(index, next);
                }}
              />
            </label>
            <label className="tier-cell">
              <span className="field-label">{t("tierEditor.to")}</span>
              <input
                type="text"
                inputMode="decimal"
                value={tier.miles_max ?? ""}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  const next = { ...tier };
                  if (raw === "") delete next.miles_max;
                  else {
                    const n = Number(raw);
                    if (Number.isFinite(n)) next.miles_max = n;
                  }
                  setRow(index, next);
                }}
              />
            </label>
            <label className="tier-cell">
              <span className="field-label">{t("tierEditor.amount")}</span>
              <input
                type="text"
                inputMode="decimal"
                value={String(tier.amount)}
                onChange={(e) => {
                  const n = Number(e.target.value.trim());
                  if (Number.isFinite(n)) setRow(index, { ...tier, amount: n });
                }}
              />
            </label>
            <Button
              variant="ghost"
              onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
            >
              {t("tierEditor.remove")}
            </Button>
          </li>
        ))}
      </ol>
      <Button variant="ghost" onClick={() => setRows((prev) => [...prev, blank()])}>
        {t("tierEditor.addTier")}
      </Button>
    </fieldset>
  );
}
