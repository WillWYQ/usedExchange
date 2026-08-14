// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithStudioI18n as render } from "../i18n/StudioI18n";
import { BulkToolbar } from "./BulkToolbar";

afterEach(() => cleanup());

it("fires onApplyTiers when the button is clicked", async () => {
  const onApplyTiers = vi.fn();
  render(
    <BulkToolbar
      count={2}
      busy={false}
      onApply={vi.fn()}
      onApplyTiers={onApplyTiers}
      onClear={vi.fn()}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Apply default tiers" }));
  expect(onApplyTiers).toHaveBeenCalledTimes(1);
});

it("disables the tiers action while busy", () => {
  render(
    <BulkToolbar count={2} busy onApply={vi.fn()} onApplyTiers={vi.fn()} onClear={vi.fn()} />,
  );
  expect(
    (screen.getByRole("button", { name: "Apply default tiers" }) as HTMLButtonElement).disabled,
  ).toBe(true);
});

it("renders nothing with no selection", () => {
  const { container } = render(
    <BulkToolbar count={0} busy={false} onApply={vi.fn()} onApplyTiers={vi.fn()} onClear={vi.fn()} />,
  );
  expect(container.innerHTML).toBe("");
});
