// studio/src/panes/ExportPdfDialog.tsx
import { useState } from "react";
import { exportCatalogPdf, type StudioItem } from "../api";
import { Button } from "../components/Button";
import { useDialogBehavior } from "../components/useDialogBehavior";
import { useStudioT } from "../i18n/StudioI18n";

const EXPORTABLE_STATUSES = new Set(["available", "pending", "reserved"]);

export function ExportPdfDialog({ items, onClose }: { items: StudioItem[]; onClose: () => void }) {
  const { t } = useStudioT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadedFilename, setDownloadedFilename] = useState<string | null>(null);

  const dialogRef = useDialogBehavior(onClose);

  const eligible = items.filter((i) => EXPORTABLE_STATUSES.has(i.status));
  const categoryCount = new Set(eligible.map((i) => i.categorySlug)).size;

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const blob = await exportCatalogPdf();
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
