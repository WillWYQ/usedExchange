import { describe, expect, it } from "vitest";
import { resolveAnchorPageNumbers } from "./resolvePageNumbers";

async function chromiumAvailable(): Promise<boolean> {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    await browser.close();
    return true;
  } catch {
    return false;
  }
}

// Four-page fixture: TOC (page 1), then "first" (page 2), "second" (page 3),
// and a section with no anchor (page 4). Chromium's print-to-PDF only creates
// /Dests entries when there are actual <a href="#id"> anchor links in the
// document that reference those ids.
const FIXTURE_HTML = `
<!doctype html><html><body>
<nav style="page-break-after: always;">
  <h1>Table of Contents</h1>
  <p><a href="#first">First Item</a></p>
  <p><a href="#second">Second Item</a></p>
</nav>
<section id="first" style="page-break-after: always;">
  <h1>First Item</h1>
</section>
<section id="second" style="page-break-after: always;">
  <h1>Second Item</h1>
</section>
<section>
  <h1>Third Item (no anchor)</h1>
</section>
</body></html>`;

describe("resolveAnchorPageNumbers", () => {
  it("resolves known anchor ids to their 1-based page index, and omits unknown ids", async () => {
    if (!(await chromiumAvailable())) {
      console.warn("Skipping: Chromium not installed. Run `npx playwright install chromium`.");
      return;
    }
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setContent(FIXTURE_HTML, { waitUntil: "networkidle" });
      const pdfBytes = await page.pdf({ format: "Letter" });
      await page.close();

      const result = await resolveAnchorPageNumbers(pdfBytes, ["first", "second", "missing"]);
      expect(result.get("first")).toBe(2);
      expect(result.get("second")).toBe(3);
      expect(result.has("missing")).toBe(false);
    } finally {
      await browser.close();
    }
  });

  it("returns an empty map when the PDF has no destinations at all", async () => {
    if (!(await chromiumAvailable())) {
      console.warn("Skipping: Chromium not installed. Run `npx playwright install chromium`.");
      return;
    }
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setContent("<html><body><p>No anchors here.</p></body></html>", { waitUntil: "networkidle" });
      const pdfBytes = await page.pdf({ format: "Letter" });
      await page.close();

      const result = await resolveAnchorPageNumbers(pdfBytes, ["anything"]);
      expect(result.size).toBe(0);
    } finally {
      await browser.close();
    }
  });
});
