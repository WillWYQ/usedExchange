// studio/src/panes/ExportPdfDialog.tsx
import { useMemo, useState } from "react";
import { exportCatalogPdf, exportItemFlyerPdf, type StudioItem } from "../api";
import { checkPdfReadiness } from "../../../scripts/lib/pdfCatalog/checkPdfReadiness";
import { Button } from "../components/Button";
import { useDialogBehavior } from "../components/useDialogBehavior";
import { useStudioT } from "../i18n/StudioI18n";

// Must stay in sync with scripts/lib/pdfCatalog/generate.ts's own copy of
// this set, which is the actual export-eligibility source of truth (this
// copy only drives the dialog's item/category count preview before the
// request is sent) — a client/server drift here would silently show the
// wrong count in the dialog without ever erroring.
const EXPORTABLE_STATUSES = new Set(["available", "pending", "reserved"]);

export function ExportPdfDialog({ items, onClose }: { items: StudioItem[]; onClose: () => void }) {
  const { t } = useStudioT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadedFilename, setDownloadedFilename] = useState<string | null>(null);
  const [mode, setMode] = useState<"catalog" | "flyer">("catalog");

  const dialogRef = useDialogBehavior(onClose);

  const eligible = items.filter((i) => EXPORTABLE_STATUSES.has(i.status));
  const categoryCount = new Set(eligible.map((i) => i.categorySlug)).size;
  // Readiness warnings only apply to the full catalog — a single flyer's
  // eligibility and content are already visible in the drawer it was picked
  // from, so re-showing catalog-wide warnings here would just be noise.
  const warnings = useMemo(() => (mode === "catalog" ? checkPdfReadiness(eligible) : []), [mode, eligible]);

  const [flyerId, setFlyerId] = useState<string | null>(eligible.length > 0 ? (eligible[0]?.id ?? null) : null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const blob = mode === "catalog" ? await exportCatalogPdf() : await exportItemFlyerPdf(flyerId ?? "");
      const filename =
        mode === "catalog"
          ? `usedexchange-catalog-${new Date().toISOString().slice(0, 10)}.pdf`
          : `usedexchange-flyer-${flyerId}-${new Date().toISOString().slice(0, 10)}.pdf`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      setDownloadedFilename(filename);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("exportPdf.title")}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{t("exportPdf.title")}</h2>
        {error !== null && (
          <p role="alert" className="alert-error">
            {error}
          </p>
        )}
        <div className="export-pdf-mode" role="radiogroup" aria-label={t("exportPdf.modeLabel")}>
          <Button
            variant={mode === "catalog" ? "primary" : "secondary"}
            role="radio"
            aria-checked={mode === "catalog"}
            onClick={() => setMode("catalog")}
          >
            {t("exportPdf.mode.catalog")}
          </Button>
          <Button
            variant={mode === "flyer" ? "primary" : "secondary"}
            role="radio"
            aria-checked={mode === "flyer"}
            onClick={() => setMode("flyer")}
          >
            {t("exportPdf.mode.flyer")}
          </Button>
        </div>
        {mode === "catalog" && (
          <p>
            {eligible.length === 0
              ? t("exportPdf.summaryEmpty")
              : t("exportPdf.summary", { itemCount: eligible.length, categoryCount })}
          </p>
        )}
        {mode === "flyer" && (
          <label className="filter-field">
            <span className="filter-label">{t("exportPdf.flyer.item")}</span>
            <select
              value={flyerId ?? ""}
              onChange={(e) => setFlyerId(e.target.value)}
              disabled={busy || eligible.length === 0}
            >
              {eligible.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {downloadedFilename !== null && <p>{t("exportPdf.done", { filename: downloadedFilename })}</p>}
        {warnings.length > 0 && (
          <details className="pdf-readiness-warnings">
            <summary>
              {t(
                warnings.length === 1 ? "exportPdf.readiness.summary" : "exportPdf.readiness.summaryPlural",
                { count: warnings.length }
              )}
            </summary>
            <ul>
              {warnings.map((w) => (
                <li key={w.id}>
                  <strong>{w.name}</strong>
                  {": "}
                  {w.missing
                    .map((flag) => t(`exportPdf.readiness.${flag}`))
                    .join(", ")}
                </li>
              ))}
            </ul>
          </details>
        )}
        <div className="dialog-actions">
          <Button
            variant="primary"
            disabled={busy || eligible.length === 0 || (mode === "flyer" && flyerId === null)}
            onClick={() => void generate()}
          >
            {busy ? t("exportPdf.generating") : t("exportPdf.generate")}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t("exportPdf.close")}
          </Button>
        </div>
      </div>
    </div>
  );
}
