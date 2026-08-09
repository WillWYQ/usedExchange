// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ItemThumb } from "./ItemThumb";

afterEach(cleanup);

const props = {
  imgClassName: "item-thumb",
  placeholderClassName: "item-thumb-placeholder",
  iconSize: 18,
};

describe("ItemThumb", () => {
  it("renders a placeholder when src is null", () => {
    const { container } = render(<ItemThumb src={null} {...props} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".item-thumb-placeholder")).not.toBeNull();
  });

  it("falls back to the placeholder when the image fails to load", () => {
    const { container } = render(<ItemThumb src="/broken.jpg" {...props} />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    fireEvent.error(img as HTMLImageElement);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".item-thumb-placeholder")).not.toBeNull();
  });

  it("clears a previous error once a new src is supplied", () => {
    const { container, rerender } = render(<ItemThumb src="/broken.jpg" {...props} />);
    fireEvent.error(container.querySelector("img") as HTMLImageElement);
    expect(container.querySelector("img")).toBeNull();

    rerender(<ItemThumb src="/fixed.jpg" {...props} />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("/fixed.jpg");
  });
});
