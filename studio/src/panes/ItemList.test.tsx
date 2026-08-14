// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithStudioI18n as render } from "../i18n/StudioI18n";
import { ItemList } from "./ItemList";
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
    localizedNames: { en: name, zh: `${name}（中文）` },
    tags: [],
    listedDate: "2026-01-01",
  };
}

describe("ItemList", () => {
  it("renders a Photo column", () => {
    render(
      <ItemList
        items={[makeItem("electronics/lamp", "Lamp")]}
        selectedIds={new Set()}
        failedIds={new Set()}
        justStampedIds={new Set()}
        displayLocale="en"
        onToggle={vi.fn()}
        onToggleAll={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "Photo" })).not.toBeNull();
  });

  it("shows an image when coverImage is present", () => {
    const { container } = render(
      <ItemList
        items={[makeItem("electronics/lamp", "Lamp", "01-front.jpg")]}
        selectedIds={new Set()}
        failedIds={new Set()}
        justStampedIds={new Set()}
        displayLocale="en"
        onToggle={vi.fn()}
        onToggleAll={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    const img = container.querySelector("img.item-thumb") as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img?.src).toContain("/api/items/electronics/lamp/images/01-front.jpg");
  });

  it("shows a placeholder when coverImage is null", () => {
    const { container } = render(
      <ItemList
        items={[makeItem("electronics/lamp", "Lamp", null)]}
        selectedIds={new Set()}
        failedIds={new Set()}
        justStampedIds={new Set()}
        displayLocale="en"
        onToggle={vi.fn()}
        onToggleAll={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    expect(container.querySelector("img.item-thumb")).toBeNull();
    expect(screen.getByLabelText("Select Lamp")).not.toBeNull();
  });

  it("switches the displayed name when displayLocale changes", () => {
    const { rerender } = render(
      <ItemList
        items={[makeItem("electronics/lamp", "Lamp", null)]}
        selectedIds={new Set()}
        failedIds={new Set()}
        justStampedIds={new Set()}
        displayLocale="en"
        onToggle={vi.fn()}
        onToggleAll={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Lamp" })).not.toBeNull();
    rerender(
      <ItemList
        items={[makeItem("electronics/lamp", "Lamp", null)]}
        selectedIds={new Set()}
        failedIds={new Set()}
        justStampedIds={new Set()}
        displayLocale="zh"
        onToggle={vi.fn()}
        onToggleAll={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Lamp（中文）" })).not.toBeNull();
  });
});
