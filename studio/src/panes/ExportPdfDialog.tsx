// studio/src/panes/ExportPdfDialog.tsx
import { useMemo, useRef, useState } from "react";
import {
  streamExportCatalogPdf,
  downloadExportedPdf,
  exportItemFlyerPdf,
  type PdfExportOptions,
  type PdfExportProgress,
  type StudioItem,
} from "../api";
import { checkPdfReadiness } from "../../../scripts/lib/pdfCatalog/checkPdfReadiness";
import { Button } from "../components/Button";
import { ProgressBar } from "../components/ProgressBar";
import { useDialogBehavior } from "../components/useDialogBehavior";
import { useStudioT } from "../i18n/StudioI18n";
import type { StudioKey } from "../i18n/types";

const STAGE_LABEL_KEY: Record<PdfExportProgress["stage"], StudioKey> = {
  loading: "exportPdf.stage.loading",
  "images-pass-1": "exportPdf.stage.imagesPass1",
  "render-pass-1": "exportPdf.stage.renderPass1",
  "resolving-toc": "exportPdf.stage.resolvingToc",
  "images-pass-2": "exportPdf.stage.imagesPass2",
  "render-pass-2": "exportPdf.stage.renderPass2",
};

// page.pdf() (the actual Chromium render) exposes no sub-progress of its own,
// so the two render stages just jump to a fixed point rather than animating
// within a range — see PdfExportProgress's own doc comment in generate.ts.
function imageRatio(p: { completed: number; total: number }): number {
  return p.total > 0 ? p.completed / p.total : 1;
}

// Each SSE stage's [start, end] on the progress bar, declared once so
// stagePercent doesn't repeat the same "start + width * ratio" shape with
// different literals for each of the two images-pass branches. A fixed
// (non-images) stage just lands on its range's `end`; an images-pass stage
// animates across its own range as completed/total comes in.
const STAGE_RANGE: Record<PdfExportProgress["stage"], readonly [number, number]> = {
  loading: [0, 5],
  "images-pass-1": [5, 30],
  "render-pass-1": [30, 35],
  "resolving-toc": [35, 45],
  "images-pass-2": [45, 75],
  "render-pass-2": [75, 80],
};

// The SSE stages above only ever report progress up to render-pass-2's 80 —
// the downloadExportedPdf() round trip that follows the stream produces no
// progress events of its own, so it gets two fixed points on the same scale
// instead: one to show while that request is in flight, and one to show the
// export has actually finished before the bar is cleared.
const DOWNLOAD_PERCENT = 90;
const DONE_PERCENT = 100;

function stagePercent(p: PdfExportProgress): number {
  const [start, end] = STAGE_RANGE[p.stage];
  return p.stage === "images-pass-1" || p.stage === "images-pass-2"
    ? start + (end - start) * imageRatio(p)
    : end;
}

type PriceStrategyValue = PdfExportOptions["priceStrategy"];
type StatusValue = PdfExportOptions["statuses"][number];

const STATUS_OPTIONS: Array<{ value: StatusValue; labelKey: StudioKey }> = [
  { value: "available", labelKey: "filter.status.available" },
  { value: "pending", labelKey: "filter.status.pending" },
  { value: "reserved", labelKey: "filter.status.reserved" },
  { value: "sold", labelKey: "filter.status.sold" },
  { value: "draft", labelKey: "filter.status.draft" },
];
const DEFAULT_STATUSES: StatusValue[] = ["available", "pending", "reserved"];

const PRICE_STRATEGY_OPTIONS: Array<{ value: PriceStrategyValue; labelKey: StudioKey }> = [
  { value: "average", labelKey: "exportPdf.strategy.average" },
  { value: "lowest", labelKey: "exportPdf.strategy.lowest" },
  { value: "highest", labelKey: "exportPdf.strategy.highest" },
  { value: "pickup", labelKey: "exportPdf.strategy.pickup" },
  { value: "shipping", labelKey: "exportPdf.strategy.shipping" },
];

export function ExportPdfDialog({
  items,
  categorySlugs,
  availableLocales,
  defaultLocale,
  onClose,
}: {
  items: StudioItem[];
  categorySlugs: string[];
  availableLocales: string[];
  defaultLocale: string;
  onClose: () => void;
}) {
  const { t } = useStudioT();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<PdfExportProgress | null>(null);
  // Set only for the post-stream download step (see DOWNLOAD_PERCENT/
  // DONE_PERCENT above) — stagePercent(progress) alone covers everything
  // before it.
  const [percentOverride, setPercentOverride] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadedFilename, setDownloadedFilename] = useState<string | null>(null);
  const [mode, setMode] = useState<"catalog" | "flyer">("catalog");
  // Read by requestClose (via a ref, not state — closing must see whatever
  // controller the in-flight generate() actually created, not a stale one
  // captured by an earlier render).
  const abortControllerRef = useRef<AbortController | null>(null);

  const [locale, setLocale] = useState(defaultLocale);
  const [priceStrategy, setPriceStrategy] = useState<PriceStrategyValue>("average");
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    () => new Set(categorySlugs),
  );
  const [selectedStatuses, setSelectedStatuses] = useState<Set<StatusValue>>(
    () => new Set(DEFAULT_STATUSES),
  );

  // Every user-facing way to close the dialog (backdrop click, Escape, the
  // ghost Close button) routes through here rather than calling onClose
  // directly. Closing while a generate() is in flight used to unmount the
  // dialog unconditionally, leaving the fetch/SSE loop running against
  // orphaned closures — and, on completion, still saving a file the seller
  // believed they'd cancelled. Aborting first means that promise chain hits
  // its own AbortError branch and stops before the download/save step.
  function requestClose() {
    if (busy) {
      abortControllerRef.current?.abort();
    }
    onClose();
  }

  const dialogRef = useDialogBehavior(requestClose);

  const eligible = useMemo(
    () =>
      items.filter(
        (i) =>
          selectedStatuses.has(i.status as StatusValue) && selectedCategories.has(i.categorySlug),
      ),
    [items, selectedStatuses, selectedCategories],
  );
  const categoryCount = new Set(eligible.map((i) => i.categorySlug)).size;
  // Readiness warnings only apply to the full catalog — a single flyer's
  // eligibility and content are already visible in the drawer it was picked
  // from, so re-showing catalog-wide warnings here would just be noise.
  const warnings = useMemo(() => (mode === "catalog" ? checkPdfReadiness(eligible) : []), [mode, eligible]);

  const [flyerId, setFlyerId] = useState<string | null>(eligible.length > 0 ? (eligible[0]?.id ?? null) : null);

  function toggleCategory(slug: string, checked: boolean) {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (checked) next.add(slug);
      else next.delete(slug);
      return next;
    });
  }

  function toggleStatus(status: StatusValue, checked: boolean) {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (checked) next.add(status);
      else next.delete(status);
      return next;
    });
  }

  async function generate() {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setBusy(true);
    setError(null);
    setProgress(null);
    setPercentOverride(null);
    try {
      let blob: Blob;
      let filename: string;
      if (mode === "catalog") {
        const options: PdfExportOptions = {
          locale,
          priceStrategy,
          categories: categorySlugs.filter((slug) => selectedCategories.has(slug)),
          statuses: STATUS_OPTIONS.map((s) => s.value).filter((status) => selectedStatuses.has(status)),
        };
        let token: string | null = null;
        for await (const evt of streamExportCatalogPdf(options, controller.signal)) {
          if (evt.event === "progress") {
            setProgress(evt.data);
          } else if (evt.event === "done") {
            token = evt.data.token;
          } else {
            throw new Error(evt.data.error);
          }
        }
        if (token === null) {
          throw new Error("PDF export ended without a result.");
        }
        // Closing the dialog while busy aborts `controller` (see
        // requestClose) but does not stop the for-await loop above mid-
        // iteration — a "done" event can still arrive right after that
        // abort. Check explicitly rather than trusting downloadExportedPdf's
        // own signal to fail fast: a token already in flight must not reach
        // the download step at all once the seller has cancelled.
        if (controller.signal.aborted) return;
        // The SSE stream above never reports past render-pass-2's 80 — the
        // download round trip that follows gets its own point on the scale
        // so the bar doesn't stall there (see STAGE_RANGE's comment).
        setPercentOverride(DOWNLOAD_PERCENT);
        blob = await downloadExportedPdf(token, controller.signal);
        filename = `usedexchange-catalog-${new Date().toISOString().slice(0, 10)}.pdf`;
      } else {
        blob = await exportItemFlyerPdf(flyerId ?? "", controller.signal);
        filename = `usedexchange-flyer-${flyerId}-${new Date().toISOString().slice(0, 10)}.pdf`;
      }
      // Closing the dialog while busy aborts `controller` (see requestClose)
      // but does not stop this async function's own continuation — without
      // this check, a "done" token already in flight when the seller closed
      // the dialog would still reach the save step below and silently
      // download a file they believed they'd cancelled.
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      setDownloadedFilename(filename);
      if (mode === "catalog") {
        // Hold at 100% for a beat before `finally` clears it — React 18
        // batches synchronous state updates within one async continuation,
        // so setting DONE_PERCENT with nothing awaited before the reset
        // below would never actually get painted.
        setPercentOverride(DONE_PERCENT);
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      abortControllerRef.current = null;
      setBusy(false);
      setProgress(null);
      setPercentOverride(null);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={requestClose}>
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
          <>
            <label className="field">
              <span className="field-label">{t("exportPdf.language")}</span>
              <select value={locale} disabled={busy} onChange={(e) => setLocale(e.target.value)}>
                {availableLocales.map((l) => (
                  <option key={l} value={l}>
                    {l.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">{t("exportPdf.priceStrategy")}</span>
              <select
                value={priceStrategy}
                disabled={busy}
                onChange={(e) => setPriceStrategy(e.target.value as PriceStrategyValue)}
              >
                {PRICE_STRATEGY_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {t(s.labelKey)}
                  </option>
                ))}
              </select>
            </label>

            <div className="field">
              <span className="field-label">{t("exportPdf.categories")}</span>
              <div className="checkbox-group">
                {categorySlugs.map((slug) => (
                  <label key={slug} className="checkbox-group-item">
                    <input
                      type="checkbox"
                      checked={selectedCategories.has(slug)}
                      disabled={busy}
                      onChange={(e) => toggleCategory(slug, e.target.checked)}
                    />
                    {slug}
                  </label>
                ))}
              </div>
            </div>

            <div className="field">
              <span className="field-label">{t("exportPdf.statuses")}</span>
              <div className="checkbox-group">
                {STATUS_OPTIONS.map((s) => (
                  <label key={s.value} className="checkbox-group-item">
                    <input
                      type="checkbox"
                      checked={selectedStatuses.has(s.value)}
                      disabled={busy}
                      onChange={(e) => toggleStatus(s.value, e.target.checked)}
                    />
                    {t(s.labelKey)}
                  </label>
                ))}
              </div>
            </div>

            <p>
              {eligible.length === 0
                ? t("exportPdf.summaryEmpty")
                : t("exportPdf.summary", { itemCount: eligible.length, categoryCount })}
            </p>
          </>
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
        {mode === "catalog" && busy && progress !== null && (
          <ProgressBar
            percent={percentOverride ?? stagePercent(progress)}
            label={t(
              STAGE_LABEL_KEY[progress.stage],
              progress.stage === "images-pass-1" || progress.stage === "images-pass-2"
                ? { completed: progress.completed, total: progress.total }
                : undefined,
            )}
          />
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
          <Button variant="ghost" onClick={requestClose}>
            {t("exportPdf.close")}
          </Button>
        </div>
      </div>
    </div>
  );
}
