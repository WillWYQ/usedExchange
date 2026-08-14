// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithStudioI18n } from "../i18n/StudioI18n";
import { DefaultsPane } from "./DefaultsPane";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function mountPane(defaults: Record<string, unknown>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith("/api/defaults")) throw new Error(`unexpected fetch: ${url}`);
    if (init?.method === "PUT") return jsonResponse({});
    return jsonResponse(defaults);
  });
  vi.stubGlobal("fetch", fetchMock);
  const onSaved = vi.fn();
  // The pane resolves field labels and group titles through useStudioT, so it
  // must mount inside a StudioI18nProvider (English built-ins here — the same
  // strings the pane used to hardcode).
  renderWithStudioI18n(<DefaultsPane categories={[]} onClose={vi.fn()} onSaved={onSaved} />);
  return { fetchMock, onSaved };
}

function putBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> | undefined {
  const call = fetchMock.mock.calls.find(
    (c) => (c[1] as RequestInit | undefined)?.method === "PUT",
  );
  if (call === undefined) return undefined;
  return JSON.parse(String((call[1] as RequestInit).body)) as Record<string, unknown>;
}

describe("DefaultsPane price tiers", () => {
  it("loads saved default tiers and saves them back", async () => {
    const tiers = [
      { label: "Pickup", miles_max: 5, amount: 40 },
      { label: "Shipping", miles_min: 5, amount: 55 },
    ];
    const { fetchMock, onSaved } = mountPane({ price: { tiers } });

    const checkbox = await screen.findByLabelText("Set a default for price tiers");
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    expect(screen.getByDisplayValue("Pickup")).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Save defaults" }));

    expect(putBody(fetchMock)).toEqual({ price: { tiers } });
    expect(onSaved).toHaveBeenCalled();
  });

  it("adds a tier and saves it", async () => {
    const { fetchMock } = mountPane({});
    await screen.findByLabelText("Set a default for price tiers");

    await userEvent.click(screen.getByLabelText("Set a default for price tiers"));
    await userEvent.click(screen.getByRole("button", { name: "Add tier" }));
    await userEvent.type(screen.getByDisplayValue("0"), "12");
    await userEvent.click(screen.getByRole("button", { name: "Save defaults" }));

    expect(putBody(fetchMock)).toEqual({
      price: { tiers: [{ label: "", amount: 12 }] },
    });
  });

  it("blocks saving enabled tiers with zero rows", async () => {
    const { fetchMock } = mountPane({});
    await screen.findByLabelText("Set a default for price tiers");

    await userEvent.click(screen.getByLabelText("Set a default for price tiers"));
    await userEvent.click(screen.getByRole("button", { name: "Save defaults" }));

    expect(screen.getByRole("alert").textContent).toContain("add at least one tier");
    expect(putBody(fetchMock)).toBeUndefined();
  });

  it("drops tiers from the saved defaults when the checkbox is switched off", async () => {
    const tiers = [{ label: "Pickup", miles_max: 5, amount: 40 }];
    const { fetchMock } = mountPane({ price: { tiers } });

    const checkbox = await screen.findByLabelText("Set a default for price tiers");
    await userEvent.click(checkbox);
    await userEvent.click(screen.getByRole("button", { name: "Save defaults" }));

    expect(putBody(fetchMock)).toEqual({});
  });
});
