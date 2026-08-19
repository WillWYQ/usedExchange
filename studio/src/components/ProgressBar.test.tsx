// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ProgressBar } from "./ProgressBar";

afterEach(() => {
  cleanup();
});

describe("ProgressBar", () => {
  it("renders the fill width and ARIA value from percent", () => {
    render(<ProgressBar percent={42} label="Working…" />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("42");
    expect((bar.firstChild as HTMLElement).style.width).toBe("42%");
    expect(screen.getByText("Working…")).toBeTruthy();
  });

  it("clamps out-of-range percent into [0, 100]", () => {
    const { rerender } = render(<ProgressBar percent={-10} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");

    rerender(<ProgressBar percent={150} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
  });

  it("omits the label span when no label is given", () => {
    render(<ProgressBar percent={10} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-label")).toBeNull();
  });
});
