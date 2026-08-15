// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithStudioI18n } from "../i18n/StudioI18n";
import { CategoryMetaFields, draftToMetaInput, EMPTY_CATEGORY_META_DRAFT } from "./CategoryMetaFields";

afterEach(() => {
  cleanup();
});

describe("CategoryMetaFields", () => {
  it("renders all four fields with their current values", () => {
    const { getByLabelText } = renderWithStudioI18n(
      <CategoryMetaFields
        value={{ displayName: "Electronics", description: "Gadgets", icon: "📱", sortOrder: "1" }}
        onChange={vi.fn()}
        busy={false}
      />,
    );
    // exact: false — each label wraps its field-hint span too (matching the
    // rest of Studio's "field" markup), so the accessible name is the label
    // text plus the hint, not the label text alone.
    expect((getByLabelText("Display name", { exact: false }) as HTMLInputElement).value).toBe("Electronics");
    expect((getByLabelText("Icon", { exact: false }) as HTMLInputElement).value).toBe("📱");
    expect((getByLabelText("Sort order", { exact: false }) as HTMLInputElement).value).toBe("1");
  });

  it("calls onChange when a field is edited", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { getByLabelText } = renderWithStudioI18n(
      <CategoryMetaFields value={EMPTY_CATEGORY_META_DRAFT} onChange={onChange} busy={false} />,
    );
    await user.type(getByLabelText("Icon", { exact: false }), "📱");
    expect(onChange).toHaveBeenCalled();
  });
});

describe("draftToMetaInput", () => {
  it("maps an empty draft to all-default meta", () => {
    expect(draftToMetaInput(EMPTY_CATEGORY_META_DRAFT)).toEqual({
      display_name: "",
      description: "",
      icon: "",
      sort_order: null,
    });
  });

  it("parses a numeric sort order", () => {
    const result = draftToMetaInput({ ...EMPTY_CATEGORY_META_DRAFT, sortOrder: "3" });
    expect(result).toEqual({ display_name: "", description: "", icon: "", sort_order: 3 });
  });

  it("errors on a non-integer sort order", () => {
    const result = draftToMetaInput({ ...EMPTY_CATEGORY_META_DRAFT, sortOrder: "1.5" });
    expect(result).toEqual({ error: "categoryMeta.sortOrderError" });
  });

  it("errors on a negative sort order", () => {
    // A negative value would otherwise "save" and then silently revert to
    // blank on the next load, since the server's read schema treats any
    // negative sort_order the same as absent.
    const result = draftToMetaInput({ ...EMPTY_CATEGORY_META_DRAFT, sortOrder: "-1" });
    expect(result).toEqual({ error: "categoryMeta.sortOrderError" });
  });
});
