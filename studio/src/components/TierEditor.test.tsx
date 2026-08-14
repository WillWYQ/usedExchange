// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithStudioI18n } from "../i18n/StudioI18n";
import { TierEditor, type Tier } from "./TierEditor";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mount(initialTiers: Tier[]): { collect: () => Tier[] | null } {
  const holder: { collect: () => Tier[] | null } = { collect: () => null };
  renderWithStudioI18n(
    <TierEditor
      initialTiers={initialTiers}
      resetToken={0}
      registerCollector={(collect) => {
        holder.collect = collect;
      }}
    />,
  );
  // A stable proxy, not the holder itself: `const { collect } = mount(...)`
  // would otherwise snapshot the mount-time closure and miss re-registrations.
  return { collect: () => holder.collect() };
}

describe("TierEditor", () => {
  it("collects null while the rows are unchanged", () => {
    const { collect } = mount([{ label: "Pickup", miles_max: 5, amount: 40 }]);
    expect(collect()).toBeNull();
  });

  it("collects the edited rows after an amount changes", async () => {
    const { collect } = mount([{ label: "Pickup", miles_max: 5, amount: 40 }]);
    const amount = screen.getByDisplayValue("40");
    await userEvent.clear(amount);
    await userEvent.type(amount, "45");
    expect(collect()).toEqual([{ label: "Pickup", miles_max: 5, amount: 45 }]);
  });

  it("collects added rows", async () => {
    const { collect } = mount([{ label: "Pickup", amount: 40 }]);
    await userEvent.click(screen.getByRole("button", { name: "Add tier" }));
    expect(collect()).toEqual([
      { label: "Pickup", amount: 40 },
      { label: "", amount: 0 },
    ]);
  });
});
