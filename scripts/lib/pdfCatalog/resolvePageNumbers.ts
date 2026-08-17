import type * as PdfLib from "pdf-lib";

// Resolves the physical PDF page each HTML anchor id landed on, by reading
// the rendered PDF's own internal destinations rather than re-implementing
// Chromium's print pagination. Chromium's print-to-PDF registers every HTML
// anchor `id` as a named PDF destination in the document catalog's /Dests
// dictionary (confirmed via a throwaway spike, flat-dict form, up to 30
// anchors) — this is a direct lookup, not annotation/link-order matching.
//
// pdf-lib is imported dynamically for the same reason playwright is
// dynamically imported in generate.ts: this module is reachable from
// generate.ts, which studioApi.ts imports at Studio module-load time, so a
// static import of a devDependency would crash Studio boot on a site that
// skipped `pnpm install`.
export async function resolveAnchorPageNumbers(
  pdfBytes: Buffer,
  anchorIds: string[],
): Promise<Map<string, number>> {
  const pdfLib = await import("pdf-lib");
  const doc = await pdfLib.PDFDocument.load(pdfBytes);

  const pages = doc.getPages();
  const pageRefToIndex = new Map<string, number>();
  pages.forEach((page, index) => pageRefToIndex.set(page.ref.toString(), index));

  const destsDict = resolveDestsDict(pdfLib, doc);
  const result = new Map<string, number>();
  if (destsDict === undefined) return result;

  for (const id of anchorIds) {
    const entry = doc.context.lookup(destsDict.get(pdfLib.PDFName.of(id)));
    const destArray = extractDestArray(pdfLib, doc, entry);
    if (destArray === undefined) continue;
    const pageRef = destArray.get(0);
    const pageIndex = pageRefToIndex.get(pageRef.toString());
    if (pageIndex !== undefined) result.set(id, pageIndex + 1);
  }
  return result;
}

// Handles both PDF destination forms this feature might encounter: a flat
// /Root/Dests dictionary (the form Chromium's output used in spike testing,
// confirmed at 30 anchors) and the tree-based /Root/Names/Dests name-tree
// form the PDF spec also allows (not observed in testing, but cheap
// defensive coverage against a future Chromium version or a much larger
// catalog).
function resolveDestsDict(pdfLib: typeof PdfLib, doc: PdfLib.PDFDocument): PdfLib.PDFDict | undefined {
  const { PDFDict, PDFName } = pdfLib;
  const catalog = doc.catalog;

  const flatDests = doc.context.lookup(catalog.get(PDFName.of("Dests")));
  if (flatDests instanceof PDFDict) return flatDests;

  const namesDict = doc.context.lookup(catalog.get(PDFName.of("Names")));
  if (!(namesDict instanceof PDFDict)) return undefined;
  const destsTree = doc.context.lookup(namesDict.get(PDFName.of("Dests")));
  if (!(destsTree instanceof PDFDict)) return undefined;
  return flattenNameTree(pdfLib, doc, destsTree);
}

// A /Names/Dests name tree is a recursive /Kids (child nodes) and/or /Names
// (flat [name1, dest1, name2, dest2, ...] leaf pairs) structure per PDF spec
// §7.9.6. Flattened here into one dict keyed the same way a flat /Dests
// dictionary already is, so the caller's lookup loop doesn't need to know
// which form the source PDF used.
function flattenNameTree(pdfLib: typeof PdfLib, doc: PdfLib.PDFDocument, node: PdfLib.PDFDict): PdfLib.PDFDict {
  const { PDFDict, PDFArray, PDFName } = pdfLib;
  const flat = doc.context.obj({}) as PdfLib.PDFDict;

  const names = doc.context.lookup(node.get(PDFName.of("Names")));
  if (names instanceof PDFArray) {
    for (let i = 0; i + 1 < names.size(); i += 2) {
      const nameKey = names.get(i);
      if (nameKey instanceof PDFName) flat.set(nameKey, names.get(i + 1));
    }
  }

  const kids = doc.context.lookup(node.get(PDFName.of("Kids")));
  if (kids instanceof PDFArray) {
    for (let i = 0; i < kids.size(); i++) {
      const kid = doc.context.lookup(kids.get(i));
      if (kid instanceof PDFDict) {
        const childFlat = flattenNameTree(pdfLib, doc, kid);
        for (const key of childFlat.keys()) {
          const val = childFlat.get(key);
          if (val !== undefined) flat.set(key, val);
        }
      }
    }
  }

  return flat;
}

// A destination value is either a direct [pageRef, /XYZ, x, y, zoom] array
// (the form Chromium's output used in spike testing) or an indirect
// { D: [pageRef, ...] } action-style wrapper (also PDF-spec-valid, cheap to
// also support).
function extractDestArray(
  pdfLib: typeof PdfLib,
  doc: PdfLib.PDFDocument,
  entry: PdfLib.PDFObject | undefined,
): PdfLib.PDFArray | undefined {
  const { PDFArray, PDFDict, PDFName } = pdfLib;
  if (entry instanceof PDFArray) return entry;
  if (entry instanceof PDFDict) {
    const inner = doc.context.lookup(entry.get(PDFName.of("D")));
    if (inner instanceof PDFArray) return inner;
  }
  return undefined;
}
