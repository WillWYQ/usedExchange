// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithStudioI18n as render } from "../i18n/StudioI18n";
import { FilterBar } from "./FilterBar";
import { DEFAULT_FILTERS } from "../filtering";

afterEach(cleanup);

const baseCounts = {
  active: 1,
  all: 1,
  available: 1,
  reserved: 0,
  pending: 0,
  sold: 0,
  draft: 0,
};

const baseProps = {
  filters: DEFAULT_FILTERS,
  counts: baseCounts,
  categories: [],
  resultCount: 1,
  onChange: vi.fn(),
  allSelected: false,
  onToggleAll: vi.fn(),
};

describe("FilterBar view mode", () => {
  it("renders table and cards buttons", () => {
    render(<FilterBar {...baseProps} viewMode="table" onViewModeChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /table/i })).not.toBeNull();
    expect(screen.getByRole("button", { name: /cards/i })).not.toBeNull();
  });

  it("switches to cards when the cards button is pressed", async () => {
    const onViewModeChange = vi.fn();
    render(<FilterBar {...baseProps} viewMode="table" onViewModeChange={onViewModeChange} />);
    await userEvent.click(screen.getByRole("button", { name: /cards/i }));
    expect(onViewModeChange).toHaveBeenCalledWith("cards");
  });
});

describe("FilterBar select-all", () => {
  it("does not render a select-all checkbox in table view", () => {
    render(<FilterBar {...baseProps} viewMode="table" onViewModeChange={vi.fn()} />);
    expect(screen.queryByLabelText("Select all items")).toBeNull();
  });

  it("renders a select-all checkbox in cards view", () => {
    render(<FilterBar {...baseProps} viewMode="cards" onViewModeChange={vi.fn()} />);
    expect(screen.getByLabelText("Select all items")).not.toBeNull();
  });

  it("calls onToggleAll when the select-all checkbox is toggled", async () => {
    const onToggleAll = vi.fn();
    render(
      <FilterBar
        {...baseProps}
        viewMode="cards"
        onViewModeChange={vi.fn()}
        onToggleAll={onToggleAll}
      />,
    );
    await userEvent.click(screen.getByLabelText("Select all items"));
    expect(onToggleAll).toHaveBeenCalledWith(true);
  });
});
