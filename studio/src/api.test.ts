// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  fetchItems,
  streamExportCatalogPdf,
  downloadExportedPdf,
  exportItemFlyerPdf,
  fetchCategories,
  createCategory,
  saveCategoryMeta,
  uploadContactImage,
  deleteContactImage,
  fetchConfig,
  saveContactPlatformQrImage,
  saveConfigValue,
} from "./api";

/** Builds a Response whose body streams the given SSE frames, one chunk each. */
function sseResponse(frames: Array<{ event: string; data: unknown }>): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const frame of frames) {
        controller.enqueue(encoder.encode(`event: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

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

describe("streamExportCatalogPdf", () => {
  const options = {
    locale: "en",
    priceStrategy: "average" as const,
    categories: ["electronics"],
    statuses: ["available" as const],
  };

  async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
    const out: T[] = [];
    for await (const item of gen) out.push(item);
    return out;
  }

  it("sends the options as the JSON body and yields each SSE frame in order", async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse([
        { event: "progress", data: { stage: "loading" } },
        { event: "progress", data: { stage: "images-pass-1", completed: 1, total: 2 } },
        { event: "done", data: { token: "abc123" } },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const events = await collect(streamExportCatalogPdf(options));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/export-pdf",
      expect.objectContaining({ method: "POST", body: JSON.stringify(options) }),
    );
    expect(events).toEqual([
      { event: "progress", data: { stage: "loading" } },
      { event: "progress", data: { stage: "images-pass-1", completed: 1, total: 2 } },
      { event: "done", data: { token: "abc123" } },
    ]);
    vi.unstubAllGlobals();
  });

  it("throws the server's error message when the initial request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: async () => ({ error: "No items match the selected filters." }),
      })) as unknown as typeof fetch,
    );
    await expect(collect(streamExportCatalogPdf(options))).rejects.toThrow(
      "No items match the selected filters.",
    );
    vi.unstubAllGlobals();
  });

  it("passes an AbortSignal through to fetch when given one", async () => {
    const fetchMock = vi.fn(async () => sseResponse([{ event: "done", data: { token: "abc123" } }]));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    const controller = new AbortController();

    await collect(streamExportCatalogPdf(options, controller.signal));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/export-pdf",
      expect.objectContaining({ signal: controller.signal }),
    );
    vi.unstubAllGlobals();
  });
});

describe("downloadExportedPdf", () => {
  it("GETs the download route and returns the response body as a Blob", async () => {
    const fakeBlob = new Blob(["%PDF-fake"], { type: "application/pdf" });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      blob: async () => fakeBlob,
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    const result = await downloadExportedPdf("abc123");
    expect(result).toBe(fakeBlob);
    expect(fetchMock).toHaveBeenCalledWith("/api/export-pdf/download/abc123", { signal: undefined });
    vi.unstubAllGlobals();
  });

  it("passes an AbortSignal through to fetch when given one", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      blob: async () => new Blob(["%PDF-fake"], { type: "application/pdf" }),
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    const controller = new AbortController();
    await downloadExportedPdf("abc123", controller.signal);
    expect(fetchMock).toHaveBeenCalledWith("/api/export-pdf/download/abc123", { signal: controller.signal });
    vi.unstubAllGlobals();
  });

  it("throws the server's error message on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: async () => ({ error: "export not found or already downloaded" }),
      })) as unknown as typeof fetch,
    );
    await expect(downloadExportedPdf("stale-token")).rejects.toThrow(
      "export not found or already downloaded",
    );
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

describe("saveConfigValue", () => {
  // Saving content/config.ts triggers Vite's dev-server restart (see the
  // fetchWithRetry comment in api.ts), which drops the in-flight PUT's
  // connection. These cases exercise the retry that papers over it.

  it("PUTs the path/value and returns fields on the first try with no retry", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ fields: [{ path: "site.siteName" }] }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const result = await saveConfigValue("site.siteName", "New Name");

    expect(result).toEqual([{ path: "site.siteName" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/config");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ path: "site.siteName", value: "New Name" });
    vi.unstubAllGlobals();
  });

  it("throws immediately on a resolved !res.ok response, without retrying", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => ({ error: "Invalid GA4 measurement ID." }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    await expect(saveConfigValue("analytics.ga4Id", "bad-id")).rejects.toThrow(
      "Invalid GA4 measurement ID.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("retries once after a network-level failure and succeeds on the second attempt", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new TypeError("Failed to fetch");
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ fields: [{ path: "site.siteName" }] }),
      };
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = saveConfigValue("site.siteName", "New Name");
    // The dev server needs a moment to finish restarting before it can
    // answer again — the retry waits ~400ms before trying the identical PUT.
    await vi.advanceTimersByTimeAsync(400);
    const result = await resultPromise;

    expect(result).toEqual([{ path: "site.siteName" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("throws a clear error after exhausting retries when every attempt rejects", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = saveConfigValue("site.siteName", "New Name");
    // Swallow the eventual rejection on this handle so advancing timers below
    // doesn't trip an unhandled-rejection warning before the assertion runs.
    resultPromise.catch(() => {});

    // Two retries, backing off 400ms then 800ms, before giving up.
    await vi.advanceTimersByTimeAsync(400);
    await vi.advanceTimersByTimeAsync(800);

    await expect(resultPromise).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
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
