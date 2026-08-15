import { useState } from "react";
import { createCategory, createItem, type CategoryMetaInput } from "../api";
import { Button } from "../components/Button";
import {
  CategoryMetaFields,
  draftToMetaInput,
  EMPTY_CATEGORY_META_DRAFT,
  type CategoryMetaDraft,
} from "../components/CategoryMetaFields";
import { useDialogBehavior } from "../components/useDialogBehavior";
import { useStudioT } from "../i18n/StudioI18n";

// Mirrors lib/utils/slug.ts's SAFE_SLUG_RE — the server is the real gate
// (resolveItemDir/resolveCategoryDir re-check with the shared allowlist plus
// a containment assertion); this is only so a typo fails before the round
// trip.
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

type Mode = "item" | "category";

export function NewItemDialog({
  categories,
  onCreated,
  onCategoryCreated,
  onCancel,
}: {
  categories: string[];
  onCreated: (id: string) => void;
  onCategoryCreated: (slug: string) => void;
  onCancel: () => void;
}) {
  const { t } = useStudioT();
  const [mode, setMode] = useState<Mode>("item");
  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [applyDefaults, setApplyDefaults] = useState(true);
  const [showCategoryMeta, setShowCategoryMeta] = useState(false);
  const [categoryMeta, setCategoryMeta] = useState<CategoryMetaDraft>(EMPTY_CATEGORY_META_DRAFT);

  const dialogRef = useDialogBehavior(onCancel);

  async function createNewItem() {
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

  async function createNewCategory() {
    const slug = name.trim();
    if (!SLUG_RE.test(slug)) {
      setError(t("newItem.slugError"));
      return;
    }
    let metaInput: CategoryMetaInput | undefined;
    if (showCategoryMeta) {
      const parsed = draftToMetaInput(categoryMeta);
      if ("error" in parsed) {
        setError(t(parsed.error));
        return;
      }
      metaInput = parsed;
    }
    setBusy(true);
    setError(null);
    try {
      onCategoryCreated(await createCategory(slug, metaInput));
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
        <div className="new-item-mode" role="tablist" aria-label={t("newItem.modeLabel")}>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "item"}
            className={mode === "item" ? "tab tab-active" : "tab"}
            onClick={() => {
              setMode("item");
              setError(null);
              // `name` backs both this mode's "Item name" field and Category
              // mode's "Category slug" field — clear it on every switch so a
              // draft from one mode never carries into the other unnoticed.
              setName("");
            }}
          >
            {t("newItem.mode.item")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "category"}
            className={mode === "category" ? "tab tab-active" : "tab"}
            onClick={() => {
              setMode("category");
              setError(null);
              setName("");
              setShowCategoryMeta(false);
              setCategoryMeta(EMPTY_CATEGORY_META_DRAFT);
            }}
          >
            {t("newItem.mode.category")}
          </button>
        </div>
        {error !== null && (
          <p role="alert" className="alert-error">
            {error}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void (mode === "item" ? createNewItem() : createNewCategory());
          }}
        >
          {mode === "item" ? (
            <>
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
            </>
          ) : (
            <>
              <label className="field">
                <span className="field-label">{t("newItem.categorySlug")}</span>
                <input
                  type="text"
                  value={name}
                  autoFocus
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("newItem.categorySlugPlaceholder")}
                />
                <span className="field-hint">{t("newItem.categorySlugHint")}</span>
              </label>
              <button
                type="button"
                className="disclosure-toggle"
                onClick={() => setShowCategoryMeta((v) => !v)}
              >
                {showCategoryMeta ? t("newItem.categoryMeta.hide") : t("newItem.categoryMeta.show")}
              </button>
              {showCategoryMeta && (
                <CategoryMetaFields value={categoryMeta} onChange={setCategoryMeta} busy={busy} />
              )}
            </>
          )}
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
