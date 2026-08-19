import QRCode from "qrcode";

// Offline QR generation for the catalog PDF's contact page and the flyer's
// contact strip. `qrcode`'s SVG path is pure-JS (no node-canvas, no native
// build, no network) — it satisfies the DESIGN.md v1 constraint that PDF
// generation makes no network call beyond CDN item images. SVG (rather than a
// PNG data URI) is chosen so the code stays crisp at any PDF scale and so the
// output carries no `<img src>` for generate.ts's prefetchImages() to touch.
// `margin: 1` keeps the quiet zone to the spec minimum so the printed card
// stays compact while remaining scannable.
export async function renderQrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 1 });
}
