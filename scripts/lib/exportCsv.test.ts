import { describe, it, expect } from "vitest";
import { buildExportCsvRows, EXPORT_CSV_HEADERS } from "./exportCsv";
import { toCsvString } from "./csv";
import type { Item } from "@/lib/content/types";

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    categorySlug: "electronics",
    itemSlug: "item",
    name: "Item",
    description: "",
    metaDescription: "",
    condition: "good",
    status: "available",
    price: { currency: "USD", tiers: [{ label: "Pickup", amount: 20 }], negotiable: false, show_tiers: false },
    noLowball: false,
    priceReduced: false,
    previousLowestPrice: null,
    minAcceptableOffer: null,
    brand: "Acme",
    model: "X1",
    ageYears: null,
    dimensions: null,
    weight: null,
    color: "",
    quantity: 2,
    originalSource: "",
    originalLink: "",
    originalPrice: null,
    listedDate: "2026-06-01",
    soldDate: null,
    preferredPayment: [],
    contactNote: "",
    stripePaymentLink: "",
    venmoPaymentRequest: "",
    pickupWindows: [],
    youtubeLink: "",
    tags: ["a", "b"],
    categoryOverride: "",
    isbn: "",
    course: "",
    edition: "",
    semesterListed: "",
    nameZh: "",
    descriptionZh: "",
    images: [],
    coverImage: null,
    ...overrides,
  } as Item;
}

describe("buildExportCsvRows", () => {
  it("builds one row per item with the documented column order", () => {
    const rows = buildExportCsvRows([makeItem()]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual([
      "Item",
      "electronics",
      "available",
      "good",
      "20",
      "USD",
      "no",
      "Acme",
      "X1",
      "2",
      "2026-06-01",
      "",
      "a;b",
    ]);
    expect(EXPORT_CSV_HEADERS).toHaveLength(rows[0]!.length);
  });

  it("uses the lowest tier amount when multiple tiers exist", () => {
    const item = makeItem({
      price: {
        currency: "USD",
        tiers: [
          { label: "Pickup", amount: 10 },
          { label: "Shipping", amount: 25 },
        ],
        negotiable: false,
        show_tiers: false,
      },
    });
    const [row] = buildExportCsvRows([item]);
    expect(row?.[4]).toBe("10");
  });

  it("leaves price blank when there are no tiers", () => {
    const item = makeItem({ price: { currency: "USD", tiers: [], negotiable: false, show_tiers: false } });
    const [row] = buildExportCsvRows([item]);
    expect(row?.[4]).toBe("");
  });

  it("fills sold_date when present", () => {
    const item = makeItem({ status: "sold", soldDate: "2026-07-01" });
    const [row] = buildExportCsvRows([item]);
    expect(row?.[11]).toBe("2026-07-01");
  });

  it("produces output that round-trips through the shared CSV serialiser", () => {
    const rows = buildExportCsvRows([makeItem({ name: "Weird, Name" })]);
    const csv = toCsvString([...EXPORT_CSV_HEADERS], rows);
    expect(csv).toContain('"Weird, Name"');
  });
});
