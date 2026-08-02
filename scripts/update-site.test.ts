import { describe, expect, it } from "vitest";
import fs from "fs/promises";

/**
 * The `git checkout <tag> -- …` path list out of an UPDATE_GUIDE, as a set.
 * The command spans several backslash-continued lines inside a ```bash fence.
 */
function guidePaths(markdown: string): Set<string> {
  const start = markdown.indexOf("git checkout v1.2.0 -- \\");
  if (start === -1) throw new Error("the `git checkout` block is missing from the guide");
  const block = markdown.slice(start).split("```")[0] ?? "";
  return new Set(
    block
      .replace("git checkout v1.2.0 -- ", "")
      .split(/[\s\\]+/)
      .map((token) => token.trim())
      .filter((token) => token !== ""),
  );
}

/** TEMPLATE_PATHS out of scripts/update-site.ts, as a set. */
function templatePaths(source: string): Set<string> {
  const start = source.indexOf("const TEMPLATE_PATHS = [");
  if (start === -1) throw new Error("TEMPLATE_PATHS is missing from scripts/update-site.ts");
  const block = source.slice(start, source.indexOf("];", start));
  return new Set([...block.matchAll(/"([^"]+)"/g)].map((m) => m[1] as string));
}

describe("scripts/update-site.ts TEMPLATE_PATHS", () => {
  it("keeps TEMPLATE_PATHS and both UPDATE_GUIDE path lists in sync", async () => {
    // The comment above TEMPLATE_PATHS says "keep in sync with Step 2 of
    // docs/UPDATE_GUIDE.md / docs/UPDATE_GUIDE_zh.md". This is that instruction,
    // enforced — including Iron Rule 2's requirement that the Chinese guide is
    // never left behind.
    const expected = templatePaths(await fs.readFile("scripts/update-site.ts", "utf-8"));
    const en = guidePaths(await fs.readFile("docs/UPDATE_GUIDE.md", "utf-8"));
    const zh = guidePaths(await fs.readFile("docs/UPDATE_GUIDE_zh.md", "utf-8"));

    expect(expected.has("studio")).toBe(true);
    expect([...en].sort()).toEqual([...expected].sort());
    expect([...zh].sort()).toEqual([...expected].sort());
  });
});
