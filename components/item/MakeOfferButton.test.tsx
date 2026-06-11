// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MakeOfferButton } from "./MakeOfferButton";

// vi.mock is hoisted above imports, so the mock is in place before
// MakeOfferButton.tsx (which imports @/content/config at module level) loads.
vi.mock("@/content/config", () => ({
  siteConfig: {
    i18n: { defaultLocale: "en", translations: { en: {} } },
    contact: {
      platforms: [{ type: "email", value: "seller@example.com" }],
    },
  },
}));

const props = { itemName: "Vintage Lamp", minAcceptableOffer: 50, currency: "USD" };

function openForm() {
  fireEvent.click(screen.getByText("Make an Offer"));
}

function setOffer(value: string) {
  fireEvent.change(screen.getByPlaceholderText("Enter amount"), {
    target: { value },
  });
}

function submit() {
  fireEvent.click(screen.getByText("Send"));
}

const REJECTION_TEXT = /below the minimum we can accept/;

// jsdom's real window.location throws "Not implemented: navigation" on `.href =`
// assignment. Stub it as a plain getter/setter object for every test so the
// "accepted offer" path (which navigates to a mailto: link) runs cleanly and
// its destination is observable.
function spyOnWindowOpen() {
  return vi.spyOn(window, "open").mockImplementation(() => null);
}

let assignedHref: string;
let openSpy: ReturnType<typeof spyOnWindowOpen>;
let originalLocation: Location;

beforeEach(() => {
  assignedHref = "";
  openSpy = spyOnWindowOpen();
  originalLocation = window.location;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      ...originalLocation,
      get href() {
        return assignedHref;
      },
      set href(value: string) {
        assignedHref = value;
      },
    },
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
  openSpy.mockRestore();
  cleanup();
});

describe("MakeOfferButton — numeric validation", () => {
  it("rejects an offer below the minimum acceptable amount", () => {
    render(<MakeOfferButton {...props} />);
    openForm();
    setOffer("10");
    submit();
    expect(screen.getByText(REJECTION_TEXT)).toBeTruthy();
  });

  it("rejects non-numeric input (NaN)", () => {
    render(<MakeOfferButton {...props} />);
    openForm();
    setOffer("not-a-number");
    submit();
    expect(screen.getByText(REJECTION_TEXT)).toBeTruthy();
  });

  it("rejects input that parses to Infinity", () => {
    // parseFloat("1e999") === Infinity — passes a naive `!isNaN` check but
    // must be caught by Number.isFinite, otherwise the prefilled message
    // would read "I'd like to offer $Infinity for ...".
    render(<MakeOfferButton {...props} />);
    openForm();
    setOffer("1e999");
    submit();
    expect(screen.getByText(REJECTION_TEXT)).toBeTruthy();
  });

  it("rejects absurdly large offers above the upper bound", () => {
    render(<MakeOfferButton {...props} />);
    openForm();
    setOffer("5000000");
    submit();
    expect(screen.getByText(REJECTION_TEXT)).toBeTruthy();
  });

  it("accepts an offer at or above the minimum and within the upper bound", () => {
    render(<MakeOfferButton {...props} />);
    openForm();
    setOffer("75");
    submit();
    expect(screen.queryByText(REJECTION_TEXT)).toBeNull();
  });
});

describe("MakeOfferButton — contact handoff", () => {
  it("navigates the current document to a mailto: link instead of opening a new tab", () => {
    render(<MakeOfferButton {...props} />);
    openForm();
    setOffer("75");
    submit();

    expect(assignedHref).toMatch(/^mailto:seller@example\.com\?subject=/);
    expect(assignedHref).toContain(encodeURIComponent("Offer for: Vintage Lamp"));
    expect(openSpy).not.toHaveBeenCalled();
  });
});
