// @vitest-environment jsdom
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { renderWithStudioI18n } from "../i18n/StudioI18n";
import { NewItemDialog } from "./NewItemDialog";

afterEach(() => {
  cleanup();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// jsdom (this file's test environment) doesn't implement IntersectionObserver
// at all. NewItemDialog's ThumbnailImage (studio/src/panes/NewItemDialog.tsx)
// unconditionally constructs one for every rendered candidate thumbnail --
// not only in the dedicated "URL-import thumbnail proxy" tests below, but in
// every other url-mode test that renders at least one candidate photo -- so
// this stub has to cover the whole file, not just one describe block. Real
// jsdom callers get their observe() calls silently ignored (never reported
// as intersecting), which is a no-op for tests that don't care about
// lazy-loading; the "thumbnail proxy" tests invoke `observedCallback`
// directly to simulate a thumbnail scrolling into view.
let observedCallback: IntersectionObserverCallback | null = null;
const OriginalIntersectionObserver = globalThis.IntersectionObserver;

beforeEach(() => {
  observedCallback = null;
  // @ts-expect-error -- minimal test stub, not a full IntersectionObserver
  globalThis.IntersectionObserver = class {
    constructor(cb: IntersectionObserverCallback) {
      observedCallback = cb;
    }
    observe() {}
    disconnect() {}
  };
});

afterEach(() => {
  globalThis.IntersectionObserver = OriginalIntersectionObserver;
});

describe("NewItemDialog", () => {
  it("creates an item in item mode (default)", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: "electronics/phone" }, 201));
    vi.stubGlobal("fetch", fetchMock);
    const onCreated = vi.fn();
    const { getByLabelText, getByText } = renderWithStudioI18n(
      <NewItemDialog
        categories={["electronics"]}
        onCreated={onCreated}
        onCategoryCreated={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    // A regex anchored at the start, not `exact: false`: the "Apply
    // defaults" checkbox's own hint text also happens to contain the word
    // "category" ("Uses your site and category defaults…"), which a plain
    // substring match would wrongly match too.
    fireEvent.change(getByLabelText(/^Category/), { target: { value: "electronics" } });
    fireEvent.change(getByLabelText(/^Item name/), { target: { value: "phone" } });
    fireEvent.click(getByText("Create"));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("electronics/phone"));
    expect(fetchMock).toHaveBeenCalledWith("/api/items", expect.objectContaining({ method: "POST" }));
  });

  it("switches to category mode and creates a category with no metadata", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ slug: "toys" }, 201));
    vi.stubGlobal("fetch", fetchMock);
    const onCategoryCreated = vi.fn();
    const { getByText, getByLabelText, getByRole } = renderWithStudioI18n(
      <NewItemDialog categories={[]} onCreated={vi.fn()} onCategoryCreated={onCategoryCreated} onCancel={vi.fn()} />,
    );
    fireEvent.click(getByRole("tab", { name: "Category" }));
    fireEvent.change(getByLabelText("Category slug", { exact: false }), { target: { value: "toys" } });
    fireEvent.click(getByText("Create"));
    await waitFor(() => expect(onCategoryCreated).toHaveBeenCalledWith("toys"));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ slug: "toys", meta: undefined });
  });

  it("creates a category with metadata when details are shown", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ slug: "toys" }, 201));
    vi.stubGlobal("fetch", fetchMock);
    const onCategoryCreated = vi.fn();
    const { getByText, getByLabelText, getByRole } = renderWithStudioI18n(
      <NewItemDialog categories={[]} onCreated={vi.fn()} onCategoryCreated={onCategoryCreated} onCancel={vi.fn()} />,
    );
    fireEvent.click(getByRole("tab", { name: "Category" }));
    fireEvent.change(getByLabelText("Category slug", { exact: false }), { target: { value: "toys" } });
    fireEvent.click(getByText("Add details"));
    fireEvent.change(getByLabelText("Display name", { exact: false }), { target: { value: "Toys" } });
    fireEvent.click(getByText("Create"));
    await waitFor(() => expect(onCategoryCreated).toHaveBeenCalledWith("toys"));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ slug: "toys", meta: { display_name: "Toys" } });
  });

  it("rejects a non-kebab-case category slug", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { getByText, getByLabelText, getByRole, findByRole } = renderWithStudioI18n(
      <NewItemDialog categories={[]} onCreated={vi.fn()} onCategoryCreated={vi.fn()} onCancel={vi.fn()} />,
    );
    fireEvent.click(getByRole("tab", { name: "Category" }));
    fireEvent.change(getByLabelText("Category slug", { exact: false }), { target: { value: "Not Kebab" } });
    fireEvent.click(getByText("Create"));
    expect(await findByRole("alert")).toBeTruthy();
  });

  it("clears a validation error from one mode when switching to the other", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { getByText, getByLabelText, getByRole, queryByRole } = renderWithStudioI18n(
      <NewItemDialog categories={[]} onCreated={vi.fn()} onCategoryCreated={vi.fn()} onCancel={vi.fn()} />,
    );
    // Item mode: trigger the slug-format error.
    fireEvent.change(getByLabelText(/^Item name/), { target: { value: "Not Kebab" } });
    fireEvent.click(getByText("Create"));
    expect(queryByRole("alert")).not.toBeNull();

    fireEvent.click(getByRole("tab", { name: "Category" }));
    expect(queryByRole("alert")).toBeNull();
  });

  describe("url mode", () => {
    function fetchMockFor({
      preview = { name: "Vintage Desk Lamp", images: ["https://example.com/a.jpg", "https://example.com/b.jpg"] },
      createStatus = 201,
      createBody = { id: "electronics/vintage-desk-lamp" },
      importBody = { files: [], imported: 2, failed: [] },
      thumbnailBytes = new Blob(["fake-thumbnail-bytes"], { type: "image/jpeg" }),
    }: {
      preview?: {
        name: string | null;
        images: string[];
        usedHeadlessFallback?: boolean;
        headlessFailureReason?: "not-installed" | "navigation-failed" | null;
      };
      createStatus?: number;
      createBody?: unknown;
      importBody?: unknown;
      thumbnailBytes?: Blob;
    } = {}) {
      return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/import-url/preview") return jsonResponse(preview);
        if (url === "/api/items") return jsonResponse(createBody, createStatus);
        if (url.endsWith("/images/import")) return jsonResponse(importBody);
        if (url === "/api/import-url/thumbnail") return new Response(thumbnailBytes, { status: 200 });
        throw new Error(`unexpected fetch: ${url}`);
      });
    }

    it("fetches a preview, pre-fills the name, and pre-selects every candidate photo", async () => {
      const fetchMock = fetchMockFor();
      vi.stubGlobal("fetch", fetchMock);
      const { getByRole, getByLabelText, getByText, findByDisplayValue } = renderWithStudioI18n(
        <NewItemDialog categories={[]} onCreated={vi.fn()} onCategoryCreated={vi.fn()} onCancel={vi.fn()} />,
      );
      fireEvent.click(getByRole("tab", { name: "Import from URL" }));
      fireEvent.change(getByLabelText(/^Product page URL/), {
        target: { value: "https://example.com/listing/1" },
      });
      fireEvent.click(getByText("Fetch page"));

      await findByDisplayValue("Vintage Desk Lamp");
      const checkboxes = document.querySelectorAll<HTMLInputElement>(".url-picker-thumb input[type=checkbox]");
      expect(checkboxes).toHaveLength(2);
      expect(Array.from(checkboxes).every((cb) => cb.checked)).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/import-url/preview",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ url: "https://example.com/listing/1" }),
        }),
      );
    });

    it("creates the item then imports only the selected photos", async () => {
      const fetchMock = fetchMockFor();
      vi.stubGlobal("fetch", fetchMock);
      const onCreated = vi.fn();
      const { getByRole, getByLabelText, getByText, findByDisplayValue } = renderWithStudioI18n(
        <NewItemDialog categories={[]} onCreated={onCreated} onCategoryCreated={vi.fn()} onCancel={vi.fn()} />,
      );
      fireEvent.click(getByRole("tab", { name: "Import from URL" }));
      fireEvent.change(getByLabelText(/^Category/), { target: { value: "electronics" } });
      fireEvent.change(getByLabelText(/^Product page URL/), {
        target: { value: "https://example.com/listing/1" },
      });
      fireEvent.click(getByText("Fetch page"));
      await findByDisplayValue("Vintage Desk Lamp");
      fireEvent.change(getByLabelText(/^Item name/), { target: { value: "vintage-desk-lamp" } });

      // Un-check one of the two candidates before creating.
      const checkboxes = document.querySelectorAll<HTMLInputElement>(".url-picker-thumb input[type=checkbox]");
      fireEvent.click(checkboxes[1]!);

      fireEvent.click(getByText("Create item & import photos"));
      await waitFor(() => expect(onCreated).toHaveBeenCalledWith("electronics/vintage-desk-lamp"));

      const importCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/images/import"));
      expect(importCall).toBeDefined();
      const [, init] = importCall as [string, RequestInit];
      // Includes sourceUrl -- a fetched page's URL is now threaded through as
      // the import call's referer (see the sourceUrl-wiring test below); this
      // assertion predates that wiring and would otherwise miss the new field.
      expect(JSON.parse(init.body as string)).toEqual({
        urls: ["https://example.com/a.jpg"],
        sourceUrl: "https://example.com/listing/1",
      });
    });

    it("sends the fetched page's URL as sourceUrl when creating the item", async () => {
      const fetchMock = fetchMockFor();
      vi.stubGlobal("fetch", fetchMock);
      const { getByRole, getByLabelText, getByText, findByDisplayValue } = renderWithStudioI18n(
        <NewItemDialog categories={[]} onCreated={vi.fn()} onCategoryCreated={vi.fn()} onCancel={vi.fn()} />,
      );
      fireEvent.click(getByRole("tab", { name: "Import from URL" }));
      fireEvent.change(getByLabelText(/^Category/), { target: { value: "electronics" } });
      fireEvent.change(getByLabelText(/^Product page URL/), { target: { value: "https://example.com/listing/1" } });
      fireEvent.click(getByText("Fetch page"));
      await findByDisplayValue("Vintage Desk Lamp");
      fireEvent.change(getByLabelText(/^Item name/), { target: { value: "vintage-desk-lamp" } });

      fireEvent.click(getByText("Create item & import photos"));
      await waitFor(() => {
        const importCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/images/import"));
        expect(importCall).toBeDefined();
      });

      const importCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/images/import"))!;
      const [, init] = importCall as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toEqual({
        urls: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
        sourceUrl: "https://example.com/listing/1",
      });
    });

    it("creates the item with no import call when the page has no candidate photos", async () => {
      const fetchMock = fetchMockFor({
        preview: { name: "Old Chair", images: [] },
        createBody: { id: "furniture/old-chair" },
      });
      vi.stubGlobal("fetch", fetchMock);
      const onCreated = vi.fn();
      const { getByRole, getByLabelText, getByText, findByText } = renderWithStudioI18n(
        <NewItemDialog categories={[]} onCreated={onCreated} onCategoryCreated={vi.fn()} onCancel={vi.fn()} />,
      );
      fireEvent.click(getByRole("tab", { name: "Import from URL" }));
      fireEvent.change(getByLabelText(/^Category/), { target: { value: "furniture" } });
      fireEvent.change(getByLabelText(/^Product page URL/), {
        target: { value: "https://example.com/listing/2" },
      });
      fireEvent.click(getByText("Fetch page"));
      await findByText(/couldn't find photos on this page automatically/i);
      // The detected name is human-readable, not a slug — the seller edits it
      // before saving, same as the manual item-mode flow.
      fireEvent.change(getByLabelText(/^Item name/), { target: { value: "old-chair" } });

      fireEvent.click(getByText("Create item & import photos"));
      await waitFor(() => expect(onCreated).toHaveBeenCalledWith("furniture/old-chair"));

      expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/images/import"))).toBe(false);
    });

    it("holds the dialog open with a warning instead of navigating away when a photo import partially fails", async () => {
      const fetchMock = fetchMockFor({
        importBody: {
          files: [{ name: "a.jpg", editable: true }],
          imported: 1,
          failed: [{ url: "https://example.com/b.jpg", error: "not a JPEG, PNG, WebP or GIF" }],
        },
      });
      vi.stubGlobal("fetch", fetchMock);
      const onCreated = vi.fn();
      const { getByRole, getByLabelText, getByText, findByDisplayValue, findByRole } = renderWithStudioI18n(
        <NewItemDialog categories={[]} onCreated={onCreated} onCategoryCreated={vi.fn()} onCancel={vi.fn()} />,
      );
      fireEvent.click(getByRole("tab", { name: "Import from URL" }));
      fireEvent.change(getByLabelText(/^Category/), { target: { value: "electronics" } });
      fireEvent.change(getByLabelText(/^Product page URL/), {
        target: { value: "https://example.com/listing/1" },
      });
      fireEvent.click(getByText("Fetch page"));
      await findByDisplayValue("Vintage Desk Lamp");
      fireEvent.change(getByLabelText(/^Item name/), { target: { value: "vintage-desk-lamp" } });

      fireEvent.click(getByText("Create item & import photos"));
      const status = await findByRole("status");
      expect(status.textContent).toContain("1");
      expect(onCreated).not.toHaveBeenCalled();

      // The dialog now shows a plain "Create" continue action that finalises
      // navigation with the already-created item id, rather than re-creating it.
      fireEvent.click(getByText("Create"));
      await waitFor(() => expect(onCreated).toHaveBeenCalledWith("electronics/vintage-desk-lamp"));
      expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/items")).toHaveLength(1);
    });

    it("does not resurrect a stale pending-warning id when the seller switches away and submits a different mode", async () => {
      // Regression: the submit handler used to key off createdIdPendingWarning
      // alone, with no mode check. After a partial photo-import warning left
      // it set, switching to Item mode and clicking its (visually ordinary)
      // Create button silently re-navigated to the OLD url-mode item instead
      // of creating the new one the seller actually asked for.
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/import-url/preview") {
          return jsonResponse({ name: "Vintage Desk Lamp", images: ["https://example.com/a.jpg"] });
        }
        if (url === "/api/items") return jsonResponse({ id: "electronics/vintage-desk-lamp" }, 201);
        if (url.endsWith("/images/import")) {
          return jsonResponse({
            files: [],
            imported: 0,
            failed: [{ url: "https://example.com/a.jpg", error: "not a JPEG, PNG, WebP or GIF" }],
          });
        }
        if (url === "/api/categories") return jsonResponse({ slug: "toys" }, 201);
        throw new Error(`unexpected fetch: ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);
      const onCreated = vi.fn();
      const onCategoryCreated = vi.fn();
      const { getByRole, getByLabelText, getByText, findByDisplayValue, findByRole } = renderWithStudioI18n(
        <NewItemDialog categories={[]} onCreated={onCreated} onCategoryCreated={onCategoryCreated} onCancel={vi.fn()} />,
      );
      fireEvent.click(getByRole("tab", { name: "Import from URL" }));
      fireEvent.change(getByLabelText(/^Category/), { target: { value: "electronics" } });
      fireEvent.change(getByLabelText(/^Product page URL/), {
        target: { value: "https://example.com/listing/1" },
      });
      fireEvent.click(getByText("Fetch page"));
      await findByDisplayValue("Vintage Desk Lamp");
      fireEvent.change(getByLabelText(/^Item name/), { target: { value: "vintage-desk-lamp" } });
      fireEvent.click(getByText("Create item & import photos"));
      await findByRole("status"); // the partial-failure warning, leaving createdIdPendingWarning set

      fireEvent.click(getByRole("tab", { name: "Category" }));
      fireEvent.change(getByLabelText("Category slug", { exact: false }), { target: { value: "toys" } });
      fireEvent.click(getByText("Create"));

      await waitFor(() => expect(onCategoryCreated).toHaveBeenCalledWith("toys"));
      expect(onCreated).not.toHaveBeenCalled();
    });

    it("does not let a preview fetch that resolves after the seller switches away overwrite the other mode's name field", async () => {
      // Regression: fetchUrlPreview's async resolution read `mode` from the
      // closure at call time. Switching to Item mode while the fetch was
      // still in flight, then typing a name there, could be silently
      // clobbered the instant the stale url-mode fetch resolved.
      let resolvePreview!: (res: Response) => void;
      const pendingPreview = new Promise<Response>((resolve) => {
        resolvePreview = resolve;
      });
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/import-url/preview") return pendingPreview;
        throw new Error(`unexpected fetch: ${String(input)}`);
      });
      vi.stubGlobal("fetch", fetchMock);
      const { getByRole, getByLabelText, getByText } = renderWithStudioI18n(
        <NewItemDialog categories={[]} onCreated={vi.fn()} onCategoryCreated={vi.fn()} onCancel={vi.fn()} />,
      );
      fireEvent.click(getByRole("tab", { name: "Import from URL" }));
      fireEvent.change(getByLabelText(/^Product page URL/), {
        target: { value: "https://example.com/listing/1" },
      });
      fireEvent.click(getByText("Fetch page"));

      fireEvent.click(getByRole("tab", { name: "Item" }));
      fireEvent.change(getByLabelText(/^Item name/), { target: { value: "my-own-item" } });

      resolvePreview(jsonResponse({ name: "Some Scraped Name", images: [] }));
      // Flush the resolved fetch's microtask chain (fetch -> res.json() ->
      // fetchUrlPreview's own await) without relying on a real timer.
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
      }

      expect((getByLabelText(/^Item name/) as HTMLInputElement).value).toBe("my-own-item");
    });

    describe("URL-import messaging", () => {
      it("shows the setup hint when the fallback is unavailable", async () => {
        const fetchMock = fetchMockFor({
          preview: { name: null, images: [], usedHeadlessFallback: true, headlessFailureReason: "not-installed" },
        });
        vi.stubGlobal("fetch", fetchMock);
        const { getByRole, getByLabelText, getByText, findByText } = renderWithStudioI18n(
          <NewItemDialog categories={[]} onCreated={vi.fn()} onCategoryCreated={vi.fn()} onCancel={vi.fn()} />,
        );
        fireEvent.click(getByRole("tab", { name: "Import from URL" }));
        fireEvent.change(getByLabelText(/^Product page URL/), { target: { value: "https://example.com/listing/1" } });
        fireEvent.click(getByText("Fetch page"));

        expect(await findByText(/npx playwright install chromium/)).toBeTruthy();
      });

      it("shows the generic blocked/login-wall hint when the fallback ran but still found nothing", async () => {
        const fetchMock = fetchMockFor({
          preview: { name: null, images: [], usedHeadlessFallback: true, headlessFailureReason: null },
        });
        vi.stubGlobal("fetch", fetchMock);
        const { getByRole, getByLabelText, getByText, findByText } = renderWithStudioI18n(
          <NewItemDialog categories={[]} onCreated={vi.fn()} onCategoryCreated={vi.fn()} onCancel={vi.fn()} />,
        );
        fireEvent.click(getByRole("tab", { name: "Import from URL" }));
        fireEvent.change(getByLabelText(/^Product page URL/), { target: { value: "https://example.com/listing/1" } });
        fireEvent.click(getByText("Fetch page"));

        expect(await findByText(/block automated access|require login/i)).toBeTruthy();
      });

      it("shows the same generic hint, not the setup hint, for navigation-failed", async () => {
        const fetchMock = fetchMockFor({
          preview: { name: null, images: [], usedHeadlessFallback: true, headlessFailureReason: "navigation-failed" },
        });
        vi.stubGlobal("fetch", fetchMock);
        const { getByRole, getByLabelText, getByText, findByText, queryByText } = renderWithStudioI18n(
          <NewItemDialog categories={[]} onCreated={vi.fn()} onCategoryCreated={vi.fn()} onCancel={vi.fn()} />,
        );
        fireEvent.click(getByRole("tab", { name: "Import from URL" }));
        fireEvent.change(getByLabelText(/^Product page URL/), { target: { value: "https://example.com/listing/1" } });
        fireEvent.click(getByText("Fetch page"));

        expect(await findByText(/block automated access|require login/i)).toBeTruthy();
        expect(queryByText(/npx playwright install chromium/)).toBeNull();
      });
    });

    describe("URL-import paste escape hatch", () => {
      it("unlocks the name field and Create button when a valid URL is pasted, without ever fetching", async () => {
        vi.stubGlobal("fetch", vi.fn(() => { throw new Error("no fetch should happen in this test"); }));
        const { getByRole, getByLabelText, getByText } = renderWithStudioI18n(
          <NewItemDialog categories={[]} onCreated={vi.fn()} onCategoryCreated={vi.fn()} onCancel={vi.fn()} />,
        );
        fireEvent.click(getByRole("tab", { name: "Import from URL" }));
        fireEvent.change(getByLabelText(/paste photo links/i), { target: { value: "https://cdn.example/photo.jpg" } });
        fireEvent.click(getByText("Add"));

        expect((getByLabelText(/^Item name/) as HTMLInputElement).disabled).toBe(false);
        expect((getByText("Create item & import photos") as HTMLButtonElement).disabled).toBe(false);
      });

      it("shows a validation message and leaves the form locked when the pasted value isn't a URL", async () => {
        vi.stubGlobal("fetch", vi.fn(() => { throw new Error("no fetch should happen in this test"); }));
        const { getByRole, getByLabelText, getByText, findByText } = renderWithStudioI18n(
          <NewItemDialog categories={[]} onCreated={vi.fn()} onCategoryCreated={vi.fn()} onCancel={vi.fn()} />,
        );
        fireEvent.click(getByRole("tab", { name: "Import from URL" }));
        fireEvent.change(getByLabelText(/paste photo links/i), { target: { value: "not a url" } });
        fireEvent.click(getByText("Add"));

        expect(await findByText(/enter a valid/i)).toBeTruthy();
        // The name field only exists once previewFetched is true -- an invalid
        // paste must not have flipped it.
        expect(() => getByLabelText(/^Item name/)).toThrow();
      });

      it("dedupes a pasted URL that's already a candidate", async () => {
        const fetchMock = fetchMockFor({ preview: { name: "Vintage Desk Lamp", images: ["https://example.com/a.jpg"] } });
        vi.stubGlobal("fetch", fetchMock);
        const { getByRole, getByLabelText, getByText, findByDisplayValue } = renderWithStudioI18n(
          <NewItemDialog categories={[]} onCreated={vi.fn()} onCategoryCreated={vi.fn()} onCancel={vi.fn()} />,
        );
        fireEvent.click(getByRole("tab", { name: "Import from URL" }));
        fireEvent.change(getByLabelText(/^Product page URL/), { target: { value: "https://example.com/listing/1" } });
        fireEvent.click(getByText("Fetch page"));
        await findByDisplayValue("Vintage Desk Lamp");

        fireEvent.change(getByLabelText(/paste photo links/i), { target: { value: "https://example.com/a.jpg" } });
        fireEvent.click(getByText("Add"));

        const checkboxes = document.querySelectorAll<HTMLInputElement>(".url-picker-thumb input[type=checkbox]");
        expect(checkboxes).toHaveLength(1);
        expect(checkboxes[0]!.checked).toBe(true);
      });
    });

    describe("URL-import fetch-after-paste merge", () => {
      it("does not discard a pasted selection when a fetch resolves afterward", async () => {
        const fetchMock = fetchMockFor({
          preview: { name: null, images: ["https://example.com/fetched.jpg"] },
        });
        vi.stubGlobal("fetch", fetchMock);
        const { getByRole, getByLabelText, getByText, findByText } = renderWithStudioI18n(
          <NewItemDialog categories={[]} onCreated={vi.fn()} onCategoryCreated={vi.fn()} onCancel={vi.fn()} />,
        );
        fireEvent.click(getByRole("tab", { name: "Import from URL" }));

        // Paste first -- unlocks the form with zero fetches, per the escape-hatch test above.
        fireEvent.change(getByLabelText(/paste photo links/i), { target: { value: "https://example.com/pasted.jpg" } });
        fireEvent.click(getByText("Add"));
        expect(document.querySelectorAll(".url-picker-thumb")).toHaveLength(1);

        // Now also fetch -- must ADD the fetched candidate, not replace the pasted one.
        fireEvent.change(getByLabelText(/^Product page URL/), { target: { value: "https://example.com/listing/1" } });
        fireEvent.click(getByText("Fetch page"));
        await findByText("2 selected");

        const checkboxes = document.querySelectorAll<HTMLInputElement>(".url-picker-thumb input[type=checkbox]");
        expect(checkboxes).toHaveLength(2);
        expect(Array.from(checkboxes).every((cb) => cb.checked)).toBe(true);
      });

      it("does not blank an already-typed name when the fetch's own guess is null", async () => {
        const fetchMock = fetchMockFor({ preview: { name: null, images: [] } });
        vi.stubGlobal("fetch", fetchMock);
        const { getByRole, getByLabelText, getByText } = renderWithStudioI18n(
          <NewItemDialog categories={[]} onCreated={vi.fn()} onCategoryCreated={vi.fn()} onCancel={vi.fn()} />,
        );
        fireEvent.click(getByRole("tab", { name: "Import from URL" }));
        fireEvent.change(getByLabelText(/paste photo links/i), { target: { value: "https://example.com/pasted.jpg" } });
        fireEvent.click(getByText("Add"));
        fireEvent.change(getByLabelText(/^Item name/), { target: { value: "My Hand-Typed Name" } });

        fireEvent.change(getByLabelText(/^Product page URL/), { target: { value: "https://example.com/listing/1" } });
        fireEvent.click(getByText("Fetch page"));
        for (let i = 0; i < 10; i++) await Promise.resolve(); // flush fetchUrlPreview's microtask chain

        expect((getByLabelText(/^Item name/) as HTMLInputElement).value).toBe("My Hand-Typed Name");
      });
    });

    describe("URL-import thumbnail proxy", () => {
      // jsdom (this file's test environment) doesn't implement Blob URLs at
      // all -- URL.createObjectURL/revokeObjectURL are simply absent, not
      // present-but-throwing -- so vi.spyOn (which requires the property to
      // already exist as a function before it can wrap it) has nothing to
      // wrap. A bare stub is installed here first. (observedCallback and the
      // IntersectionObserver stub itself are file-level, above -- every
      // url-mode test that renders a candidate thumbnail needs them, not
      // just this describe block.)
      //
      // Restored in afterAll, not afterEach: this file's own top-level
      // `afterEach(() => cleanup())` is registered OUTSIDE every describe
      // block, and outer afterEach hooks run AFTER inner ones. An inner
      // afterEach here would restore URL.revokeObjectURL to undefined
      // BEFORE that outer cleanup() unmounts a still-live ThumbnailImage,
      // whose own cleanup effect then calls URL.revokeObjectURL -- throwing
      // "URL.revokeObjectURL is not a function". afterAll runs once, after
      // every test in this describe (and each test's own cleanup) has
      // already finished, which sidesteps that ordering hazard entirely.
      const OriginalCreateObjectURL = URL.createObjectURL;
      const OriginalRevokeObjectURL = URL.revokeObjectURL;

      beforeEach(() => {
        URL.createObjectURL = () => "";
        URL.revokeObjectURL = () => {};
      });

      afterAll(() => {
        URL.createObjectURL = OriginalCreateObjectURL;
        URL.revokeObjectURL = OriginalRevokeObjectURL;
      });

      async function renderWithOneCandidate() {
        const fetchMock = fetchMockFor({ preview: { name: "Vintage Desk Lamp", images: ["https://example.com/a.jpg"] } });
        vi.stubGlobal("fetch", fetchMock);
        const result = renderWithStudioI18n(
          <NewItemDialog categories={[]} onCreated={vi.fn()} onCategoryCreated={vi.fn()} onCancel={vi.fn()} />,
        );
        fireEvent.click(result.getByRole("tab", { name: "Import from URL" }));
        fireEvent.change(result.getByLabelText(/^Product page URL/), {
          target: { value: "https://example.com/listing/1" },
        });
        fireEvent.click(result.getByText("Fetch page"));
        await result.findByDisplayValue("Vintage Desk Lamp");
        return { ...result, fetchMock };
      }

      it("does not fetch a thumbnail until it is reported as near the viewport", async () => {
        const { fetchMock } = await renderWithOneCandidate();

        expect(fetchMock.mock.calls.some(([input]) => String(input) === "/api/import-url/thumbnail")).toBe(false);

        observedCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], null as never);
        await waitFor(() => {
          expect(fetchMock.mock.calls.some(([input]) => String(input) === "/api/import-url/thumbnail")).toBe(true);
        });
      });

      it("renders the fetched blob as the thumbnail's image source", async () => {
        const createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake-url");
        await renderWithOneCandidate();

        observedCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], null as never);

        // Not getByRole("img")/toHaveAttribute: this <img> intentionally
        // keeps alt="" (a decorative photo candidate sitting inside its own
        // checkbox label, same as the bare <img> it replaces), which maps to
        // the ARIA "presentation" role rather than "img", so a role query
        // would never find it -- and this project has no
        // @testing-library/jest-dom (toHaveAttribute isn't available
        // anywhere else in the codebase), so a plain attribute read is used
        // instead, matching this file's existing convention of querying
        // .url-picker-thumb's contents directly via `document`.
        await waitFor(() => {
          expect(document.querySelector(".url-picker-thumb img")?.getAttribute("src")).toBe("blob:fake-url");
        });
        expect(createObjectURLSpy).toHaveBeenCalled();
      });

      it("revokes the blob URL on unmount", async () => {
        vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake-url");
        const revokeSpy = vi.spyOn(URL, "revokeObjectURL");
        const { unmount } = await renderWithOneCandidate();
        observedCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], null as never);
        await waitFor(() =>
          expect(document.querySelector(".url-picker-thumb img")?.getAttribute("src")).toBe("blob:fake-url"),
        );

        unmount();

        expect(revokeSpy).toHaveBeenCalledWith("blob:fake-url");
      });

      it("aborts the in-flight thumbnail fetch when the mode is switched away mid-request", async () => {
        let capturedSignal: AbortSignal | undefined;
        const fetchMock = fetchMockFor({ preview: { name: "Vintage Desk Lamp", images: ["https://example.com/a.jpg"] } });
        fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          if (url === "/api/import-url/preview") {
            return jsonResponse({ name: "Vintage Desk Lamp", images: ["https://example.com/a.jpg"] });
          }
          if (url === "/api/import-url/thumbnail") {
            capturedSignal = init?.signal ?? undefined;
            return new Promise<Response>(() => {
              /* never resolves -- this test only cares whether it's aborted */
            });
          }
          throw new Error(`unexpected fetch: ${url}`);
        });
        vi.stubGlobal("fetch", fetchMock);
        const { getByRole, getByLabelText, getByText, findByDisplayValue } = renderWithStudioI18n(
          <NewItemDialog categories={[]} onCreated={vi.fn()} onCategoryCreated={vi.fn()} onCancel={vi.fn()} />,
        );
        fireEvent.click(getByRole("tab", { name: "Import from URL" }));
        fireEvent.change(getByLabelText(/^Product page URL/), { target: { value: "https://example.com/listing/1" } });
        fireEvent.click(getByText("Fetch page"));
        await findByDisplayValue("Vintage Desk Lamp");
        observedCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], null as never);
        await waitFor(() => expect(capturedSignal).toBeDefined());

        // Matches this file's existing mode-switch-during-fetch regression test's
        // approach: switch away mid-request via the "Item" tab.
        fireEvent.click(getByRole("tab", { name: "Item" }));

        expect(capturedSignal?.aborted).toBe(true);
      });
    });
  });

  it("does not carry the item-name draft over into the category-slug field", () => {
    // `name` backs both the Item mode "Item name" input and the Category
    // mode "Category slug" input — switching modes must clear it, or a
    // leftover item-name draft becomes an unintended category slug.
    const { getByLabelText, getByRole } = renderWithStudioI18n(
      <NewItemDialog categories={[]} onCreated={vi.fn()} onCategoryCreated={vi.fn()} onCancel={vi.fn()} />,
    );
    fireEvent.change(getByLabelText(/^Item name/), { target: { value: "old-couch" } });
    fireEvent.click(getByRole("tab", { name: "Category" }));
    expect((getByLabelText("Category slug", { exact: false }) as HTMLInputElement).value).toBe("");
  });
});
