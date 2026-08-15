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
});
