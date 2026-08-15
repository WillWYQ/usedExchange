import type { CategoryMetaInput } from "../api";
import { useStudioT } from "../i18n/StudioI18n";
import type { StudioKey } from "../i18n/types";

export type CategoryMetaDraft = {
  displayName: string;
  description: string;
  icon: string;
  sortOrder: string;
};

export const EMPTY_CATEGORY_META_DRAFT: CategoryMetaDraft = {
  displayName: "",
  description: "",
  icon: "",
  sortOrder: "",
};

/** Converts the form's string draft into the server's typed input, or an
 * i18n error key if the sort order isn't a whole number — mirrors the
 * `{value} | {error: StudioKey}` shape ConfigPane's fromInput already uses,
 * so one bad field reports itself without the caller needing a second
 * validation pass. */
export function draftToMetaInput(draft: CategoryMetaDraft): CategoryMetaInput | { error: StudioKey } {
  const trimmed = draft.sortOrder.trim();
  let sortOrder: number | null = null;
  if (trimmed !== "") {
    const n = Number(trimmed);
    // Negative values round-trip through the server as if the field were
    // never set — categoryJsonSchema's nullableNumber reads any negative
    // sort_order back as null on the next load — so they're rejected here
    // rather than appearing to save and then silently reverting to blank.
    if (!Number.isInteger(n) || n < 0) return { error: "categoryMeta.sortOrderError" };
    sortOrder = n;
  }
  return {
    display_name: draft.displayName,
    description: draft.description,
    icon: draft.icon,
    sort_order: sortOrder,
  };
}

export function CategoryMetaFields({
  value,
  onChange,
  busy,
}: {
  value: CategoryMetaDraft;
  onChange: (next: CategoryMetaDraft) => void;
  busy: boolean;
}) {
  const { t } = useStudioT();
  return (
    <div className="category-meta-fields">
      <label className="field">
        <span className="field-label">{t("categoryMeta.icon")}</span>
        <input
          type="text"
          value={value.icon}
          disabled={busy}
          // No maxLength: a single-glyph emoji can still be a long UTF-16
          // sequence (ZWJ-joined families, flags with modifiers), and the
          // server places no length limit on this field either — a hard cap
          // here would only risk truncating a legitimate emoji mid-sequence.
          onChange={(e) => onChange({ ...value, icon: e.target.value })}
        />
        <span className="field-hint">{t("categoryMeta.iconHint")}</span>
      </label>
      <label className="field">
        <span className="field-label">{t("categoryMeta.displayName")}</span>
        <input
          type="text"
          value={value.displayName}
          disabled={busy}
          onChange={(e) => onChange({ ...value, displayName: e.target.value })}
        />
        <span className="field-hint">{t("categoryMeta.displayNameHint")}</span>
      </label>
      <label className="field">
        <span className="field-label">{t("categoryMeta.description")}</span>
        <textarea
          value={value.description}
          disabled={busy}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
        />
      </label>
      <label className="field">
        <span className="field-label">{t("categoryMeta.sortOrder")}</span>
        <input
          type="text"
          inputMode="numeric"
          value={value.sortOrder}
          disabled={busy}
          onChange={(e) => onChange({ ...value, sortOrder: e.target.value })}
        />
        <span className="field-hint">{t("categoryMeta.sortOrderHint")}</span>
      </label>
    </div>
  );
}
