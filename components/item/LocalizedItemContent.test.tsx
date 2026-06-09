// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

// Isolate the Markdown rendering from the locale context — the default locale
// path just returns the English fields, which is all this test exercises.
vi.mock("@/components/i18n/useLocale", () => ({
  useLocale: () => ({ locale: "en", setLocale: () => {} }),
}));

import { LocalizedItemContent } from "./LocalizedItemContent";
import type { Item } from "@/lib/content/types";

afterEach(cleanup);

// Only name/description are read on the default-locale path; cast the rest.
function makeItem(over: Partial<Item>): Item {
  return {
    categorySlug: "c",
    itemSlug: "i",
    name: "Test Item",
    description: "",
    ...over,
  } as Item;
}

describe("LocalizedItemContent — Markdown is rendered safely", () => {
  it("does not render raw HTML embedded in the seller description", () => {
    const { container } = render(
      <LocalizedItemContent
        item={makeItem({ description: "<img src=x onerror=alert(1)> hello" })}
      />,
    );
    // react-markdown@9 does not parse raw HTML without rehype-raw, so no live
    // <img> / event-handler element is ever created.
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
  });

  it("neutralizes javascript: links written as Markdown", () => {
    const { container } = render(
      <LocalizedItemContent
        item={makeItem({ description: "[click me](javascript:alert(1))" })}
      />,
    );
    const link = container.querySelector("a");
    // react-markdown's default urlTransform strips dangerous protocols.
    expect(link?.getAttribute("href") ?? "").not.toContain("javascript:");
  });

  it("still renders ordinary Markdown", () => {
    const { container } = render(
      <LocalizedItemContent item={makeItem({ description: "**bold** text" })} />,
    );
    expect(container.querySelector("strong")?.textContent).toBe("bold");
  });
});
