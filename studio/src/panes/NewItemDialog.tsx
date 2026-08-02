import { useState } from "react";
import { createItem } from "../api";

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
  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    const cat = category.trim();
    const slug = name.trim();
    if (!SLUG_RE.test(cat) || !SLUG_RE.test(slug)) {
      setError("Category and name must be kebab-case (lowercase letters, digits, hyphens).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onCreated(await createItem(cat, slug));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onCancel}>
      {/* Stop clicks inside the sheet from closing it. */}
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="New item"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>New item</h2>
        {error !== null && <p role="alert">{error}</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <label className="field">
            <span className="field-label">Category</span>
            <input
              type="text"
              list="studio-categories"
              value={category}
              autoFocus
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. electronics"
            />
            <datalist id="studio-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <span className="field-hint">Pick an existing category or type a new one.</span>
          </label>
          <label className="field">
            <span className="field-label">Item name (slug)</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. ikea-desk-lamp"
            />
            <span className="field-hint">
              Lowercase letters, digits, hyphens. Created as a draft — invisible on the site until
              published.
            </span>
          </label>
          <div className="dialog-actions">
            <button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create"}
            </button>
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
