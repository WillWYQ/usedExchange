import { describe, expect, it } from "vitest";
import { renderQrSvg } from "./qr";

describe("renderQrSvg", () => {
  it("returns a self-contained SVG string with path data", async () => {
    const svg = await renderQrSvg("https://example.com/electronics/desk-lamp");
    expect(svg.trimStart().startsWith("<svg")).toBe(true);
    expect(svg).toContain("</svg>");
    // qrcode's SVG output encodes the modules as an <path>.
    expect(svg).toContain("<path");
  });

  it("is deterministic for a given input (no Date/random)", async () => {
    const a = await renderQrSvg("mailto:you@example.com");
    const b = await renderQrSvg("mailto:you@example.com");
    expect(a).toBe(b);
  });

  it("produces different output for different input", async () => {
    const a = await renderQrSvg("https://a.example");
    const b = await renderQrSvg("https://b.example");
    expect(a).not.toBe(b);
  });
});
