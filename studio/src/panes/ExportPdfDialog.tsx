// studio/src/panes/ExportPdfDialog.tsx
import { useMemo, useState } from "react";
import { exportCatalogPdf, type PdfExportOptions, type StudioItem } from "../api";
import { Button } from "../components/Button";
import { useDialogBehavior } from "../components/useDialogBehavior";
import { useStudioT } from "../i18n/StudioI18n";
import type { StudioKey } from "../i18n/types";

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
  const [error, setError] = useState<string | null>(null);
  const [downloadedFilename, setDownloadedFilename] = useState<string | null>(null);

  const [locale, setLocale] = useState(defaultLocale);
  const [priceStrategy, setPriceStrategy] = useState<PriceStrategyValue>("average");
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    () => new Set(categorySlugs),
  );
  const [selectedStatuses, setSelectedStatuses] = useState<Set<StatusValue>>(
    () => new Set(DEFAULT_STATUSES),
  );

  const dialogRef = useDialogBehavior(onClose);

  const eligible = useMemo(
    () =>
      items.filter(
        (i) =>
          selectedStatuses.has(i.status as StatusValue) && selectedCategories.has(i.categorySlug),
      ),
    [items, selectedStatuses, selectedCategories],
  );
  const categoryCount = new Set(eligible.map((i) => i.categorySlug)).size;

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
    setBusy(true);
    setError(null);
    try {
      const options: PdfExportOptions = {
        locale,
        priceStrategy,
        categories: categorySlugs.filter((slug) => selectedCategories.has(slug)),
        statuses: STATUS_OPTIONS.map((s) => s.value).filter((status) => selectedStatuses.has(status)),
      };
      const blob = await exportCatalogPdf(options);
      const filename = `usedexchange-catalog-${new Date().toISOString().slice(0, 10)}.pdf`;
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
        {downloadedFilename !== null && <p>{t("exportPdf.done", { filename: downloadedFilename })}</p>}
        <div className="dialog-actions">
          <Button
            variant="primary"
            disabled={busy || eligible.length === 0}
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
