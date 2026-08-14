import { describe, expect, it } from "vitest";
import { format, resolveStudioStrings } from "./resolve";

describe("resolveStudioStrings", () => {
  it("returns English strings for unknown locale", () => {
    const dict = resolveStudioStrings("fr", {});
    expect(dict["app.title"]).toBe("Seller Studio");
    expect(dict["header.config"]).toBe("Config");
  });

  it("returns Chinese strings when locale is zh", () => {
    const dict = resolveStudioStrings("zh", {});
    expect(dict["app.title"]).toBe("Seller Studio"); // same in EN + ZH
    expect(dict["header.config"]).toBe("配置");
    expect(dict["filter.status.sold"]).toBe("已售出");
  });

  it("overrides with seller-provided dictionary", () => {
    const overrides = { zh: { "app.title": "自订标题" } };
    const dict = resolveStudioStrings("zh", overrides);
    expect(dict["app.title"]).toBe("自订标题");
    expect(dict["header.config"]).toBe("配置"); // not overridden
  });

  it("falls back to English for missing locale keys", () => {
    const dict = resolveStudioStrings("zh", {});
    expect(dict["field.name"]).toBe("名称");
    expect(dict["sync.push"]).toBe("推送照片到 CDN");
  });
});

describe("format", () => {
  it("replaces {param} with values", () => {
    expect(format("{count} items", { count: 5 })).toBe("5 items");
  });

  it("handles English pluralization", () => {
    expect(format("{count} item{plural}", { count: 1 })).toBe("1 item");
    expect(format("{count} item{plural}", { count: 5 })).toBe("5 items");
  });

  it("returns template unchanged when no params", () => {
    expect(format("Hello")).toBe("Hello");
  });
});
