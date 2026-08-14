import { useState } from "react";
import { createItem } from "../api";
import { Button } from "../components/Button";
import { useDialogBehavior } from "../components/useDialogBehavior";
import { useStudioT } from "../i18n/StudioI18n";

// Mirrors lib/utils/slug.ts's SAFE_SLUG_RE — the server is the real gate
// (resolveItemDir re-checks with the shared allowlist plus a containment
// assertion); this is only so a typo fails before the round trip.
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export function NewItemDialog({
  categories,
  onCreated,
  onCancel,
}: {
  categories: string[];
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const { t } = useStudioT();
  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [applyDefaults, setApplyDefaults] = useState(true);

  const dialogRef = useDialogBehavior(onCancel);

  async function create() {
    const cat = category.trim();
    const slug = name.trim();
    if (!SLUG_RE.test(cat) || !SLUG_RE.test(slug)) {
      setError(t("newItem.slugError"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onCreated(await createItem(cat, slug, applyDefaults));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onCancel}>
      {/* Stop clicks inside the sheet from closing it. */}
      <div
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("newItem.title")}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{t("newItem.title")}</h2>
        {error !== null && <p role="alert" className="alert-error">{error}</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <label className="field">
            <span className="field-label">{t("newItem.category")}</span>
            <input
              type="text"
              list="studio-categories"
              value={category}
              autoFocus
              onChange={(e) => setCategory(e.target.value)}
              placeholder={t("newItem.categoryPlaceholder")}
            />
            <datalist id="studio-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <span className="field-hint">{t("newItem.categoryHint")}</span>
          </label>
          <label className="field">
            <span className="field-label">{t("newItem.name")}</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("newItem.namePlaceholder")}
            />
            <span className="field-hint">{t("newItem.nameHint")}</span>
          </label>
          <label className="field">
            <span className="field-label">
              <input
                type="checkbox"
                checked={applyDefaults}
                onChange={(e) => setApplyDefaults(e.target.checked)}
              />{" "}
              {t("newItem.applyDefaults")}
            </span>
            <span className="field-hint">{t("newItem.applyDefaultsHint")}</span>
          </label>
          <div className="dialog-actions">
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? t("newItem.creating") : t("newItem.create")}
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              {t("newItem.cancel")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
