import { describe, it, expect } from "vitest";
import { extractImportCandidates, MAX_IMPORT_IMAGE_CANDIDATES } from "./urlImport";

const PAGE_URL = "https://marketplace.example.com/listings/vintage-bike-123";

function jsonLd(obj: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
}

describe("extractImportCandidates — name fallback chain", () => {
  it("prefers JSON-LD Product name over everything else", () => {
    const html = `
      ${jsonLd({ "@type": "Product", name: "JSON-LD Bike" })}
      <meta property="og:title" content="OG Bike">
      <meta name="twitter:title" content="Twitter Bike">
      <title>Title Bike</title>
      <h1>H1 Bike</h1>
    `;
    expect(extractImportCandidates(html, PAGE_URL).name).toBe("JSON-LD Bike");
  });

  it("falls through to og:title when JSON-LD is absent", () => {
    const html = `
      <meta property="og:title" content="OG Bike">
      <meta name="twitter:title" content="Twitter Bike">
      <title>Title Bike</title>
    `;
    expect(extractImportCandidates(html, PAGE_URL).name).toBe("OG Bike");
  });

  it("falls through to twitter:title when JSON-LD and og:title are absent", () => {
    const html = `
      <meta name="twitter:title" content="Twitter Bike">
      <title>Title Bike</title>
      <h1>H1 Bike</h1>
    `;
    expect(extractImportCandidates(html, PAGE_URL).name).toBe("Twitter Bike");
  });

  it("falls through to <title> when only title and h1 are present", () => {
    const html = `<title>Title Bike</title><h1>H1 Bike</h1>`;
    expect(extractImportCandidates(html, PAGE_URL).name).toBe("Title Bike");
  });

  it("falls through to <h1> when nothing else is present", () => {
    const html = `<div>no title here</div><h1>H1 <b>Bike</b></h1>`;
    expect(extractImportCandidates(html, PAGE_URL).name).toBe("H1 Bike");
  });

  it("returns null when nothing usable is found", () => {
    expect(extractImportCandidates("<html><body>nothing</body></html>", PAGE_URL).name).toBeNull();
  });
});

describe("extractImportCandidates — <title> boilerplate stripping", () => {
  it("strips a trailing ' | SiteName' suffix", () => {
    const html = `<title>Vintage Bike | Cool Marketplace</title>`;
    expect(extractImportCandidates(html, PAGE_URL).name).toBe("Vintage Bike");
  });

  it("strips a trailing ' - SiteName' suffix", () => {
    const html = `<title>Vintage Bike - Cool Marketplace</title>`;
    expect(extractImportCandidates(html, PAGE_URL).name).toBe("Vintage Bike");
  });

  it("strips a trailing ' — SiteName' (em dash) suffix", () => {
    const html = `<title>Vintage Bike — Cool Marketplace</title>`;
    expect(extractImportCandidates(html, PAGE_URL).name).toBe("Vintage Bike");
  });

  it("leaves a title with no separator untouched", () => {
    const html = `<title>Anker PowerCore-20000 Portable Charger</title>`;
    expect(extractImportCandidates(html, PAGE_URL).name).toBe("Anker PowerCore-20000 Portable Charger");
  });
});

describe("extractImportCandidates — meta attribute order independence", () => {
  it("matches og:title with property before content", () => {
    const html = `<meta property="og:title" content="Order A">`;
    expect(extractImportCandidates(html, PAGE_URL).name).toBe("Order A");
  });

  it("matches og:title with content before property", () => {
    const html = `<meta content="Order B" property="og:title">`;
    expect(extractImportCandidates(html, PAGE_URL).name).toBe("Order B");
  });
});

describe("extractImportCandidates — JSON-LD image shapes", () => {
  it("extracts a plain string image", () => {
    const html = jsonLd({ "@type": "Product", name: "X", image: "https://cdn.example.com/a.jpg" });
    expect(extractImportCandidates(html, PAGE_URL).images).toEqual(["https://cdn.example.com/a.jpg"]);
  });

  it("extracts an array of string images", () => {
    const html = jsonLd({
      "@type": "Product",
      name: "X",
      image: ["https://cdn.example.com/a.jpg", "https://cdn.example.com/b.jpg"],
    });
    expect(extractImportCandidates(html, PAGE_URL).images).toEqual([
      "https://cdn.example.com/a.jpg",
      "https://cdn.example.com/b.jpg",
    ]);
  });

  it("extracts an array of {url} objects", () => {
    const html = jsonLd({
      "@type": "Product",
      name: "X",
      image: [{ url: "https://cdn.example.com/a.jpg" }, { url: "https://cdn.example.com/b.jpg" }],
    });
    expect(extractImportCandidates(html, PAGE_URL).images).toEqual([
      "https://cdn.example.com/a.jpg",
      "https://cdn.example.com/b.jpg",
    ]);
  });

  it("unwraps @graph and finds the Product inside it", () => {
    const html = jsonLd({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Organization", name: "Not This" },
        { "@type": "Product", name: "Graph Bike", image: "https://cdn.example.com/graph.jpg" },
      ],
    });
    const result = extractImportCandidates(html, PAGE_URL);
    expect(result.name).toBe("Graph Bike");
    expect(result.images).toEqual(["https://cdn.example.com/graph.jpg"]);
  });

  it("matches when @type is an array containing Product", () => {
    const html = jsonLd({ "@type": ["Thing", "Product"], name: "Array Type Bike" });
    expect(extractImportCandidates(html, PAGE_URL).name).toBe("Array Type Bike");
  });

  it("does not throw on malformed JSON-LD and still extracts from other sources", () => {
    const html = `
      <script type="application/ld+json">{not valid json</script>
      <meta property="og:title" content="Still Works">
      <img src="https://cdn.example.com/still.jpg">
    `;
    const result = extractImportCandidates(html, PAGE_URL);
    expect(result.name).toBe("Still Works");
    expect(result.images).toEqual(["https://cdn.example.com/still.jpg"]);
  });
});

describe("extractImportCandidates — <img> extraction", () => {
  it("pulls multiple URLs out of a single srcset", () => {
    const html = `<img srcset="https://cdn.example.com/small.jpg 480w, https://cdn.example.com/large.jpg 1200w">`;
    const result = extractImportCandidates(html, PAGE_URL);
    expect(result.images).toContain("https://cdn.example.com/small.jpg");
    expect(result.images).toContain("https://cdn.example.com/large.jpg");
    // Largest descriptor first within the tag's own srcset.
    expect(result.images[0]).toBe("https://cdn.example.com/large.jpg");
  });

  it("falls back through lazy-load attributes when src is absent", () => {
    const html = `<img data-lazy-src="https://cdn.example.com/lazy.jpg">`;
    expect(extractImportCandidates(html, PAGE_URL).images).toEqual(["https://cdn.example.com/lazy.jpg"]);
  });
});

describe("extractImportCandidates — relative and protocol-relative URLs", () => {
  it("resolves an absolute-path image against pageUrl", () => {
    const html = `<img src="/images/foo.jpg">`;
    expect(extractImportCandidates(html, PAGE_URL).images).toEqual([
      "https://marketplace.example.com/images/foo.jpg",
    ]);
  });

  it("resolves a relative image against pageUrl's directory", () => {
    const html = `<img src="../foo.jpg">`;
    const result = extractImportCandidates(html, PAGE_URL);
    expect(result.images).toEqual(["https://marketplace.example.com/foo.jpg"]);
  });

  it("resolves a protocol-relative image using pageUrl's scheme", () => {
    const html = `<img src="//cdn.example.com/foo.jpg">`;
    expect(extractImportCandidates(html, PAGE_URL).images).toEqual(["https://cdn.example.com/foo.jpg"]);
  });
});

describe("extractImportCandidates — dropped URL schemes", () => {
  it("drops data: image URLs without throwing", () => {
    const html = `<img src="data:image/png;base64,AAAA">`;
    expect(extractImportCandidates(html, PAGE_URL).images).toEqual([]);
  });

  it("drops javascript: hrefs without throwing", () => {
    const html = `<link rel="preload" as="image" href="javascript:alert(1)">`;
    expect(extractImportCandidates(html, PAGE_URL).images).toEqual([]);
  });

  it("drops blob: URLs without throwing", () => {
    const html = `<img src="blob:https://marketplace.example.com/xyz">`;
    expect(extractImportCandidates(html, PAGE_URL).images).toEqual([]);
  });
});

describe("extractImportCandidates — junk filtering", () => {
  it("excludes logo, favicon, pixel, and 1x1-dimensioned images while keeping a real photo", () => {
    const html = `
      <img src="https://cdn.example.com/site-logo.png">
      <img src="https://cdn.example.com/favicon.ico">
      <img src="https://cdn.example.com/pixel.gif">
      <img src="https://cdn.example.com/spy.gif" width="1" height="1">
      <img src="https://cdn.example.com/product-photo.jpg">
    `;
    expect(extractImportCandidates(html, PAGE_URL).images).toEqual(["https://cdn.example.com/product-photo.jpg"]);
  });

  it("keeps a normal product photo that carries no dimension attributes", () => {
    const html = `<img src="https://cdn.example.com/no-dims.jpg">`;
    expect(extractImportCandidates(html, PAGE_URL).images).toEqual(["https://cdn.example.com/no-dims.jpg"]);
  });

  it("drops known tracking-beacon hosts", () => {
    const html = `<img src="https://www.googletagmanager.com/gtm.js?a=1">`;
    expect(extractImportCandidates(html, PAGE_URL).images).toEqual([]);
  });
});

describe("extractImportCandidates — dedup and cap", () => {
  it("dedups the same image referenced via og:image and an <img> src", () => {
    const html = `
      <meta property="og:image" content="https://cdn.example.com/shared.jpg">
      <img src="https://cdn.example.com/shared.jpg">
    `;
    expect(extractImportCandidates(html, PAGE_URL).images).toEqual(["https://cdn.example.com/shared.jpg"]);
  });

  it("caps the image list at MAX_IMPORT_IMAGE_CANDIDATES", () => {
    const imgs = Array.from({ length: MAX_IMPORT_IMAGE_CANDIDATES + 15 }, (_, i) => `<img src="https://cdn.example.com/photo-${i}.jpg">`).join("\n");
    const result = extractImportCandidates(imgs, PAGE_URL);
    expect(result.images).toHaveLength(MAX_IMPORT_IMAGE_CANDIDATES);
  });
});

describe("extractImportCandidates — empty and garbage input", () => {
  it("returns { name: null, images: [] } for an empty string", () => {
    expect(extractImportCandidates("", PAGE_URL)).toEqual({ name: null, images: [] });
  });

  it("returns { name: null, images: [] } for a bare <html></html>", () => {
    expect(extractImportCandidates("<html></html>", PAGE_URL)).toEqual({ name: null, images: [] });
  });

  it("does not throw on a truncated/broken document", () => {
    const html = `<html><head><title>Broken<body><img src="https://cdn.example.com/a.jpg"><div class="unclosed`;
    expect(() => extractImportCandidates(html, PAGE_URL)).not.toThrow();
  });
});

describe("extractImportCandidates — large well-formed document", () => {
  it("still parses correctly and reasonably fast", () => {
    const filler = Array.from({ length: 20000 }, (_, i) => `<div class="filler-${i}">some text content here</div>`).join("\n");
    const html = `
      <html><head><title>Big Page | Cool Marketplace</title></head>
      <body>
      ${filler}
      <img src="https://cdn.example.com/real-photo.jpg">
      ${filler}
      </body></html>
    `;
    const start = Date.now();
    const result = extractImportCandidates(html, PAGE_URL);
    const elapsed = Date.now() - start;
    expect(result.name).toBe("Big Page");
    expect(result.images).toEqual(["https://cdn.example.com/real-photo.jpg"]);
    expect(elapsed).toBeLessThan(2000);
  });
});
