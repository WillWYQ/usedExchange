// @vitest-environment jsdom
// Isolated in its own file: the "@/lib/pdf/generateItemFlyer" mock here
// always throws on import, simulating a dynamic-import chunk-load failure
// (offline visitor, stale chunk after a redeploy). Kept separate from
// FlyerButton.test.tsx so this permanent module-registry mock never leaks
// into that file's success/generate-error cases.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FlyerButton } from "./FlyerButton";
import type { FlyerItemView } from "@/lib/pdf/flyerContent";

vi.mock("@/content/config", () => ({
  siteConfig: {
    i18n: { defaultLocale: "en", translations: { en: {} } },
  },
}));

vi.mock("@/lib/pdf/generateItemFlyer", () => {
  throw new Error("chunk load failed");
});

const item: FlyerItemView = {
  categorySlug: "electronics",
  itemSlug: "desk-lamp",
  name: "Desk Lamp",
  description: "A bright desk lamp.",
  condition: "good",
  status: "available",
  price: { currency: "USD", tiers: [{ label: "Pickup", amount: 20 }], negotiable: false, show_tiers: false },
  brand: "IKEA",
  model: "",
  ageYears: 2,
  dimensions: null,
  weight: null,
  color: "black",
  images: [],
  coverImage: null,
};

const props = {
  item,
  initialResolvedTier: { label: "Pickup", amount: 20 },
  siteName: "UsedExchange",
  baseUrl: "https://example.com",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("FlyerButton — dynamic import failure", () => {
  it("shows a load-error message and re-enables the button", async () => {
    // jsdom has no URL.createObjectURL — stub it so the button renders enabled
    // (this test targets the import-failure path, not the unsupported-browser path).
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:fake-url"), revokeObjectURL: vi.fn() });

    render(<FlyerButton {...props} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Download Flyer/ }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "Could not load the flyer generator. Check your connection and try again.",
      ),
    );
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(false);
  });
});
