// studio/src/panes/Drawer.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithStudioI18n } from "../i18n/StudioI18n";
import { Drawer } from "./Drawer";
import type { StudioItem } from "../api";
import * as api from "../api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeItem(overrides: Partial<StudioItem> = {}): StudioItem {
  return {
    id: "electronics/desk-lamp",
    categorySlug: "electronics",
    itemSlug: "desk-lamp",
    name: "Desk Lamp",
    status: "available",
    currency: "USD",
    lowestTierAmount: 20,
    imageCount: 1,
    coverImage: null,
    localizedNames: { en: "Desk Lamp" },
    tags: [],
    listedDate: "2026-01-01",
    description: "A nice lamp",
    ...overrides,
  };
}

// The Photos tab is mounted eagerly (Drawer.tsx's `visited` set starts with
// "photos"), so ImagePane always calls fetchImages(item.id) on mount — stub
// it to an empty list so the drawer renders without touching the network.
// The Details tab is only mounted lazily on click, so EditForm's own fetch
// never fires in these tests and needs no stub.
function renderDrawer(item: StudioItem) {
  vi.spyOn(api, "fetchImages").mockResolvedValue([]);
  return renderWithStudioI18n(<Drawer item={item} onClose={vi.fn()} onChanged={vi.fn()} />);
}

describe("Drawer export flyer button", () => {
  it("is enabled for an available item and calls exportItemFlyerPdf on click", async () => {
    const blob = new Blob(["%PDF"], { type: "application/pdf" });
    const exportSpy = vi.spyOn(api, "exportItemFlyerPdf").mockResolvedValue(blob);
    // jsdom has no real download machinery — same stubs ExportPdfDialog.test.tsx
    // uses so the click-triggered download path does not throw.
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:fake"), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    renderDrawer(makeItem({ status: "available" }));
    const button = await screen.findByRole("button", { name: /Export flyer/ });
    expect((button as HTMLButtonElement).disabled).toBe(false);

    const user = userEvent.setup();
    await user.click(button);

    expect(exportSpy).toHaveBeenCalledWith("electronics/desk-lamp");
  });

  it("is disabled for a sold item", async () => {
    renderDrawer(makeItem({ status: "sold" }));
    const button = await screen.findByRole("button", { name: /Export flyer/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("is disabled for a draft item", async () => {
    renderDrawer(makeItem({ status: "draft" }));
    const button = await screen.findByRole("button", { name: /Export flyer/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});
