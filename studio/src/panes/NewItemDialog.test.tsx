// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { renderWithStudioI18n } from "../i18n/StudioI18n";
import { NewItemDialog } from "./NewItemDialog";

afterEach(() => {
  cleanup();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

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
    }: {
      preview?: { name: string | null; images: string[] };
      createStatus?: number;
      createBody?: unknown;
      importBody?: unknown;
    } = {}) {
      return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/import-url/preview") return jsonResponse(preview);
        if (url === "/api/items") return jsonResponse(createBody, createStatus);
        if (url.endsWith("/images/import")) return jsonResponse(importBody);
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
      expect(JSON.parse(init.body as string)).toEqual({ urls: ["https://example.com/a.jpg"] });
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
      await findByText(/No photos found/);
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
