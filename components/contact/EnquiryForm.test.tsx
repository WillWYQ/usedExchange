// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import type { Item } from "@/lib/content/types";
import { EnquiryForm } from "./EnquiryForm";

// vi.mock is hoisted above imports, so the mock is in place before
// EnquiryForm.tsx (which imports @/content/config at module level) loads.
vi.mock("@/content/config", () => ({
  siteConfig: {
    i18n: { defaultLocale: "en", translations: { en: {} } },
    notifications: { enabled: true, proxyUrl: "https://contact-form-proxy.example.workers.dev" },
  },
}));

function makeItem(over: Partial<Item> = {}): Item {
  return {
    categorySlug: "electronics",
    itemSlug: "vintage-lamp",
    name: "Vintage Lamp",
    price: { currency: "USD", tiers: [], negotiable: false, show_tiers: false },
    ...over,
  } as Item;
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Jane Doe" } });
  fireEvent.change(screen.getByLabelText("How can we reach you?"), {
    target: { value: "jane@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "Is this still available?" },
  });
}

function submit() {
  fireEvent.click(screen.getByText("Send Enquiry"));
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("EnquiryForm — offer amount gating", () => {
  it("renders the offer amount field when the item is negotiable", () => {
    render(<EnquiryForm item={makeItem({ price: { currency: "USD", tiers: [], negotiable: true, show_tiers: false } })} />);
    expect(screen.getByLabelText("Offer amount (optional)")).toBeTruthy();
  });

  it("does not render the offer amount field when the item is not negotiable", () => {
    render(<EnquiryForm item={makeItem({ price: { currency: "USD", tiers: [], negotiable: false, show_tiers: false } })} />);
    expect(screen.queryByLabelText("Offer amount (optional)")).toBeNull();
  });
});

describe("EnquiryForm — submit state machine", () => {
  it("posts the enquiry to siteConfig.notifications.proxyUrl and shows an inline success message", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });

    render(<EnquiryForm item={makeItem()} />);
    fillRequiredFields();
    submit();

    await waitFor(() => expect(screen.getByText(/Thanks! Your message has been sent/)).toBeTruthy());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://contact-form-proxy.example.workers.dev");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      itemCategory: "electronics",
      itemSlug: "vintage-lamp",
      itemName: "Vintage Lamp",
      buyerName: "Jane Doe",
      buyerContact: "jane@example.com",
      message: "Is this still available?",
      honeypot: "",
    });
    // Not negotiable — offerAmount must be omitted entirely, not sent as
    // undefined/null, since the Worker treats its mere presence as meaningful.
    expect(body).not.toHaveProperty("offerAmount");

    // Does not navigate away — the success state renders inline instead of
    // the form; no window.location change happens anywhere in the component.
    expect(screen.queryByText("Send Enquiry")).toBeNull();
  });

  it("includes a parsed offerAmount when the item is negotiable and an amount is entered", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });

    render(
      <EnquiryForm
        item={makeItem({ price: { currency: "USD", tiers: [], negotiable: true, show_tiers: false } })}
      />,
    );
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText("Offer amount (optional)"), { target: { value: "45" } });
    submit();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.offerAmount).toBe(45);
  });

  it("includes the item's own currency code in the POST body", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });

    render(<EnquiryForm item={makeItem({ price: { currency: "GBP", tiers: [], negotiable: false, show_tiers: false } })} />);
    fillRequiredFields();
    submit();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.currency).toBe("GBP");
  });

  it("shows an inline error message and does not throw when the request fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502 });

    render(<EnquiryForm item={makeItem()} />);
    fillRequiredFields();
    submit();

    await waitFor(() => expect(screen.getByText(/Something went wrong/)).toBeTruthy());
    // The form itself remains — the buyer can retry without losing input.
    expect(screen.getByText("Send Enquiry")).toBeTruthy();
  });

  it("shows the submitting state while the request is in flight", async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    render(<EnquiryForm item={makeItem()} />);
    fillRequiredFields();
    submit();

    expect(await screen.findByText("Sending…")).toBeTruthy();

    resolveFetch({ ok: true, json: async () => ({ ok: true }) });
    await waitFor(() => expect(screen.getByText(/Thanks! Your message has been sent/)).toBeTruthy());
  });
});

describe("EnquiryForm — honeypot field", () => {
  it("renders the honeypot input off-screen but focusable (not display:none or type=hidden)", () => {
    render(<EnquiryForm item={makeItem()} />);
    const honeypot = document.getElementById("enquiry-website") as HTMLInputElement;
    expect(honeypot).toBeTruthy();
    expect(honeypot.type).toBe("text");
    expect(honeypot.getAttribute("aria-hidden")).toBe("true");
    expect(honeypot.tabIndex).toBe(-1);
    // Off-screen via positioning, not display:none/visibility:hidden — some
    // spam bots specifically skip fields hidden that way.
    const wrapper = honeypot.closest("div");
    expect(wrapper?.style.display).not.toBe("none");
    expect(wrapper?.style.position).toBe("absolute");
  });

  it("still sends an empty honeypot value for a normal submission", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });

    render(<EnquiryForm item={makeItem()} />);
    fillRequiredFields();
    submit();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.honeypot).toBe("");
  });
});
