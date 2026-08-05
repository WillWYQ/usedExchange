import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { readConfig, validateConfigValue, writeConfigValue, type ConfigField } from "./configEdit";

const FIXTURE = `import type { SiteConfig } from "@/lib/config/types";

export const siteConfig: SiteConfig = {
  // ── Identity ─────────────────────────────────────────────
  name: "Test Store",
  tagline: "Nothing to see here.",
  logo: "/logo.svg", // path in /public, or "" for text logo

  // ── Deployment ───────────────────────────────────────────
  deploymentMode: "static", // "static" | "vercel"
  baseUrl: "https://example.com",

  // ── Seller location ──────────────────────────────────────
  // Find coords: maps.google.com
  location: {
    lat: 37.7749,
    lng: -122.4194,
    label: "San Francisco, CA",
  },

  // ── Content defaults ─────────────────────────────────────
  recentlyListedCount: 6,
  soldItemRetentionDays: -1,

  // ── Contact ──────────────────────────────────────────────
  contact: {
    platforms: ["email", "sms"],
  },

  // ── Full-text search ─────────────────────────────────────
  search: {
    enabled: true,
  },
};
`;

const TYPES = `export type DeploymentMode = "static" | "vercel";

export interface SiteConfig {
  name: string;
  tagline: string;
  logo: string;
  deploymentMode: "static" | "vercel";
  baseUrl: string;
  location: { lat: number; lng: number; label: string };
  recentlyListedCount: number;
  soldItemRetentionDays: number;
  contact: { platforms: string[] };
  search: { enabled: boolean };
}
`;

const fields = (): ConfigField[] => readConfig(FIXTURE, TYPES);
const byPath = (p: string): ConfigField => {
  const f = fields().find((x) => x.path === p);
  if (f === undefined) throw new Error(`no field at ${p}`);
  return f;
};

describe("readConfig — paths and kinds", () => {
  it("flattens nested objects into dotted paths", () => {
    const paths = fields().map((f) => f.path);
    expect(paths).toContain("name");
    expect(paths).toContain("location.lat");
    expect(paths).toContain("search.enabled");
  });

  it("reads each literal kind with its value", () => {
    expect(byPath("name")).toMatchObject({ kind: "string", value: "Test Store" });
    expect(byPath("recentlyListedCount")).toMatchObject({ kind: "number", value: 6 });
    expect(byPath("search.enabled")).toMatchObject({ kind: "boolean", value: true });
  });

  it("reads a negative number", () => {
    expect(byPath("soldItemRetentionDays")).toMatchObject({ kind: "number", value: -1 });
  });

  it("marks arrays unsupported", () => {
    expect(byPath("contact.platforms").kind).toBe("unsupported");
  });
});

describe("readConfig — enums from the types file", () => {
  it("reads union members as enum options", () => {
    const f = byPath("deploymentMode");
    expect(f.kind).toBe("enum");
    expect(f.options).toEqual(["static", "vercel"]);
  });

  it("leaves a plain string as string, not enum", () => {
    expect(byPath("tagline").kind).toBe("string");
    expect(byPath("tagline").options).toBeUndefined();
  });
});

describe("readConfig — docs and sections", () => {
  it("takes a trailing comment as the doc", () => {
    expect(byPath("logo").doc).toContain("path in /public");
  });

  it("takes the block above the field as the doc", () => {
    // The comment sits above `location: {` — an object — and attaches to its
    // first leaf child (see the implementation notes).
    expect(byPath("location.lat").doc).toContain("maps.google.com");
  });

  it("leaves doc undefined when there is no comment", () => {
    expect(byPath("baseUrl").doc).toBeUndefined();
  });

  it("never swallows the section divider into a doc", () => {
    for (const f of fields()) expect(f.doc ?? "").not.toContain("──");
  });

  it("assigns each field its nearest section heading", () => {
    expect(byPath("name").section).toBe("Identity");
    expect(byPath("deploymentMode").section).toBe("Deployment");
    expect(byPath("search.enabled").section).toBe("Full-text search");
  });
});

describe("writeConfigValue — surgical, comment-preserving", () => {
  const commentLines = (s: string): number => (s.match(/^\s*\/\//gm) ?? []).length;
  const changedLines = (a: string, b: string): number => {
    const la = a.split("\n");
    const lb = b.split("\n");
    expect(la.length).toBe(lb.length);
    return la.filter((l, i) => l !== lb[i]).length;
  };

  it("changes a number and nothing else", () => {
    const out = writeConfigValue(FIXTURE, "recentlyListedCount", 9);
    expect(changedLines(FIXTURE, out)).toBe(1);
    expect(commentLines(out)).toBe(commentLines(FIXTURE));
    expect(readConfig(out, TYPES).find((f) => f.path === "recentlyListedCount")?.value).toBe(9);
  });

  it("changes a nested string and nothing else", () => {
    const out = writeConfigValue(FIXTURE, "location.label", "Austin, TX");
    expect(changedLines(FIXTURE, out)).toBe(1);
    expect(commentLines(out)).toBe(commentLines(FIXTURE));
    expect(out).toContain('label: "Austin, TX"');
  });

  it("changes a boolean and nothing else", () => {
    const out = writeConfigValue(FIXTURE, "search.enabled", false);
    expect(changedLines(FIXTURE, out)).toBe(1);
    expect(out).toContain("enabled: false");
  });

  it("keeps a trailing comment on the line it edits", () => {
    const out = writeConfigValue(FIXTURE, "logo", "/brand.svg");
    expect(out).toContain('logo: "/brand.svg", // path in /public');
  });

  it("escapes a string value rather than breaking the file", () => {
    const out = writeConfigValue(FIXTURE, "tagline", 'He said "hi"');
    expect(readConfig(out, TYPES).find((f) => f.path === "tagline")?.value).toBe('He said "hi"');
  });

  it("refuses an unknown path", () => {
    expect(() => writeConfigValue(FIXTURE, "nope.nothing", 1)).toThrow(/nope\.nothing/);
  });

  it("refuses an array field", () => {
    expect(() => writeConfigValue(FIXTURE, "contact.platforms", "x")).toThrow(/contact\.platforms/);
  });
});

describe("validateConfigValue", () => {
  it("accepts a legal enum member and rejects others", () => {
    const f = byPath("deploymentMode");
    expect(() => validateConfigValue(f, "vercel")).not.toThrow();
    expect(() => validateConfigValue(f, "netlify")).toThrow(/deploymentMode/);
  });

  it("rejects a template-literal injection in a string", () => {
    expect(() => validateConfigValue(byPath("name"), "a ${process.env.X} b")).toThrow();
    expect(() => validateConfigValue(byPath("name"), "back`tick")).toThrow();
  });

  it("requires an http(s) URL for baseUrl but allows empty", () => {
    const f = byPath("baseUrl");
    expect(() => validateConfigValue(f, "https://ok.example")).not.toThrow();
    expect(() => validateConfigValue(f, "")).not.toThrow();
    expect(() => validateConfigValue(f, "javascript:alert(1)")).toThrow(/baseUrl/);
    expect(() => validateConfigValue(f, "not a url")).toThrow(/baseUrl/);
  });

  it("bounds latitude and longitude", () => {
    expect(() => validateConfigValue(byPath("location.lat"), 91)).toThrow(/lat/);
    expect(() => validateConfigValue(byPath("location.lng"), -181)).toThrow(/lng/);
    expect(() => validateConfigValue(byPath("location.lat"), 37.5)).not.toThrow();
  });

  it("rejects a negative count and a non-finite number", () => {
    expect(() => validateConfigValue(byPath("recentlyListedCount"), -1)).toThrow();
    expect(() => validateConfigValue(byPath("recentlyListedCount"), Number.NaN)).toThrow();
  });

  it("allows a negative soldItemRetentionDays (-1 means hide immediately)", () => {
    expect(() => validateConfigValue(byPath("soldItemRetentionDays"), -1)).not.toThrow();
  });

  it("rejects any write to an unsupported field", () => {
    expect(() => validateConfigValue(byPath("contact.platforms"), "x")).toThrow();
  });

  it("rejects a value of the wrong type", () => {
    expect(() => validateConfigValue(byPath("recentlyListedCount"), "six")).toThrow();
    expect(() => validateConfigValue(byPath("search.enabled"), "yes")).toThrow();
  });
});

describe("the real content/config.ts", () => {
  const real = fs.readFileSync(path.join(process.cwd(), "content/config.ts"), "utf-8");
  const realTypes = fs.readFileSync(path.join(process.cwd(), "lib/config/types.ts"), "utf-8");

  it("parses without throwing and finds the known fields", () => {
    const list = readConfig(real, realTypes);
    const paths = list.map((f) => f.path);
    expect(paths).toContain("name");
    expect(paths).toContain("location.lat");
    expect(paths).toContain("ui.priceFilterStrategy");
  });

  it("groups every i18n translation under one section", () => {
    const list = readConfig(real, realTypes);
    const translations = list.filter((f) => f.path.startsWith("i18n.translations."));
    expect(translations.length).toBeGreaterThan(50);
    for (const f of translations) expect(f.section).toBe("UI translations");
  });

  it("round-trips a real edit without disturbing the file", () => {
    const out = writeConfigValue(real, "recentlyListedCount", 7);
    expect((out.match(/^\s*\/\//gm) ?? []).length).toBe((real.match(/^\s*\/\//gm) ?? []).length);
    expect(out.split("\n").filter((l, i) => l !== real.split("\n")[i]).length).toBe(1);
    expect(readConfig(out, realTypes).find((f) => f.path === "recentlyListedCount")?.value).toBe(7);
  });
});
