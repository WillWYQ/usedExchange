import { useEffect, useState } from "react";
import { exportItemFlyerPdf, type StudioItem } from "../api";
import { Button } from "../components/Button";
import { useStudioT } from "../i18n/StudioI18n";
import { EditForm } from "./EditForm";
import { ImagePane } from "./ImagePane";

// Must stay in sync with scripts/lib/pdfCatalog/generate.ts's own copy of
// this set (the actual export-eligibility source of truth) and
// ExportPdfDialog.tsx's copy — this one only gates the drawer's "Export
// flyer" button, so a drift here would let the button look enabled for an
// item the server would still reject with a 400.
const EXPORTABLE_STATUSES = new Set(["available", "pending", "reserved"]);

export function Drawer({
  item,
  onClose,
  onChanged,
}: {
  item: StudioItem;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useStudioT();
  const [tab, setTab] = useState<"photos" | "details">("photos");
  // Visited tabs stay mounted. Rendering only the active one used to throw a
  // half-typed edit away the moment the seller clicked Photos to check an
  // image — silently, with nothing to undo it. Still lazy on first open, so
  // a drawer whose Details tab is never opened costs no field fetch.
  const [visited, setVisited] = useState<ReadonlySet<string>>(new Set(["photos"]));
  const [dirtyCount, setDirtyCount] = useState(0);
  const [flyerBusy, setFlyerBusy] = useState(false);
  const [flyerError, setFlyerError] = useState<string | null>(null);

  function open(next: "photos" | "details") {
    setTab(next);
    setVisited((prev) => (prev.has(next) ? prev : new Set([...prev, next])));
  }

  async function exportFlyer() {
    setFlyerBusy(true);
    setFlyerError(null);
    try {
      const blob = await exportItemFlyerPdf(item.id);
      const filename = `usedexchange-flyer-${item.id.replace(/\//g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setFlyerError(err instanceof Error ? err.message : String(err));
    } finally {
      setFlyerBusy(false);
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // A dialog layered on top consumes Escape and calls preventDefault
      // (see useDialogBehavior); bail so one Esc doesn't close both.
      if (e.defaultPrevented) return;
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <aside className="drawer" aria-label={t("drawer.editor", { name: item.name })}>
      <header className="drawer-head">
        <h2>{item.name}</h2>
        <div className="drawer-actions">
          <Button
            variant="secondary"
            disabled={!EXPORTABLE_STATUSES.has(item.status) || flyerBusy}
            onClick={() => void exportFlyer()}
          >
            {flyerBusy ? t("drawer.exportFlyerBusy") : t("drawer.exportFlyer")}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t("drawer.close")}
          </Button>
        </div>
      </header>
      {flyerError !== null && (
        <p role="alert" className="alert-error">
          {flyerError}
        </p>
      )}

      <div className="drawer-tabs" role="tablist">
        {(["photos", "details"] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className={tab === name ? "tab tab-active" : "tab"}
            onClick={() => open(name)}
          >
            {name === "photos" ? t("drawer.photos") : t("drawer.details")}
            {name === "details" && dirtyCount > 0 && (
              <>
                <span className="field-dot" aria-hidden="true">
                  ●
                </span>
                <span className="visually-hidden">{t("drawer.unsavedChanges")}</span>
              </>
            )}
          </button>
        ))}
      </div>

      {visited.has("photos") && (
        <div className="drawer-pane" hidden={tab !== "photos"}>
          <ImagePane item={item} onChanged={onChanged} />
        </div>
      )}
      {visited.has("details") && (
        <div className="drawer-pane" hidden={tab !== "details"}>
          <EditForm id={item.id} onSaved={onChanged} onDirtyChange={setDirtyCount} />
        </div>
      )}
    </aside>
  );
}
