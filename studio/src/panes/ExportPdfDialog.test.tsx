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

const DEFAULT_PROPS = {
  categorySlugs: ["electronics", "books"],
  availableLocales: ["en", "zh"],
  defaultLocale: "en",
};

function renderDialog(
  items: StudioItem[],
  overrides: Partial<typeof DEFAULT_PROPS> = {},
  onClose = vi.fn(),
) {
  return renderWithStudioI18n(
    <ExportPdfDialog items={items} onClose={onClose} {...DEFAULT_PROPS} {...overrides} />,
  );
}

describe("ExportPdfDialog", () => {
  it("shows the eligible item and category count with the default status selection", () => {
    renderDialog([
      makeItem({ id: "a", categorySlug: "electronics", status: "available" }),
      makeItem({ id: "b", categorySlug: "books", status: "sold" }),
    ]);
    // "sold" is unchecked by default, so only the electronics item counts.
    expect(screen.getByText(/1 items across 1 categories/)).toBeTruthy();
  });

  it("recomputes the summary when a status checkbox is toggled", async () => {
    renderDialog([
      makeItem({ id: "a", categorySlug: "electronics", status: "available" }),
      makeItem({ id: "b", categorySlug: "books", status: "sold" }),
    ]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: /Sold/ }));
    expect(screen.getByText(/2 items across 2 categories/)).toBeTruthy();
  });

  it("recomputes the summary when a category checkbox is unchecked", async () => {
    renderDialog([
      makeItem({ id: "a", categorySlug: "electronics", status: "available" }),
      makeItem({ id: "b", categorySlug: "books", status: "available" }),
    ]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: "books" }));
    expect(screen.getByText(/1 items across 1 categories/)).toBeTruthy();
  });

  it("defaults the language select to defaultLocale and the price strategy to average", () => {
    renderDialog([makeItem()]);
    expect((screen.getByLabelText("Language") as HTMLSelectElement).value).toBe("en");
    expect((screen.getByLabelText("Highlighted price") as HTMLSelectElement).value).toBe("average");
  });

  it("sends the selected options as the request body", async () => {
    const blob = new Blob(["%PDF"], { type: "application/pdf" });
    const spy = vi.spyOn(api, "exportCatalogPdf").mockResolvedValue(blob);
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:fake"), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    renderDialog([makeItem({ categorySlug: "electronics", status: "available" })]);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Language"), "zh");
    await user.selectOptions(screen.getByLabelText("Highlighted price"), "lowest");
    await user.click(screen.getByRole("button", { name: /Generate & Download/ }));

    expect(spy).toHaveBeenCalledWith({
      locale: "zh",
      priceStrategy: "lowest",
      categories: ["electronics", "books"],
      statuses: ["available", "pending", "reserved"],
    });
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
    vi.spyOn(api, "exportCatalogPdf").mockRejectedValue(new Error("No items match the selected filters."));
    renderDialog([makeItem()]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Generate & Download/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("No items match the selected filters.");
  });

  it("shows a readiness warning for an item missing photos and description", () => {
    renderDialog([
      makeItem({ id: "a", imageCount: 0, description: "" }),
    ]);
    expect(screen.getByText(/may look sparse/)).toBeTruthy();
  });

  it("switching to flyer mode shows the item select and hides the catalog summary", async () => {
    renderDialog([makeItem({ id: "a" }), makeItem({ id: "b", categorySlug: "books" })]);
    // Catalog mode is the default: the summary paragraph is visible and
    // there is no flyer item dropdown yet (catalog mode does have its own
    // language/price-strategy comboboxes, so this asserts on the flyer
    // select's own accessible name rather than combobox-count-is-zero).
    expect(screen.getByText(/items across .* categories/)).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Item" })).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: /Single-item flyer/ }));

    expect(screen.queryByText(/items across .* categories/)).toBeNull();
    expect(screen.getByRole("combobox", { name: "Item" })).toBeTruthy();
  });

  it("switching to flyer mode hides the readiness-warning panel", async () => {
    // This is the one cross-task integration point in this branch: the
    // warnings useMemo must actually gate on `mode`, not just recompute the
    // same list regardless of it — a future refactor of that useMemo could
    // silently drop the gating with nothing else to catch it.
    renderDialog([makeItem({ id: "a", imageCount: 0, description: "" })]);
    expect(screen.getByText(/may look sparse/)).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: /Single-item flyer/ }));

    expect(screen.queryByText(/may look sparse/)).toBeNull();
  });

  it("populates the flyer select with eligible items and disables Generate until one is chosen", async () => {
    renderDialog([
      makeItem({ id: "a", categorySlug: "electronics", name: "Desk Lamp", status: "available" }),
      makeItem({ id: "b", categorySlug: "books", name: "Novel", status: "available" }),
      makeItem({ id: "c", categorySlug: "toys", name: "Yo-yo", status: "sold" }),
    ]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: /Single-item flyer/ }));

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    const optionNames = Array.from(select.options).map((o) => o.textContent);
    expect(optionNames).toEqual(["Desk Lamp", "Novel"]);

    // An eligible item is auto-selected by default, so Generate starts
    // enabled...
    const button = screen.getByRole("button", { name: /Generate & Download/ });
    expect((button as HTMLButtonElement).disabled).toBe(false);

    // ...but picking the dropdown's own "no selection" is not offered by
    // this UI; instead assert the disabling logic directly covers the case
    // where no eligible item exists at all, since a real <select> in jsdom
    // cannot be driven to an out-of-list empty value via user-event.
    cleanup();
    renderDialog([makeItem({ id: "c", status: "sold" })]);
    await user.click(screen.getByRole("radio", { name: /Single-item flyer/ }));
    expect((screen.getByRole("button", { name: /Generate & Download/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
