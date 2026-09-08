import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteContactImage,
  fetchConfig,
  saveConfigValue,
  saveContactPlatformQrImage,
  uploadContactImage,
  type ConfigField,
  type ContactPlatformSummary,
} from "../api";
import { Button } from "../components/Button";
import { useDialogBehavior } from "../components/useDialogBehavior";
import { useStudioT } from "../i18n/StudioI18n";
import type { StudioKey } from "../i18n/types";

// Getting these wrong doesn't just look wrong — it breaks the build or takes
// every image offline. The pane says so next to the input rather than letting
// the seller find out at deploy time.
const DANGER_FIELDS: Readonly<Record<string, StudioKey>> = {
  deploymentMode: "configPane.danger.deploymentMode",
  baseUrl: "configPane.danger.baseUrl",
  "imageStorage.provider": "configPane.danger.imageStorage",
};

const I18N_SECTION = "UI translations";

/** The field's label: the last path segment, spaced and capitalised. */
function labelFor(path: string): string {
  const last = path.split(".").pop() ?? path;
  const spaced = last.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const OTHER_SECTION = " other";

function sectionLabel(section: string): string {
  return section === "" ? OTHER_SECTION : section;
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
function fromInput(field: ConfigField, raw: string): { value: string | number | boolean } | { error: StudioKey } {
  if (field.kind === "number") {
    const trimmed = raw.trim();
    if (trimmed === "") return { error: "configPane.mustBeNumber" };
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return { error: "configPane.mustBeNumber" };
    return { value: n };
  }
  if (field.kind === "boolean") return { value: raw === "true" };
  return { value: raw };
}

// contact.platforms is an array in content/config.ts, and configEdit.ts's
// generic field model deliberately never walks into arrays (see its own
// comment: "an element add/remove... is a different, far riskier operation
// than the single-value splices this module guarantees") — so it surfaces
// here as one opaque, read-only "unsupported" field, and nothing inside it
// is reachable through FieldRow's normal draft/save flow. This section is a
// separate, purpose-built reader/writer (scripts/lib/contactPlatforms.ts)
// for exactly the one thing inside that array a seller needs to edit: each
// platform's qr_image. It saves immediately on upload, unlike every other
// Config field here, which stages into `drafts` until "Save section" — a
// deliberate difference, not an oversight: batching an array-element edit
// with pending scalar-field writes would mean reconciling two very
// different kinds of pending change against the same type-check gate.
//
// Rendered by ConfigPane itself (not by FieldRow, and not self-fetching):
// content/config.ts's type-check-gated write has no locking of its own, so
// a QR upload's PUT /api/contact-platforms/:index and the section's own
// "Save section" PUT /api/config must never run concurrently — both would
// rename content/config.ts to the same backup path. Owning `platforms` and
// `qrBusy` in ConfigPane, one level up, is what lets "Save section" disable
// itself while any row here is mid-upload (and vice versa), and lets both
// panes share the one GET /api/config response instead of each fetching it
// separately.
function ContactPlatformQrRow({
  platform,
  disabled,
  uploading,
  onUpload,
}: {
  platform: ContactPlatformSummary;
  disabled: boolean;
  uploading: boolean;
  onUpload: (file: File) => void;
}) {
  const { t } = useStudioT();

  function basename(pathValue: string): string {
    return pathValue.split("/").pop() ?? pathValue;
  }

  return (
    <div className="config-row qr-platform-row">
      <span className="field-label">{platform.label ?? platform.type}</span>
      {platform.qrImage !== undefined && (
        <>
          {/* /api/contact/images/:filename, not the /contact/<file> public
              path in `code` below: Studio's own dev server doesn't serve
              content/contact/ as /contact/* (only the site's separate
              build-time copy step does), so the live preview has to read
              the file back through this route instead. */}
          <img
            src={`/api/contact/images/${encodeURIComponent(basename(platform.qrImage))}`}
            alt=""
            className="qr-preview-thumb"
          />
          <code className="config-path">{platform.qrImage}</code>
        </>
      )}
      <input
        type="file"
        accept="image/png"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file !== undefined) onUpload(file);
        }}
      />
      <span className="field-hint">
        {platform.qrImage !== undefined ? t("configPane.qr.replaceHint") : t("configPane.qr.addHint")}
      </span>
      {uploading && <span className="field-hint">{t("configPane.qr.uploading")}</span>}
    </div>
  );
}

function ContactPlatformsQrSection({
  platforms,
  onPlatformsChange,
  sectionBusy,
  qrBusy,
  onQrBusyChange,
}: {
  platforms: ContactPlatformSummary[];
  onPlatformsChange: (platforms: ContactPlatformSummary[]) => void;
  sectionBusy: boolean;
  qrBusy: boolean;
  onQrBusyChange: (busy: boolean) => void;
}) {
  const { t } = useStudioT();
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function basename(pathValue: string): string {
    return pathValue.split("/").pop() ?? pathValue;
  }

  async function handleUpload(platform: ContactPlatformSummary, file: File) {
    setUploadingIndex(platform.index);
    onQrBusyChange(true);
    setError(null);
    let uploadedFile: string | null = null;
    try {
      const uploaded = await uploadContactImage(file);
      uploadedFile = uploaded.file;
      // config.ts is updated before the old file is touched: if this save
      // fails (type-check gate rejection, network error), the previously
      // working QR image must still be the one config.ts references.
      const updated = await saveContactPlatformQrImage(platform.index, uploaded.path);
      if (platform.qrImage !== undefined && platform.qrImage !== uploaded.path) {
        await deleteContactImage(basename(platform.qrImage)).catch(() => {});
      }
      onPlatformsChange(updated);
    } catch (err: unknown) {
      // The new file, if it made it to disk, was never referenced by
      // config.ts — clean it up rather than leaving an orphan behind.
      if (uploadedFile !== null) await deleteContactImage(uploadedFile).catch(() => {});
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadingIndex(null);
      onQrBusyChange(false);
    }
  }

  if (platforms.length === 0) return null;

  return (
    <div className="qr-platforms-section">
      <h3>{t("configPane.qr.sectionTitle")}</h3>
      <p className="field-hint">{t("configPane.qr.sectionHint")}</p>
      {error !== null && (
        <p role="alert" className="alert-error">
          {error}
        </p>
      )}
      {platforms.map((platform) => (
        <ContactPlatformQrRow
          key={platform.index}
          platform={platform}
          disabled={sectionBusy || qrBusy}
          uploading={uploadingIndex === platform.index}
          onUpload={(file) => void handleUpload(platform, file)}
        />
      ))}
    </div>
  );
}

// The Cloudflare Worker at workers/contact-form-proxy/ (which relays the
// buyer enquiry form) picks its notification channel from NOTIFICATION_PROVIDER
// in its own wrangler.toml — a Worker deploy-time file entirely outside
// content/, so it's structurally out of reach for this pane the same way
// contact.platforms' array elements are (see the comment above
// ContactPlatformQrRow). Unlike that case, there's nothing here for Studio to
// read or write at all — wrangler.toml is a separate package, and even a
// successful edit does nothing until a seller manually runs `wrangler
// deploy`. So this is a pure display helper: given a provider choice, show
// the exact snippet/commands `.claude/commands/setup-contact-form.md` already
// walks a seller through by hand, with copy buttons, so the seller doesn't
// have to retype them. No API call, no file access.
type ContactFormProvider = "discord" | "telegram" | "email";

const CONTACT_FORM_SECRET_NAME: Record<ContactFormProvider, string> = {
  discord: "DISCORD_WEBHOOK_URL",
  telegram: "TELEGRAM_BOT_TOKEN",
  email: "RESEND_API_KEY",
};

function contactFormVarsSnippet(provider: ContactFormProvider, baseUrl: string): string {
  const origin = baseUrl !== "" ? baseUrl : "https://your-domain.com";
  const lines = [
    "[vars]",
    `NOTIFICATION_PROVIDER = "${provider}"`,
    `ALLOWED_ORIGIN = "${origin}"`,
    `SITE_BASE_URL = "${origin}"`,
  ];
  if (provider === "telegram") lines.push('TELEGRAM_CHAT_ID = "<your chat id>"');
  if (provider === "email") {
    lines.push('NOTIFICATION_EMAIL_TO = "you@example.com"');
    lines.push('NOTIFICATION_EMAIL_FROM = "noreply@yourdomain.com"');
  }
  return lines.join("\n");
}

function contactFormCommands(provider: ContactFormProvider): string {
  return [
    "cd workers/contact-form-proxy",
    "pnpm install",
    "pnpm wrangler login",
    `pnpm wrangler secret put ${CONTACT_FORM_SECRET_NAME[provider]}`,
    "pnpm deploy",
  ].join("\n");
}

function ContactFormChannelHelper({ baseUrl }: { baseUrl: string }) {
  const { t } = useStudioT();
  const [provider, setProvider] = useState<ContactFormProvider>("discord");
  const [copied, setCopied] = useState<"vars" | "commands" | null>(null);

  async function copy(text: string, which: "vars" | "commands") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied((prev) => (prev === which ? null : prev)), 2000);
    } catch {
      // Clipboard access can be denied (permissions, insecure context). The
      // text is still fully selectable by hand from the block below, so
      // failing silently here is enough — no error state needed for a
      // convenience copy button.
    }
  }

  const vars = contactFormVarsSnippet(provider, baseUrl);
  const commands = contactFormCommands(provider);

  return (
    <div className="contact-form-helper">
      <h3>{t("configPane.contactHelper.title")}</h3>
      <p className="field-hint">{t("configPane.contactHelper.hint")}</p>

      <label className="field">
        <span className="field-label">{t("configPane.contactHelper.provider")}</span>
        <select value={provider} onChange={(e) => setProvider(e.target.value as ContactFormProvider)}>
          <option value="discord">Discord</option>
          <option value="telegram">Telegram</option>
          <option value="email">Email</option>
        </select>
      </label>

      <div className="contact-form-helper-block">
        <div className="contact-form-helper-block-head">
          <span>{t("configPane.contactHelper.varsLabel")}</span>
          <Button variant="ghost" onClick={() => void copy(vars, "vars")}>
            {copied === "vars" ? t("configPane.contactHelper.copied") : t("configPane.contactHelper.copy")}
          </Button>
        </div>
        <pre className="contact-form-helper-code">{vars}</pre>
      </div>

      <div className="contact-form-helper-block">
        <div className="contact-form-helper-block-head">
          <span>{t("configPane.contactHelper.commandsLabel")}</span>
          <Button variant="ghost" onClick={() => void copy(commands, "commands")}>
            {copied === "commands" ? t("configPane.contactHelper.copied") : t("configPane.contactHelper.copy")}
          </Button>
        </div>
        <pre className="contact-form-helper-code">{commands}</pre>
      </div>
    </div>
  );
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
  const { t } = useStudioT();
  const readOnly = field.kind === "unsupported";
  const dirty = !readOnly && raw !== toInput(field);
  const dangerKey = DANGER_FIELDS[field.path];

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
              <span className="visually-hidden">{t("configPane.unsaved")}</span>
            </>
          )}
        </span>

        {readOnly ? (
          <input type="text" value={t("configPane.readOnly")} disabled readOnly />
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

      {dangerKey !== undefined && !readOnly && (
        <p className="config-danger">
          <strong>{t("configPane.careful")}</strong> {t(dangerKey)}
        </p>
      )}
      {readOnly && (
        <p className="field-hint">
          {t("configPane.readOnlyHint")}
          <code>content/config.ts</code>
          {t("configPane.readOnlyHintSuffix")}
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
  const { t } = useStudioT();
  if (field === undefined) {
    return <div className="translation-cell translation-cell-empty">{t("configPane.missing")}</div>;
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
            <span className="visually-hidden">{t("configPane.unsaved")}</span>
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
  const { t } = useStudioT();
  const dialogRef = useDialogBehavior(onClose);
  const [fields, setFields] = useState<ConfigField[] | null>(null);
  const [contactPlatforms, setContactPlatforms] = useState<ContactPlatformSummary[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [selectedSubsection, setSelectedSubsection] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  // True while a contact-platform QR upload is writing content/config.ts.
  // Gates "Save section" too: writeConfigSourceWithTypeCheckGate has no
  // locking of its own, so the two write paths must never overlap.
  const [qrBusy, setQrBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setSaved(false);
    const { fields: nextFields, contactPlatforms: nextPlatforms } = await fetchConfig();
    setFields(nextFields);
    setContactPlatforms(nextPlatforms);
    setDrafts(Object.fromEntries(nextFields.map((field) => [field.path, toInput(field)])));
  }, []);

  useEffect(() => {
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [load]);

  const groups = useMemo(() => (fields === null ? [] : groupBySection(fields)), [fields]);
  const currentSection =
    (selectedSection === null ? groups[0] : groups.find((group) => group.section === selectedSection) ?? groups[0]) ?? null;
  const subsectionGroups = useMemo(
    () => (currentSection?.section === I18N_SECTION ? groupBySubsection(currentSection.fields) : []),
    [currentSection],
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
          throw new Error(`${labelFor(field.path)}: ${t(parsed.error)}`);
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
  const sectionDisplay = (section: string) => (section === OTHER_SECTION ? t("configPane.other") : section);
  const currentPageLabel =
    currentSection === null
      ? ""
      : currentSection.section === I18N_SECTION
        ? currentSubsection === null
          ? t("configPane.allTranslations")
          : currentSubsection.subsection
        : sectionDisplay(currentSection.section);

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className="dialog config-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("configPane.title")}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="config-head">
          <div>
            <h2>{t("configPane.title")}</h2>
            <p className="field-hint config-head-copy">{t("configPane.headCopy")}</p>
          </div>
          {currentSection !== null && currentPageLabel !== "" && (
            <p className="config-breadcrumb" aria-label="Current config page">
              {sectionDisplay(currentSection.section)}
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

        {saved && <p className="form-saved">{t("configPane.saved")}</p>}

        {fields === null && error === null && (
          <div aria-busy="true" aria-label={t("configPane.loading")}>
            <div className="skeleton" />
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
        )}

        {fields !== null && currentSection !== null && (
          <>
            <div className="config-nav" aria-label="Config navigation">
              <div className="config-nav-label">{t("configPane.sections")}</div>
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
                  {sectionDisplay(group.section)}
                </button>
              ))}
              </div>

              {currentSection.section === I18N_SECTION && subsectionGroups.length > 0 && (
                <>
                  <div className="config-nav-label config-subnav-label">{t("configPane.subnavLabel")}</div>
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
                  {sectionDisplay(currentSection.section)}
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
                {visibleFields.some((field) => field.path === "contact.platforms") && (
                  <ContactPlatformsQrSection
                    platforms={contactPlatforms}
                    onPlatformsChange={setContactPlatforms}
                    sectionBusy={busy}
                    qrBusy={qrBusy}
                    onQrBusyChange={setQrBusy}
                  />
                )}
                {visibleFields.some((field) => field.path === "notifications.enabled") && (
                  <ContactFormChannelHelper
                    baseUrl={String(fields?.find((f) => f.path === "baseUrl")?.value ?? "")}
                  />
                )}
              </fieldset>
            )}

            {currentSection.section === I18N_SECTION && translationMatrix !== null && (
              <fieldset className="config-page config-translation-page">
                <legend>
                  {currentSection.section}
                  {currentSubsection !== null ? ` / ${currentSubsection.subsection}` : ""}
                  {dirtyCount > 0 ? ` (${dirtyCount} unsaved)` : ""}
                </legend>
                <p className="field-hint config-translation-copy">{t("configPane.translationMatrixCopy")}</p>
                <div className="translation-matrix">
                  <div className="translation-matrix-header">
                    <div className="translation-matrix-key">{t("configPane.translationMatrixKey")}</div>
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
              <Button variant="primary" disabled={busy || qrBusy || dirtyCount === 0} onClick={() => void saveVisibleSection()}>
                {busy ? t("configPane.saving") : t("configPane.saveSection")}
              </Button>
              <Button variant="ghost" onClick={onClose}>
                {t("configPane.close")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
