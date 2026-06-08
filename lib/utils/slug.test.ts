import { describe, it, expect } from "vitest";
import { isValidSlug } from "./slug";

describe("isValidSlug", () => {
  it("accepts lowercase alphanumeric slugs with hyphens", () => {
    expect(isValidSlug("electronics")).toBe(true);
    expect(isValidSlug("vintage-lamp")).toBe(true);
    expect(isValidSlug("item-2")).toBe(true);
    expect(isValidSlug("a")).toBe(true);
    expect(isValidSlug("123-go")).toBe(true);
  });

  it("rejects empty strings", () => {
    expect(isValidSlug("")).toBe(false);
  });

  it("rejects slugs starting with a hyphen", () => {
    expect(isValidSlug("-leading-hyphen")).toBe(false);
  });

  it("rejects uppercase letters", () => {
    expect(isValidSlug("Vintage-Lamp")).toBe(false);
  });

  it("rejects spaces and other whitespace", () => {
    expect(isValidSlug("vintage lamp")).toBe(false);
    expect(isValidSlug("vintage\tlamp")).toBe(false);
  });

  it("rejects path-traversal and separator characters — output: 'export' writes one HTML file per param", () => {
    expect(isValidSlug("..")).toBe(false);
    expect(isValidSlug("../escape")).toBe(false);
    expect(isValidSlug("a/b")).toBe(false);
    expect(isValidSlug("a\\b")).toBe(false);
  });

  it("rejects non-ASCII characters that would mismatch Next.js's <Link> URL encoding", () => {
    expect(isValidSlug("café")).toBe(false);
    expect(isValidSlug("商品")).toBe(false);
  });

  it("rejects punctuation and URL-special characters", () => {
    expect(isValidSlug("item(1)")).toBe(false);
    expect(isValidSlug("item?x=1")).toBe(false);
    expect(isValidSlug("item#frag")).toBe(false);
    expect(isValidSlug("item.json")).toBe(false);
  });
});
