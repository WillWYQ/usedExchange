import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName } from "pdf-lib";
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

  // Regression test for the 2026-08-16 final review's Important #1: pdf-lib's
  // PDFArray.get() type signature declares a non-optional PDFObject return,
  // but at runtime it's just `this.array[index]` (see pdf-lib's
  // src/core/objects/PDFArray.ts), which is `undefined` for an
  // out-of-range/empty array. A destination entry whose array is empty (a
  // malformed/degenerate case, but one the PDF spec doesn't forbid) must not
  // throw a TypeError out of `.toString()` on that undefined value — the
  // function's documented contract is "never throws for a partial miss," so
  // that one anchor id should simply be absent from the returned map. Built
  // directly with pdf-lib (no Chromium/Playwright needed) since Chromium's
  // own print-to-PDF never produces an empty destination array — this shape
  // has to be constructed by hand to exercise the guard at all.
  it("omits an anchor whose destination array is empty instead of throwing", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();

    const destsDict = doc.context.obj({});
    const emptyDestArray = doc.context.obj([]);
    destsDict.set(PDFName.of("broken-anchor"), emptyDestArray);
    doc.catalog.set(PDFName.of("Dests"), destsDict);

    const pdfBytes = await doc.save();

    await expect(
      resolveAnchorPageNumbers(Buffer.from(pdfBytes), ["broken-anchor"]),
    ).resolves.toEqual(new Map());
  });
});
