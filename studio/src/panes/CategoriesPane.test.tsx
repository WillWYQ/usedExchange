// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { renderWithStudioI18n } from "../i18n/StudioI18n";
import { CategoriesPane } from "./CategoriesPane";

afterEach(() => {
  cleanup();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("CategoriesPane", () => {
  it("lists categories fetched from the server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          categories: [
            { slug: "electronics", displayName: "Electronics", description: "", icon: "📱", sortOrder: 1, itemCount: 3 },
          ],
        }),
      ),
    );
    const { findByText } = renderWithStudioI18n(<CategoriesPane onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(await findByText(/electronics/)).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("shows the empty state when there are no categories", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ categories: [] })));
    const { findByText } = renderWithStudioI18n(<CategoriesPane onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(await findByText(/No categories yet/)).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("saves edited metadata for a category", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/categories" && (init === undefined || init.method === undefined)) {
        return jsonResponse({
          categories: [
            { slug: "electronics", displayName: "", description: "", icon: "", sortOrder: null, itemCount: 0 },
          ],
        });
      }
      if (url === "/api/categories/electronics" && init?.method === "PUT") {
        return jsonResponse({});
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const onSaved = vi.fn();
    const { findByLabelText, findByText } = renderWithStudioI18n(
      <CategoriesPane onClose={vi.fn()} onSaved={onSaved} />,
    );
    const displayName = await findByLabelText("Display name", { exact: false });
    fireEvent.change(displayName, { target: { value: "Electronics" } });
    fireEvent.click(await findByText("Save"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const putCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PUT");
    expect(JSON.parse((putCall?.[1] as RequestInit).body as string)).toMatchObject({ display_name: "Electronics" });
    vi.unstubAllGlobals();
  });
});
