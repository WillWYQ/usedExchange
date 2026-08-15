// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithStudioI18n as render } from "../i18n/StudioI18n";
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

  it("renders a QR upload row per contact platform and saves immediately on upload", async () => {
    // contact.platforms is an array in content/config.ts — configEdit.ts's
    // readConfig() never walks into arrays, so it always shows up as ONE
    // opaque "unsupported" field, never as per-element paths. Any test that
    // fabricates a "contact.platforms.0.qr_image" ConfigField is testing a
    // shape the real GET /api/config response can never produce.
    const fields: ConfigField[] = [
      makeField({ path: "contact.platforms", value: null, kind: "unsupported", section: "Contact" }),
    ];
    const contactPlatforms = [
      { index: 0, type: "email", value: "you@example.com", label: undefined, qrImage: undefined },
      { index: 1, type: "zelle", value: undefined, label: "Zelle", qrImage: "/contact/zelle-qr.png" },
    ];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/config" && init?.method === undefined) return jsonResponse({ fields, contactPlatforms });
      if (url === "/api/contact/images" && init?.method === "POST") {
        return jsonResponse({ file: "zelle-qr-2.png", path: "/contact/zelle-qr-2.png" });
      }
      if (url === "/api/contact-platforms/1" && init?.method === "PUT") {
        return jsonResponse({
          contactPlatforms: [
            contactPlatforms[0],
            { ...contactPlatforms[1], qrImage: "/contact/zelle-qr-2.png" },
          ],
        });
      }
      if (url === "/api/contact/images/zelle-qr.png" && init?.method === "DELETE") {
        return jsonResponse({ ok: true });
      }
      throw new Error(`unexpected fetch: ${url} ${init?.method ?? "GET"}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ConfigPane onClose={vi.fn()} />);
    await screen.findByRole("tab", { name: "Contact" });
    await screen.findByText("Zelle");

    const fileInputs = document.querySelectorAll('input[type="file"]');
    // One row per platform — email (no existing QR) and zelle (has one).
    expect(fileInputs.length).toBe(2);
    const file = new File(["x"], "zelle-qr-2.png", { type: "image/png" });
    await userEvent.upload(fileInputs[1] as HTMLInputElement, file);

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/contact-platforms/1",
        expect.objectContaining({ method: "PUT" }),
      );
    });
    // The old file is deleted only after the new path is confirmed saved.
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/contact/images/zelle-qr.png",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });
});
