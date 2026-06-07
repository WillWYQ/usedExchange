// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { LocationPriceBar } from "./LocationPriceBar";

// Vitest doesn't auto-register RTL's cleanup without `test.globals: true`;
// without it, DOM nodes accumulate across tests within this file, causing
// "found multiple elements" failures on repeated text/label queries.
afterEach(cleanup);

describe("LocationPriceBar", () => {
  describe("idle / pending states", () => {
    it("shows the detecting spinner for idle", () => {
      render(
        <LocationPriceBar geoState={{ status: "idle" }} resolved={{ source: "fallback" }} onManualMiles={vi.fn()} />,
      );
      expect(screen.getByText("Detecting location…")).toBeTruthy();
    });

    it("shows the detecting spinner for pending", () => {
      render(
        <LocationPriceBar geoState={{ status: "pending" }} resolved={{ source: "fallback" }} onManualMiles={vi.fn()} />,
      );
      expect(screen.getByText("Detecting location…")).toBeTruthy();
    });
  });

  describe("granted state", () => {
    it("displays the detected distance rounded to one decimal", () => {
      render(
        <LocationPriceBar
          geoState={{ status: "granted", lat: 1, lng: 1 }}
          resolved={{ source: "detected", miles: 7.34 }}
          onManualMiles={vi.fn()}
        />,
      );
      expect(screen.getByText("7.3 mi")).toBeTruthy();
      expect(screen.getByText("from seller")).toBeTruthy();
    });

    it("offers an 'Enter manually' toggle", () => {
      render(
        <LocationPriceBar
          geoState={{ status: "granted", lat: 1, lng: 1 }}
          resolved={{ source: "detected", miles: 5 }}
          onManualMiles={vi.fn()}
        />,
      );
      expect(screen.getByText("Enter manually")).toBeTruthy();
    });

    it("opening the manual input pre-fills the rounded detected distance", () => {
      render(
        <LocationPriceBar
          geoState={{ status: "granted", lat: 1, lng: 1 }}
          resolved={{ source: "detected", miles: 12.6 }}
          onManualMiles={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByText("Enter manually"));
      expect(screen.getByLabelText<HTMLInputElement>("Distance in miles").value).toBe("13");
    });
  });

  describe("manual override state", () => {
    it("displays the manual distance with a '(manual)' label", () => {
      render(
        <LocationPriceBar
          geoState={{ status: "granted", lat: 1, lng: 1 }}
          resolved={{ source: "manual", miles: 15 }}
          onManualMiles={vi.fn()}
        />,
      );
      expect(screen.getByText("15.0 mi")).toBeTruthy();
      expect(screen.getByText("(manual)")).toBeTruthy();
    });

    it("'Clear' calls onManualMiles(null) and closes the input", () => {
      const onManualMiles = vi.fn();
      render(
        <LocationPriceBar
          geoState={{ status: "granted", lat: 1, lng: 1 }}
          resolved={{ source: "manual", miles: 15 }}
          onManualMiles={onManualMiles}
        />,
      );
      fireEvent.click(screen.getByText("Clear"));
      expect(onManualMiles).toHaveBeenCalledWith(null);
      expect(screen.queryByLabelText("Distance in miles")).toBeNull();
    });

    it("'Edit' opens the input pre-filled with the current manual distance", () => {
      render(
        <LocationPriceBar
          geoState={{ status: "granted", lat: 1, lng: 1 }}
          resolved={{ source: "manual", miles: 8 }}
          onManualMiles={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByText("Edit"));
      expect(screen.getByLabelText<HTMLInputElement>("Distance in miles").value).toBe("8");
    });
  });

  describe("fallback state (denied / unavailable)", () => {
    it("shows the pickup-rate explanation", () => {
      render(
        <LocationPriceBar geoState={{ status: "denied" }} resolved={{ source: "fallback" }} onManualMiles={vi.fn()} />,
      );
      expect(screen.getByText("Prices shown at pickup rate")).toBeTruthy();
    });

    it("'Enter distance' reveals the manual input", () => {
      render(
        <LocationPriceBar geoState={{ status: "denied" }} resolved={{ source: "fallback" }} onManualMiles={vi.fn()} />,
      );
      fireEvent.click(screen.getByText("Enter distance"));
      expect(screen.getByLabelText("Distance in miles")).toBeTruthy();
    });

    it("submitting a valid distance calls onManualMiles with the parsed value", () => {
      const onManualMiles = vi.fn();
      render(
        <LocationPriceBar
          geoState={{ status: "denied" }}
          resolved={{ source: "fallback" }}
          onManualMiles={onManualMiles}
        />,
      );
      fireEvent.click(screen.getByText("Enter distance"));
      fireEvent.change(screen.getByLabelText("Distance in miles"), { target: { value: "12.5" } });
      fireEvent.click(screen.getByText("Apply"));
      expect(onManualMiles).toHaveBeenCalledWith(12.5);
    });

    it("rejects distances above the sanity ceiling (12,500 mi)", () => {
      const onManualMiles = vi.fn();
      render(
        <LocationPriceBar
          geoState={{ status: "denied" }}
          resolved={{ source: "fallback" }}
          onManualMiles={onManualMiles}
        />,
      );
      fireEvent.click(screen.getByText("Enter distance"));
      fireEvent.change(screen.getByLabelText("Distance in miles"), { target: { value: "999999" } });
      fireEvent.click(screen.getByText("Apply"));
      expect(onManualMiles).not.toHaveBeenCalled();
    });

    it("rejects negative and non-numeric input", () => {
      const onManualMiles = vi.fn();
      render(
        <LocationPriceBar
          geoState={{ status: "denied" }}
          resolved={{ source: "fallback" }}
          onManualMiles={onManualMiles}
        />,
      );
      fireEvent.click(screen.getByText("Enter distance"));
      const input = screen.getByLabelText("Distance in miles");

      fireEvent.change(input, { target: { value: "-5" } });
      fireEvent.click(screen.getByText("Apply"));
      expect(onManualMiles).not.toHaveBeenCalled();

      fireEvent.change(input, { target: { value: "abc" } });
      fireEvent.click(screen.getByText("Apply"));
      expect(onManualMiles).not.toHaveBeenCalled();
    });

    it("Escape closes the input without submitting", () => {
      const onManualMiles = vi.fn();
      render(
        <LocationPriceBar
          geoState={{ status: "denied" }}
          resolved={{ source: "fallback" }}
          onManualMiles={onManualMiles}
        />,
      );
      fireEvent.click(screen.getByText("Enter distance"));
      fireEvent.keyDown(screen.getByLabelText("Distance in miles"), { key: "Escape" });
      expect(screen.queryByLabelText("Distance in miles")).toBeNull();
      expect(onManualMiles).not.toHaveBeenCalled();
    });

    it("'Cancel' closes the input without submitting", () => {
      render(
        <LocationPriceBar geoState={{ status: "denied" }} resolved={{ source: "fallback" }} onManualMiles={vi.fn()} />,
      );
      fireEvent.click(screen.getByText("Enter distance"));
      fireEvent.click(screen.getByLabelText("Cancel"));
      expect(screen.queryByLabelText("Distance in miles")).toBeNull();
    });
  });
});
