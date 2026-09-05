import { describe, it, expect } from "vitest";
import { buildInventoryTable } from "./inventory";
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
    brand: "",
    model: "",
    ageYears: null,
    dimensions: null,
    weight: null,
    color: "",
    quantity: 1,
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
    tags: [],
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

describe("buildInventoryTable", () => {
  const now = new Date("2026-06-14T00:00:00Z");

  it("renders a header-only table when there are no items", () => {
    const table = buildInventoryTable([], now);
    expect(table).toContain("| Name | Category | Status | Price | Days Listed |");
    expect(table).toContain("no items found");
  });

  it("renders name, category, status, lowest price, and days listed", () => {
    const items = [
      makeItem({
        name: "IKEA Lamp",
        categorySlug: "houseware",
        status: "available",
        listedDate: "2026-06-01",
        price: {
          currency: "USD",
          tiers: [
            { label: "Pickup", amount: 10 },
            { label: "Shipping", amount: 20 },
          ],
          negotiable: false,
          show_tiers: false,
        },
      }),
    ];
    const table = buildInventoryTable(items, now);
    expect(table).toContain("| IKEA Lamp | houseware | available | USD 10 | 13 |");
  });

  it("shows an em-dash when there are no price tiers", () => {
    const items = [makeItem({ price: { currency: "USD", tiers: [], negotiable: false, show_tiers: false } })];
    const table = buildInventoryTable(items, now);
    expect(table).toContain("| — |");
  });

  it("sorts by category then name", () => {
    const items = [
      makeItem({ name: "Zebra", categorySlug: "a", itemSlug: "zebra" }),
      makeItem({ name: "Apple", categorySlug: "a", itemSlug: "apple" }),
      makeItem({ name: "Banana", categorySlug: "b", itemSlug: "banana" }),
    ];
    const table = buildInventoryTable(items, now);
    const nameOrder = table
      .split("\n")
      .filter((l) => l.startsWith("| "))
      .slice(1) // drop header row
      .map((l) => l.split("|")[1]?.trim());
    expect(nameOrder).toEqual(["Apple", "Zebra", "Banana"]);
  });

  it("escapes a pipe character in a name so the table doesn't break", () => {
    const items = [makeItem({ name: "Weird | Name" })];
    const table = buildInventoryTable(items, now);
    expect(table).toContain("Weird \\| Name");
  });
});
