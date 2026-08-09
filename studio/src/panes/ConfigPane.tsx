import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchConfig, saveConfigValue, type ConfigField } from "../api";
import { Button } from "../components/Button";
import { useDialogBehavior } from "../components/useDialogBehavior";

// Getting these wrong doesn't just look wrong — it breaks the build or takes
// every image offline. The pane says so next to the input rather than letting
// the seller find out at deploy time.
const DANGER_FIELDS: Readonly<Record<string, string>> = {
  deploymentMode: "Wrong value here and the site builds for the wrong host — check your deploy target before changing.",
  baseUrl: "Used for canonical URLs, sitemap and social previews. A wrong value ships broken links.",
  "imageStorage.provider": "Switching providers makes every existing image URL point somewhere new — photos go missing until you re-sync.",
};

const I18N_SECTION = "UI translations";

/** The field's label: the last path segment, spaced and capitalised. */
function labelFor(path: string): string {
  const last = path.split(".").pop() ?? path;
  const spaced = last.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function sectionLabel(section: string): string {
  return section === "" ? "Other" : section;
}

/** Groups fields by section, preserving the order the file declares them in. */
function groupBySection(fields: ConfigField[]): Array<{ section: string; fields: ConfigField[] }> {
  const groups: Array<{ section: string; fields: ConfigField[] }> = [];
  for (const field of fields) {
    const section = sectionLabel(field.section);
    const existing = groups.find((g) => g.section === section);
    if (existing === undefined) groups.push({ section, fields: [field] });
    else existing.fields.push(field);
  }
  return groups;
}

function groupBySubsection(fields: ConfigField[]): Array<{ subsection: string; fields: ConfigField[] }> {
  const groups: Array<{ subsection: string; fields: ConfigField[] }> = [];
  for (const field of fields) {
    const subsection = field.subsection ?? "All translations";
    const existing = groups.find((g) => g.subsection === subsection);
    if (existing === undefined) groups.push({ subsection, fields: [field] });
    else existing.fields.push(field);
  }
  return groups;
}

function parseTranslationPath(path: string): { locale: string; key: string } | null {
  const parts = path.split(".");
  if (parts.length < 4 || parts[0] !== "i18n" || parts[1] !== "translations") return null;
  const locale = parts[2];
  if (locale === undefined) return null;
  return { locale, key: parts.slice(3).join(".") };
}

function groupTranslationRows(fields: ConfigField[]): { locales: string[]; rows: Array<{ key: string; fields: Record<string, ConfigField> }> } {
  const locales: string[] = [];
  const rows = new Map<string, { key: string; fields: Record<string, ConfigField> }>();

  for (const field of fields) {
    const parsed = parseTranslationPath(field.path);
    if (parsed === null) continue;
    if (!locales.includes(parsed.locale)) locales.push(parsed.locale);
    const row = rows.get(parsed.key) ?? { key: parsed.key, fields: {} };
    row.fields[parsed.locale] = field;
    rows.set(parsed.key, row);
  }

  return { locales, rows: [...rows.values()] };
}

function fieldValue(field: ConfigField, drafts: Record<string, string>): string {
  return drafts[field.path] ?? toInput(field);
}

/** The editing string for a field's current value. */
function toInput(field: ConfigField): string {
  if (field.value === null) return "";
  return String(field.value);
}

/**
 * Turns the input string back into the typed value the API expects.
 * Returns { error } rather than throwing so one bad field reports itself
 * without disturbing the rest of the pane.
 */
function fromInput(field: ConfigField, raw: string): { value: string | number | boolean } | { error: string } {
  if (field.kind === "number") {
    const trimmed = raw.trim();
    if (trimmed === "") return { error: "must be a number" };
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return { error: "must be a number" };
    return { value: n };
  }
  if (field.kind === "boolean") return { value: raw === "true" };
  return { value: raw };
}

function FieldRow({
  field,
  raw,
  busy,
  onChange,
}: {
  field: ConfigField;
  raw: string;
  busy: boolean;
  onChange: (raw: string) => void;
}) {
  const readOnly = field.kind === "unsupported";
  const dirty = !readOnly && raw !== toInput(field);
  const danger = DANGER_FIELDS[field.path];

  return (
    <div className="config-row">
      <label className="field">
        <span className="field-label">
          {labelFor(field.path)}
          {dirty && (
            <>
              <span className="field-dot" aria-hidden="true">
                ●
              </span>
              <span className="visually-hidden"> (unsaved)</span>
            </>
          )}
        </span>

        {readOnly ? (
          <input type="text" value="(edit this field in content/config.ts)" disabled readOnly />
        ) : field.kind === "enum" ? (
          <select value={raw} disabled={busy} onChange={(e) => onChange(e.target.value)}>
            {field.options?.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : field.kind === "boolean" ? (
          <input
            type="checkbox"
            checked={raw === "true"}
            disabled={busy}
            onChange={(e) => onChange(e.target.checked ? "true" : "false")}
          />
        ) : (
          <input
            type="text"
            inputMode={field.kind === "number" ? "decimal" : undefined}
            value={raw}
            disabled={busy}
            onChange={(e) => onChange(e.target.value)}
          />
        )}

        <span className="field-hint">
          <code className="config-path">{field.path}</code>
          {field.doc !== undefined && ` — ${field.doc}`}
        </span>
      </label>

      {danger !== undefined && !readOnly && (
        <p className="config-danger">
          <strong>Careful:</strong> {danger}
        </p>
      )}
      {readOnly && (
        <p className="field-hint">
          Arrays and structured values are read-only here — edit them directly in{" "}
          <code>content/config.ts</code>.
        </p>
      )}
    </div>
  );
}

function TranslationCell({
  field,
  raw,
  busy,
  onChange,
}: {
  field?: ConfigField;
  raw: string;
  busy: boolean;
  onChange: (raw: string) => void;
}) {
  if (field === undefined) {
    return <div className="translation-cell translation-cell-empty">Missing</div>;
  }
  const parsed = parseTranslationPath(field.path);
  const locale = parsed?.locale ?? "";
  const dirty = raw !== toInput(field);
  return (
    <label className="translation-cell">
      <span className="field-label">
        {locale}
        {dirty && (
          <>
            <span className="field-dot" aria-hidden="true">
              ●
            </span>
            <span className="visually-hidden"> (unsaved)</span>
          </>
        )}
      </span>
      <input
        type="text"
        value={raw}
        disabled={busy}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${field.path}`}
      />
      {field.doc !== undefined && <span className="field-hint">{field.doc}</span>}
    </label>
  );
}

export function ConfigPane({ onClose }: { onClose: () => void }) {
  const dialogRef = useDialogBehavior(onClose);
  const [fields, setFields] = useState<ConfigField[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [selectedSubsection, setSelectedSubsection] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setSaved(false);
    const nextFields = await fetchConfig();
    setFields(nextFields);
    setDrafts(Object.fromEntries(nextFields.map((field) => [field.path, toInput(field)])));
  }, []);

  useEffect(() => {
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [load]);

  const groups = useMemo(() => (fields === null ? [] : groupBySection(fields)), [fields]);
  const currentSection =
    (selectedSection === null ? groups[0] : groups.find((group) => group.section === selectedSection) ?? groups[0]) ?? null;
  const currentSectionFields = currentSection?.fields ?? [];
  const subsectionGroups = useMemo(
    () => (currentSection?.section === I18N_SECTION ? groupBySubsection(currentSectionFields) : []),
    [currentSection, currentSectionFields],
  );
  const currentSubsection: { subsection: string; fields: ConfigField[] } | null =
    subsectionGroups.length === 0
      ? null
      : selectedSubsection === null
        ? subsectionGroups[0] ?? null
        : subsectionGroups.find((group) => group.subsection === selectedSubsection) ?? subsectionGroups[0] ?? null;

  useEffect(() => {
    if (groups.length === 0) return;
    setSelectedSection((prev) => (prev !== null && groups.some((group) => group.section === prev) ? prev : groups[0]?.section ?? null));
  }, [groups]);

  useEffect(() => {
    if (currentSection?.section !== I18N_SECTION || subsectionGroups.length === 0) {
      setSelectedSubsection(null);
      return;
    }
    setSelectedSubsection((prev) =>
      prev !== null && subsectionGroups.some((group) => group.subsection === prev)
        ? prev
        : subsectionGroups[0]?.subsection ?? null,
    );
  }, [currentSection?.section, subsectionGroups]);

  const visibleFields = useMemo(() => {
    if (currentSection === null) return [];
    if (currentSection.section !== I18N_SECTION) return currentSection.fields;
    if (currentSubsection === null) return [];
    return currentSubsection.fields;
  }, [currentSection, currentSubsection]);

  const translationMatrix = useMemo(
    () => (currentSection?.section === I18N_SECTION && currentSubsection !== null ? groupTranslationRows(visibleFields) : null),
    [currentSection?.section, currentSubsection, visibleFields],
  );

  async function saveVisibleSection() {
    if (fields === null || currentSection === null) return;
    const dirtyFields = visibleFields.filter((field) => field.kind !== "unsupported" && fieldValue(field, drafts) !== toInput(field));
    if (dirtyFields.length === 0) {
      setSaved(true);
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      for (const field of dirtyFields) {
        const raw = fieldValue(field, drafts);
        const parsed = fromInput(field, raw);
        if ("error" in parsed) {
          throw new Error(`${labelFor(field.path)}: ${parsed.error}`);
        }
        await saveConfigValue(field.path, parsed.value);
        setFields((prev) =>
          prev === null
            ? prev
            : prev.map((item) => (item.path === field.path ? { ...item, value: parsed.value } : item)),
        );
      }
      setSaved(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const dirtyCount = visibleFields.filter((field) => field.kind !== "unsupported" && fieldValue(field, drafts) !== toInput(field)).length;
  const currentPageLabel =
    currentSection === null
      ? ""
      : currentSection.section === I18N_SECTION
        ? currentSubsection === null
          ? "All translations"
          : currentSubsection.subsection
        : currentSection.section;

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className="dialog config-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Site config"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="config-head">
          <div>
            <h2>Site config</h2>
            <p className="field-hint config-head-copy">
              Top-level sections work like subpages. The UI translations page adds a second level so related locales stay together.
            </p>
          </div>
          {currentSection !== null && currentPageLabel !== "" && (
            <p className="config-breadcrumb" aria-label="Current config page">
              {currentSection.section}
              {currentSection.section === I18N_SECTION ? " / " : " · "}
              <span>{currentPageLabel}</span>
            </p>
          )}
        </header>

        {error !== null && (
          <p role="alert" className="alert-error">
            {error}
          </p>
        )}

        {saved && <p className="form-saved">Saved.</p>}

        {fields === null && error === null && (
          <div aria-busy="true" aria-label="Loading site config">
            <div className="skeleton" />
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
        )}

        {fields !== null && currentSection !== null && (
          <>
            <div className="config-nav" aria-label="Config navigation">
              <div className="config-nav-label">Sections</div>
              <div className="defaults-scopes config-section-tabs" role="tablist" aria-label="Config sections">
              {groups.map((group) => (
                <button
                  key={group.section}
                  type="button"
                  role="tab"
                  aria-selected={currentSection.section === group.section}
                  className={currentSection.section === group.section ? "tab tab-active" : "tab"}
                  onClick={() => {
                    setSelectedSection(group.section);
                    setSaved(false);
                  }}
                >
                  {group.section}
                </button>
              ))}
              </div>

              {currentSection.section === I18N_SECTION && subsectionGroups.length > 0 && (
                <>
                  <div className="config-nav-label config-subnav-label">Translation page</div>
                  <div className="defaults-scopes config-subsection-tabs" role="tablist" aria-label="Translation categories">
                {subsectionGroups.map((group) => (
                  <button
                    key={group.subsection}
                    type="button"
                    role="tab"
                    aria-selected={currentSubsection?.subsection === group.subsection}
                    className={currentSubsection?.subsection === group.subsection ? "tab tab-active" : "tab"}
                    onClick={() => {
                      setSelectedSubsection(group.subsection);
                      setSaved(false);
                    }}
                  >
                    {group.subsection}
                  </button>
                ))}
                  </div>
                </>
              )}
            </div>

            {currentSection.section !== I18N_SECTION && (
              <fieldset className="config-page">
                <legend>
                  {currentSection.section}
                  {dirtyCount > 0 ? ` (${dirtyCount} unsaved)` : ""}
                </legend>
                {visibleFields.map((field) => (
                  <FieldRow
                    key={field.path}
                    field={field}
                    raw={fieldValue(field, drafts)}
                    busy={busy}
                    onChange={(raw) => {
                      setDrafts((prev) => ({ ...prev, [field.path]: raw }));
                      setSaved(false);
                    }}
                  />
                ))}
              </fieldset>
            )}

            {currentSection.section === I18N_SECTION && translationMatrix !== null && (
              <fieldset className="config-page config-translation-page">
                <legend>
                  {currentSection.section}
                  {currentSubsection !== null ? ` / ${currentSubsection.subsection}` : ""}
                  {dirtyCount > 0 ? ` (${dirtyCount} unsaved)` : ""}
                </legend>
                <p className="field-hint config-translation-copy">
                  Each row is one key; each column is one locale. Save only touches the entries in this translation page.
                </p>
                <div className="translation-matrix">
                  <div className="translation-matrix-header">
                    <div className="translation-matrix-key">Key</div>
                    {translationMatrix.locales.map((locale) => (
                      <div key={locale} className="translation-matrix-locale">
                        {locale}
                      </div>
                    ))}
                  </div>
                  {translationMatrix.rows.map((row) => (
                    <div key={row.key} className="translation-matrix-row">
                      <div className="translation-matrix-key">{row.key}</div>
                      {translationMatrix.locales.map((locale) => {
                        const field = row.fields[locale];
                        return (
                          <TranslationCell
                            key={locale}
                            field={field}
                            raw={field === undefined ? "" : fieldValue(field, drafts)}
                            busy={busy}
                            onChange={(raw) => {
                              if (field === undefined) return;
                              setDrafts((prev) => ({ ...prev, [field.path]: raw }));
                              setSaved(false);
                            }}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="dialog-actions">
              <Button variant="primary" disabled={busy || dirtyCount === 0} onClick={() => void saveVisibleSection()}>
                {busy ? "Saving…" : "Save section"}
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
