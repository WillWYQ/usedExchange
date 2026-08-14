// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithStudioI18n } from "../i18n/StudioI18n";
import { LocaleSwitcher } from "./LocaleSwitcher";

afterEach(cleanup);

describe("LocaleSwitcher", () => {
  it("renders nothing when there is only one locale", () => {
    const { container } = renderWithStudioI18n(
      <LocaleSwitcher availableLocales={["en"]} value="en" onChange={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders a select for multiple locales", () => {
    renderWithStudioI18n(
      <LocaleSwitcher availableLocales={["en", "zh"]} value="en" onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText("Display language")).not.toBeNull();
  });

  it("calls onChange when a new locale is selected", async () => {
    const onChange = vi.fn();
    renderWithStudioI18n(
      <LocaleSwitcher availableLocales={["en", "zh"]} value="en" onChange={onChange} />,
    );
    await userEvent.selectOptions(screen.getByLabelText("Display language"), "zh");
    expect(onChange).toHaveBeenCalledWith("zh");
  });
});
