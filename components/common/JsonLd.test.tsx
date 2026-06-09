// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { JsonLd } from "./JsonLd";

afterEach(cleanup);

describe("JsonLd — script-tag injection safety", () => {
  it("escapes '<' so a malicious item name cannot break out of the <script> tag", () => {
    const { container } = render(
      <JsonLd data={{ name: "</script><script>alert(1)</script>" }} />,
    );
    const script = container.querySelector("script");
    expect(script).not.toBeNull();

    const html = script!.innerHTML;
    // The literal closing tag must never appear verbatim — that is the breakout.
    expect(html).not.toContain("</script>");
    // It is present, but as an escaped < sequence.
    expect(html).toContain("\\u003c/script");
  });

  it("still round-trips to valid JSON once the escaping is reversed", () => {
    const data = { "@type": "Product", name: "Plain Item", price: 42 };
    const { container } = render(<JsonLd data={data} />);
    const html = container.querySelector("script")!.innerHTML;
    expect(JSON.parse(html.replace(/\\u003c/g, "<"))).toEqual(data);
  });
});
