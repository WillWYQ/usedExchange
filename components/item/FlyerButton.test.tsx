// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FlyerButton } from "./FlyerButton";
import type { FlyerItemView } from "@/lib/pdf/flyerContent";

vi.mock("@/content/config", () => ({
  siteConfig: {
    i18n: { defaultLocale: "en", translations: { en: {} } },
  },
}));

vi.mock("@/lib/pdf/generateItemFlyer", () => ({
  generateItemFlyerPdf: vi.fn(),
}));

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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("FlyerButton", () => {
  it("shows a success state and triggers a download after a successful generation", async () => {
    const { generateItemFlyerPdf } = await import("@/lib/pdf/generateItemFlyer");
    vi.mocked(generateItemFlyerPdf).mockResolvedValue(new Blob(["%PDF"], { type: "application/pdf" }));

    const createObjectURL = vi.fn(() => "blob:fake-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<FlyerButton {...props} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Download Flyer/ }));

    await waitFor(() => expect(screen.getByRole("button").textContent).toContain("Flyer downloaded!"));
    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake-url");
  });

  it("shows a generate-error message when PDF generation throws, and re-enables the button", async () => {
    const { generateItemFlyerPdf } = await import("@/lib/pdf/generateItemFlyer");
    vi.mocked(generateItemFlyerPdf).mockRejectedValue(new Error("jsPDF exploded"));
    // jsdom has no URL.createObjectURL — stub it so the button renders enabled
    // (this test targets the generation-failure path, not the unsupported-browser path).
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:fake-url"), revokeObjectURL: vi.fn() });

    render(<FlyerButton {...props} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Download Flyer/ }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Could not generate the flyer. Please try again."),
    );
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(false);
  });

  it("renders disabled with an explanatory alert when the browser lacks Blob object URL support", () => {
    vi.stubGlobal("URL", { ...URL, createObjectURL: undefined });

    render(<FlyerButton {...props} />);
    const button = screen.getByRole("button", { name: /Download Flyer/ });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("alert").textContent).toBe("Flyer download isn't supported in this browser.");
  });
});
