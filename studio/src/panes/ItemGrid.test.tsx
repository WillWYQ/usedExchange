// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItemGrid } from "./ItemGrid";
import type { StudioItem } from "../api";

afterEach(cleanup);

function makeItem(id: string, name: string, coverImage: string | null = null): StudioItem {
  return {
    id,
    categorySlug: "electronics",
    itemSlug: id.split("/")[1] ?? id,
    name,
    status: "available",
    currency: "USD",
    lowestTierAmount: 10,
    imageCount: coverImage ? 1 : 0,
    coverImage,
    localizedNames: { en: name },
    tags: [],
    listedDate: "2026-01-01",
  };
}

describe("ItemGrid", () => {
  it("renders one card per item", () => {
    render(
      <ItemGrid
        items={[makeItem("electronics/lamp", "Lamp")]}
        selectedIds={new Set()}
        displayLocale="en"
        onToggle={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Lamp" })).not.toBeNull();
  });

  it("calls onOpen when the card main area is clicked", async () => {
    const onOpen = vi.fn();
    render(
      <ItemGrid
        items={[makeItem("electronics/lamp", "Lamp")]}
        selectedIds={new Set()}
        displayLocale="en"
        onToggle={vi.fn()}
        onOpen={onOpen}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Lamp" }));
    expect(onOpen).toHaveBeenCalledWith("electronics/lamp");
  });

  it("calls onToggle but not onOpen when the checkbox is clicked", async () => {
    const onToggle = vi.fn();
    const onOpen = vi.fn();
    render(
      <ItemGrid
        items={[makeItem("electronics/lamp", "Lamp")]}
        selectedIds={new Set()}
        displayLocale="en"
        onToggle={onToggle}
        onOpen={onOpen}
      />,
    );
    await userEvent.click(screen.getByRole("checkbox"));
    expect(onToggle).toHaveBeenCalledWith("electronics/lamp");
    expect(onOpen).not.toHaveBeenCalled();
  });
});
