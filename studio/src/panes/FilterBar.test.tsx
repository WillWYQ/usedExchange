// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

describe("FilterBar view mode", () => {
  it("renders table and cards buttons", () => {
    render(
      <FilterBar
        filters={DEFAULT_FILTERS}
        counts={baseCounts}
        categories={[]}
        resultCount={1}
        onChange={vi.fn()}
        viewMode="table"
        onViewModeChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /table/i })).not.toBeNull();
    expect(screen.getByRole("button", { name: /cards/i })).not.toBeNull();
  });

  it("switches to cards when the cards button is pressed", async () => {
    const onViewModeChange = vi.fn();
    render(
      <FilterBar
        filters={DEFAULT_FILTERS}
        counts={baseCounts}
        categories={[]}
        resultCount={1}
        onChange={vi.fn()}
        viewMode="table"
        onViewModeChange={onViewModeChange}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /cards/i }));
    expect(onViewModeChange).toHaveBeenCalledWith("cards");
  });
});
