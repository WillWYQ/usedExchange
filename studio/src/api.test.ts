// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  fetchItems,
  exportCatalogPdf,
  exportItemFlyerPdf,
  fetchCategories,
  createCategory,
  saveCategoryMeta,
  uploadContactImage,
  deleteContactImage,
  fetchConfig,
  saveContactPlatformQrImage,
} from "./api";

describe("fetchItems", () => {
  it("returns items and locale metadata for a valid response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          items: [{ id: "a/b", name: "B" }],
          defaultLocale: "en",
          availableLocales: ["en", "zh"],
        }),
      })) as unknown as typeof fetch,
    );
    const result = await fetchItems();
    expect(result.items).toHaveLength(1);
    expect(result.defaultLocale).toBe("en");
    expect(result.availableLocales).toEqual(["en", "zh"]);
    vi.unstubAllGlobals();
  });

  it("throws when defaultLocale is missing or malformed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ items: [], availableLocales: ["en"] }),
      })) as unknown as typeof fetch,
    );
    await expect(fetchItems()).rejects.toThrow(/unreadable response/);
    vi.unstubAllGlobals();
  });

  it("throws when availableLocales is not an array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ items: [], defaultLocale: "en", availableLocales: "en" }),
      })) as unknown as typeof fetch,
    );
    await expect(fetchItems()).rejects.toThrow(/unreadable response/);
    vi.unstubAllGlobals();
  });
});

describe("exportCatalogPdf", () => {
  it("returns the response body as a Blob on success", async () => {
    const fakeBlob = new Blob(["%PDF-fake"], { type: "application/pdf" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        blob: async () => fakeBlob,
      })) as unknown as typeof fetch,
    );
    const result = await exportCatalogPdf();
    expect(result).toBe(fakeBlob);
    vi.unstubAllGlobals();
  });

  it("throws the server's error message on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: async () => ({ error: "No public-visible items to export." }),
      })) as unknown as typeof fetch,
    );
    await expect(exportCatalogPdf()).rejects.toThrow("No public-visible items to export.");
    vi.unstubAllGlobals();
  });
});

describe("exportItemFlyerPdf", () => {
  it("posts the item id and returns the response body as a Blob on success", async () => {
    const fakeBlob = new Blob(["%PDF-fake"], { type: "application/pdf" });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      blob: async () => fakeBlob,
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);
    const result = await exportItemFlyerPdf("electronics/desk-lamp");
    expect(result).toBe(fakeBlob);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/export-pdf/flyer",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ id: "electronics/desk-lamp" }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it("throws the server's error message on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: async () => ({ error: 'Item "electronics/desk-lamp" not found.' }),
      })) as unknown as typeof fetch,
    );
    await expect(exportItemFlyerPdf("electronics/desk-lamp")).rejects.toThrow(
      'Item "electronics/desk-lamp" not found.',
    );
    vi.unstubAllGlobals();
  });
});

describe("fetchCategories", () => {
  it("returns the parsed category list", async () => {
    const categories = [
      { slug: "electronics", displayName: "Electronics", description: "", icon: "", sortOrder: null, itemCount: 2 },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ categories }),
      })) as unknown as typeof fetch,
    );
    expect(await fetchCategories()).toEqual(categories);
    vi.unstubAllGlobals();
  });

  it("throws on an unreadable response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({}),
      })) as unknown as typeof fetch,
    );
    await expect(fetchCategories()).rejects.toThrow(/unreadable/);
    vi.unstubAllGlobals();
  });
});

describe("createCategory", () => {
  it("POSTs the slug and meta, returns the created slug", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 201,
      statusText: "Created",
      json: async () => ({ slug: "electronics" }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);
    const result = await createCategory("electronics", { display_name: "Electronics" });
    expect(result).toBe("electronics");
    const [, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ slug: "electronics", meta: { display_name: "Electronics" } });
    vi.unstubAllGlobals();
  });
});

describe("saveCategoryMeta", () => {
  it("PUTs to /api/categories/:slug", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({}),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);
    await saveCategoryMeta("electronics", { icon: "📱" });
    const [url, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/categories/electronics");
    expect(init.method).toBe("PUT");
    vi.unstubAllGlobals();
  });
});

describe("uploadContactImage", () => {
  it("POSTs the file as base64 and returns file+path", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 201,
      statusText: "Created",
      json: async () => ({ file: "qr.png", path: "/contact/qr.png" }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["hello"], "qr.png", { type: "image/png" });
    const result = await uploadContactImage(file);
    expect(result).toEqual({ file: "qr.png", path: "/contact/qr.png" });
    vi.unstubAllGlobals();
  });

  it("throws on a 2xx response missing file/path, rather than returning undefined values", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 201,
        statusText: "Created",
        json: async () => ({}),
      })) as unknown as typeof fetch,
    );
    const file = new File(["hello"], "qr.png", { type: "image/png" });
    await expect(uploadContactImage(file)).rejects.toThrow(/unreadable/);
    vi.unstubAllGlobals();
  });
});

describe("deleteContactImage", () => {
  it("DELETEs /api/contact/images/:filename", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ ok: true }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);
    await deleteContactImage("qr.png");
    const [url, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/contact/images/qr.png");
    expect(init.method).toBe("DELETE");
    vi.unstubAllGlobals();
  });
});

describe("fetchConfig", () => {
  it("returns fields and contactPlatforms from one GET /api/config", async () => {
    const contactPlatforms = [{ index: 0, type: "zelle", value: undefined, label: "Zelle", qrImage: "/contact/zelle-qr.png" }];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ fields: [], contactPlatforms }),
      })) as unknown as typeof fetch,
    );
    expect(await fetchConfig()).toEqual({ fields: [], contactPlatforms });
    vi.unstubAllGlobals();
  });

  it("throws on a response missing contactPlatforms", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ fields: [] }),
      })) as unknown as typeof fetch,
    );
    await expect(fetchConfig()).rejects.toThrow(/unreadable/);
    vi.unstubAllGlobals();
  });
});

describe("saveContactPlatformQrImage", () => {
  it("PUTs to /api/contact-platforms/:index with qr_image", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ contactPlatforms: [] }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);
    await saveContactPlatformQrImage(2, "/contact/zelle-qr-2.png");
    const [url, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/contact-platforms/2");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ qr_image: "/contact/zelle-qr-2.png" });
    vi.unstubAllGlobals();
  });
});
