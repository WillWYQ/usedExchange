// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithStudioI18n, useStudioT } from "./StudioI18n";
import type { StudioKey } from "./types";

afterEach(cleanup);

function TestComponent({ expectedKey }: { expectedKey: StudioKey }) {
  const { t, locale } = useStudioT();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="string">{t(expectedKey)}</span>
    </div>
  );
}

describe("StudioI18nProvider", () => {
  it("provides English strings for en locale", () => {
    renderWithStudioI18n(<TestComponent expectedKey="app.title" />, { locale: "en" });
    expect(screen.getByTestId("locale").textContent).toBe("en");
    expect(screen.getByTestId("string").textContent).toBe("Seller Studio");
  });

  it("provides Chinese strings for zh locale", () => {
    renderWithStudioI18n(<TestComponent expectedKey="header.config" />, { locale: "zh" });
    expect(screen.getByTestId("string").textContent).toBe("配置");
  });

  it("applies seller overrides", () => {
    renderWithStudioI18n(<TestComponent expectedKey="app.title" />, {
      locale: "en",
      overrides: { en: { "app.title": "Custom Title" } },
    });
    expect(screen.getByTestId("string").textContent).toBe("Custom Title");
  });
});
