// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfigPane } from "./ConfigPane";
import type { ConfigField } from "../api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeField(overrides: Partial<ConfigField>): ConfigField {
  return {
    path: "name",
    value: "Test Store",
    kind: "string",
    section: "General",
    range: [0, 10],
    ...overrides,
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("ConfigPane", () => {
  it("saves the current section without reloading the config again", async () => {
    const fields: ConfigField[] = [makeField({ path: "name", value: "Test Store", section: "General" })];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/config" && init?.method === undefined) return jsonResponse({ fields });
      if (url === "/api/config" && init?.method === "PUT") return jsonResponse({ fields });
      throw new Error(`unexpected fetch: ${String(input)} ${init?.method ?? "GET"}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ConfigPane onClose={vi.fn()} />);
    await screen.findByRole("tab", { name: "General" });

    const nameInput = screen.getByDisplayValue("Test Store");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Updated Store");
    await userEvent.click(screen.getByRole("button", { name: "Save section" }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/config");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/config");
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "PUT" });
    expect(screen.getByText("Saved.")).not.toBeNull();
  });

  it("groups translation values by key inside category subpages", async () => {
    const fields: ConfigField[] = [
      makeField({ path: "name", value: "Test Store", section: "General" }),
      makeField({
        path: "i18n.translations.en.home",
        value: "Home",
        section: "UI translations",
        subsection: "Navigation",
      }),
      makeField({
        path: "i18n.translations.zh.home",
        value: "首页",
        section: "UI translations",
        subsection: "Navigation",
      }),
      makeField({
        path: "i18n.translations.en.contactSeller",
        value: "Contact Seller",
        section: "UI translations",
        subsection: "Contact",
      }),
      makeField({
        path: "i18n.translations.zh.contactSeller",
        value: "联系卖家",
        section: "UI translations",
        subsection: "Contact",
      }),
    ];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/config" && init?.method === undefined) return jsonResponse({ fields });
      if (url === "/api/config" && init?.method === "PUT") return jsonResponse({ fields });
      throw new Error(`unexpected fetch: ${String(input)} ${init?.method ?? "GET"}`);
    }));

    render(<ConfigPane onClose={vi.fn()} />);
    await userEvent.click(await screen.findByRole("tab", { name: "UI translations" }));
    await userEvent.click(screen.getByRole("tab", { name: "Navigation" }));

    expect(screen.getByText("home")).not.toBeNull();
    expect((screen.getByLabelText("i18n.translations.en.home") as HTMLInputElement).value).toBe("Home");
    expect((screen.getByLabelText("i18n.translations.zh.home") as HTMLInputElement).value).toBe("首页");

    const matrix = screen.getByText("home").closest(".translation-matrix-row");
    expect(matrix).not.toBeNull();
    expect((within(matrix as HTMLElement).getByLabelText("i18n.translations.en.home") as HTMLInputElement).value).toBe("Home");
    expect((within(matrix as HTMLElement).getByLabelText("i18n.translations.zh.home") as HTMLInputElement).value).toBe("首页");
  });
});
