import { useCallback, useEffect, useState } from "react";
import { fetchCategories, saveCategoryMeta, type CategorySummary } from "../api";
import { Button } from "../components/Button";
import { CategoryMetaFields, draftToMetaInput, type CategoryMetaDraft } from "../components/CategoryMetaFields";
import { useDialogBehavior } from "../components/useDialogBehavior";
import { useStudioT } from "../i18n/StudioI18n";

function toDraft(cat: CategorySummary): CategoryMetaDraft {
  return {
    displayName: cat.displayName,
    description: cat.description,
    icon: cat.icon,
    sortOrder: cat.sortOrder === null ? "" : String(cat.sortOrder),
  };
}

function CategoryRow({ category, onSaved }: { category: CategorySummary; onSaved: () => void }) {
  const { t } = useStudioT();
  // Deliberately NOT re-synced from the `category` prop after mount: saving
  // one row triggers the pane's own reload, which hands every row a
  // brand-new `category` object (same slug, new reference) even for rows
  // nobody touched. A prop-driven resync here would silently overwrite an
  // in-progress edit in a sibling row the instant any other row saves.
  const [draft, setDraft] = useState<CategoryMetaDraft>(() => toDraft(category));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    const parsed = draftToMetaInput(draft);
    if ("error" in parsed) {
      setError(t(parsed.error));
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await saveCategoryMeta(category.slug, parsed);
      onSaved();
      setSaved(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="category-row">
      <h3>
        {category.icon !== "" ? `${category.icon} ` : ""}
        {category.slug}
        <span className="field-hint"> · {t("categoriesPane.itemCount", { count: category.itemCount })}</span>
      </h3>
      {error !== null && (
        <p role="alert" className="alert-error">
          {error}
        </p>
      )}
      {saved && <p className="form-saved">{t("categoriesPane.saved")}</p>}
      <CategoryMetaFields value={draft} onChange={setDraft} busy={busy} />
      <div className="dialog-actions">
        <Button variant="primary" onClick={() => void save()} disabled={busy}>
          {busy ? t("categoriesPane.saving") : t("categoriesPane.save")}
        </Button>
      </div>
    </div>
  );
}

export function CategoriesPane({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useStudioT();
  const dialogRef = useDialogBehavior(onClose);
  const [categories, setCategories] = useState<CategorySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setCategories(await fetchCategories());
  }, []);

  useEffect(() => {
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [load]);

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className="dialog categories-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("categoriesPane.title")}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{t("categoriesPane.title")}</h2>
        <p className="field-hint">{t("categoriesPane.hint")}</p>
        {error !== null && (
          <p role="alert" className="alert-error">
            {error}
          </p>
        )}
        {categories !== null && categories.length === 0 && <p className="field-hint">{t("categoriesPane.empty")}</p>}
        {categories?.map((cat) => (
          <CategoryRow
            key={cat.slug}
            category={cat}
            onSaved={() => {
              onSaved();
              void load();
            }}
          />
        ))}
        <div className="dialog-actions">
          <Button variant="ghost" onClick={onClose}>
            {t("categoriesPane.close")}
          </Button>
        </div>
      </div>
    </div>
  );
}
