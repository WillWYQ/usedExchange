// studio/src/panes/ExportPdfDialog.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithStudioI18n } from "../i18n/StudioI18n";
import { ExportPdfDialog } from "./ExportPdfDialog";
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

// The dialog resolves its copy through useStudioT, so it must mount inside a
// StudioI18nProvider — same pattern DefaultsPane.test.tsx uses.
function renderDialog(items: StudioItem[], onClose = vi.fn()) {
  return renderWithStudioI18n(<ExportPdfDialog items={items} onClose={onClose} />);
}

describe("ExportPdfDialog", () => {
  it("shows the eligible item and category count", () => {
    renderDialog([
      makeItem({ id: "a", categorySlug: "electronics", status: "available" }),
      makeItem({ id: "b", categorySlug: "books", status: "sold" }),
    ]);
    expect(screen.getByText(/1 items across 1 categories/)).toBeTruthy();
  });

  it("disables the generate button while busy and re-enables after success", async () => {
    const blob = new Blob(["%PDF"], { type: "application/pdf" });
    vi.spyOn(api, "exportCatalogPdf").mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(blob), 10)),
    );
    // jsdom has no real download machinery; createObjectURL/revokeObjectURL are stubbed
    // so the click-triggered download path does not throw. jsdom also logs a
    // "Not implemented: navigation" error when an <a> with an unrecognized
    // blob: href is clicked, so the click itself is stubbed too — the
    // component's use of it is still exercised, just not jsdom's navigation.
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:fake"), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    renderDialog([makeItem()]);
    const user = userEvent.setup();
    const button = screen.getByRole("button", { name: /Generate & Download/ });
    await user.click(button);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await screen.findByText(/Downloaded/);
  });

  it("shows the server's error message on failure", async () => {
    vi.spyOn(api, "exportCatalogPdf").mockRejectedValue(new Error("No public-visible items to export."));
    renderDialog([makeItem()]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Generate & Download/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("No public-visible items to export.");
  });

  it("shows a readiness warning for an item missing photos and description", () => {
    renderDialog([
      makeItem({ id: "a", imageCount: 0, description: "" }),
    ]);
    expect(screen.getByText(/may look sparse/)).toBeTruthy();
  });
});
