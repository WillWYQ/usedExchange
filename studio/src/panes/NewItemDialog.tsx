import { useRef, useState } from "react";
import {
  createCategory,
  createItem,
  importImagesFromUrls,
  previewImportUrl,
  type CategoryMetaInput,
} from "../api";
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

type Mode = "item" | "category" | "url";

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

  // ── Import from URL ──────────────────────────────────────────────
  const [sourceUrl, setSourceUrl] = useState("");
  const [fetchingPreview, setFetchingPreview] = useState(false);
  const [previewFetched, setPreviewFetched] = useState(false);
  const [candidateImages, setCandidateImages] = useState<string[]>([]);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());
  const [importStage, setImportStage] = useState<"idle" | "creating" | "importing">("idle");
  const [warning, setWarning] = useState<string | null>(null);
  // Set once the item itself is safely created but a photo import failed
  // partway — see createUrlItem's comment. Holds the dialog open on the
  // warning instead of auto-navigating away, so the seller actually sees
  // which photos need a manual retry.
  const [createdIdPendingWarning, setCreatedIdPendingWarning] = useState<string | null>(null);

  // fetchUrlPreview is async; if the seller switches to Item/Category mode
  // while a fetch is still in flight, the closure that started it still has
  // "url" baked in from the render where it was called. Reading `mode`
  // through a ref (kept current on every render) instead of that stale
  // closure value is what lets the resolution check the seller's CURRENT
  // mode and bail rather than overwriting whatever they've since typed into
  // the shared `name` field in another mode.
  const modeRef = useRef(mode);
  modeRef.current = mode;

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

  async function fetchUrlPreview() {
    const trimmed = sourceUrl.trim();
    if (trimmed === "") return;
    setFetchingPreview(true);
    setError(null);
    try {
      const preview = await previewImportUrl(trimmed);
      // The seller may have switched to Item/Category mode while this was
      // in flight — see modeRef's comment. Applying the result now would
      // silently clobber whatever they've typed into that other mode's
      // (shared) name field.
      if (modeRef.current !== "url") return;
      // Detected name pre-fills the same `name` field item mode uses — the
      // seller edits it right there, exactly like the manual flow.
      setName(preview.name ?? "");
      setCandidateImages(preview.images);
      // Pre-selected: the extraction heuristic (scripts/lib/urlImport.ts)
      // already filters out obvious icons/tracking pixels, so what's left is
      // worth defaulting to "import all" — the seller un-checks the odd one
      // rather than having to hunt through a page of unchecked boxes first.
      setSelectedImages(new Set(preview.images));
      setBrokenImages(new Set());
      setPreviewFetched(true);
    } catch (err: unknown) {
      if (modeRef.current === "url") {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setFetchingPreview(false);
    }
  }

  function toggleImage(src: string, checked: boolean) {
    setSelectedImages((prev) => {
      const next = new Set(prev);
      if (checked) next.add(src);
      else next.delete(src);
      return next;
    });
  }

  /**
   * Two server round trips, not one: item creation (POST /api/items) and
   * photo import (POST /api/items/:id/images/import) are separate endpoints
   * because the second one needs the item's folder to already exist. A
   * failure in the second step must not look like the whole thing failed —
   * the item is real and already saved — so it's reported as a `warning`,
   * with the dialog held open (via createdIdPendingWarning) instead of
   * calling onCreated, which would unmount this component before the seller
   * ever saw the message.
   */
  async function createUrlItem() {
    const cat = category.trim();
    const slug = name.trim();
    if (!SLUG_RE.test(cat) || !SLUG_RE.test(slug)) {
      setError(t("newItem.slugError"));
      return;
    }
    setError(null);
    setWarning(null);
    setImportStage("creating");
    let id: string;
    try {
      id = await createItem(cat, slug, applyDefaults);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setImportStage("idle");
      return;
    }

    const urls = Array.from(selectedImages);
    if (urls.length === 0) {
      onCreated(id);
      return;
    }

    setImportStage("importing");
    try {
      const result = await importImagesFromUrls(id, urls);
      if (result.failed.length > 0) {
        setWarning(
          t("newItem.url.partialFailure", {
            count: result.failed.length,
            details: result.failed.map((f) => f.error).join("; "),
          }),
        );
        setCreatedIdPendingWarning(id);
        setImportStage("idle");
        return;
      }
    } catch (err: unknown) {
      setWarning(err instanceof Error ? err.message : String(err));
      setCreatedIdPendingWarning(id);
      setImportStage("idle");
      return;
    }
    onCreated(id);
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onCancel}>
      {/* Stop clicks inside the sheet from closing it. */}
      <div
        ref={dialogRef}
        className="dialog new-item-dialog"
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
              // `name` backs the "Item name" field in every mode (and Category
              // mode's "Category slug" field) — clear it on every switch so a
              // draft from one mode never carries into another unnoticed.
              setName("");
              // url mode's own leftover state — belt-and-braces alongside the
              // mode === "url" guards on the submit handler and modeRef: a
              // stale createdIdPendingWarning must never survive into another
              // mode's Create button.
              setWarning(null);
              setCreatedIdPendingWarning(null);
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
              setWarning(null);
              setCreatedIdPendingWarning(null);
            }}
          >
            {t("newItem.mode.category")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "url"}
            className={mode === "url" ? "tab tab-active" : "tab"}
            onClick={() => {
              setMode("url");
              setError(null);
              setName("");
              setWarning(null);
              setCreatedIdPendingWarning(null);
            }}
          >
            {t("newItem.mode.url")}
          </button>
        </div>
        {error !== null && (
          <p role="alert" className="alert-error">
            {error}
          </p>
        )}
        {warning !== null && (
          <p role="status" className="alert-warning">
            {warning}
          </p>
        )}
        <datalist id="studio-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            // Gated on mode === "url" too, not just the pending-id itself:
            // this state is only meaningful mid-way through the url-mode
            // flow. Checking the id alone meant switching to Item/Category
            // mode after a partial photo-import warning and submitting
            // there silently re-navigated to the OLD item instead of
            // creating the new one — the seller's real submission was
            // dropped with no error shown.
            if (mode === "url" && createdIdPendingWarning !== null) {
              onCreated(createdIdPendingWarning);
              return;
            }
            if (mode === "item") void createNewItem();
            else if (mode === "category") void createNewCategory();
            else void createUrlItem();
          }}
        >
          {mode === "item" && (
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
          )}
          {mode === "category" && (
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
          {mode === "url" && (
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
                <span className="field-hint">{t("newItem.categoryHint")}</span>
              </label>
              <label className="field">
                <span className="field-label">{t("newItem.url.sourceUrl")}</span>
                <div className="url-fetch-row">
                  <input
                    type="url"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    placeholder={t("newItem.url.sourceUrlPlaceholder")}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={fetchingPreview || sourceUrl.trim() === "" || createdIdPendingWarning !== null}
                    onClick={() => void fetchUrlPreview()}
                  >
                    {fetchingPreview ? t("newItem.url.fetching") : t("newItem.url.fetch")}
                  </Button>
                </div>
                <span className="field-hint">{t("newItem.url.sourceUrlHint")}</span>
              </label>

              {previewFetched && createdIdPendingWarning === null && (
                <>
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

                  {candidateImages.length === 0 ? (
                    <p className="field-hint">{t("newItem.url.noImages")}</p>
                  ) : (
                    <div className="field">
                      <span className="field-label">{t("newItem.url.selectPhotos")}</span>
                      <div className="url-picker-actions">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setSelectedImages(new Set(candidateImages))}
                        >
                          {t("newItem.url.selectAll")}
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => setSelectedImages(new Set())}>
                          {t("newItem.url.selectNone")}
                        </Button>
                        <span className="field-hint">
                          {t("newItem.url.selectedCount", { count: selectedImages.size })}
                        </span>
                      </div>
                      <ol className="thumb-grid">
                        {candidateImages.map((src) => (
                          <li key={src}>
                            <label className="url-picker-thumb">
                              <input
                                type="checkbox"
                                checked={selectedImages.has(src)}
                                onChange={(e) => toggleImage(src, e.target.checked)}
                              />
                              <img
                                src={src}
                                alt=""
                                loading="lazy"
                                className={brokenImages.has(src) ? "url-picker-thumb-broken" : undefined}
                                onError={() =>
                                  setBrokenImages((prev) => new Set(prev).add(src))
                                }
                              />
                            </label>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

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
              )}
            </>
          )}
          <div className="dialog-actions">
            {mode === "url" && createdIdPendingWarning !== null ? (
              <Button type="submit" variant="primary">
                {t("newItem.create")}
              </Button>
            ) : mode === "url" ? (
              <Button
                type="submit"
                variant="primary"
                disabled={importStage !== "idle" || !previewFetched}
              >
                {importStage === "creating"
                  ? t("newItem.url.creating")
                  : importStage === "importing"
                    ? t("newItem.url.importing")
                    : t("newItem.url.create")}
              </Button>
            ) : (
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? t("newItem.creating") : t("newItem.create")}
              </Button>
            )}
            <Button variant="ghost" onClick={onCancel}>
              {t("newItem.cancel")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
