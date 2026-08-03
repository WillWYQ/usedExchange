import { afterEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { buildItemTemplate } from "./itemTemplate";
import {
  DEFAULTS_FILENAME,
  loadMergedDefaults,
  mergeDefaultsIntoTemplate,
  mergeDefaultsLayers,
  parseDefaultsText,
  readDefaultsFile,
  validateDefaults,
} from "./itemDefaults";

describe("parseDefaultsText", () => {
  it("parses a sparse defaults object", () => {
    expect(parseDefaultsText('{"no_lowball": true}', "x.json")).toEqual({ no_lowball: true });
  });

  it("rejects invalid JSON naming the source", () => {
    expect(() => parseDefaultsText("{nope", "content/items/_defaults.json")).toThrow(
      /content\/items\/_defaults\.json.*not valid JSON/,
    );
  });

  it("rejects non-object roots", () => {
    expect(() => parseDefaultsText("[1, 2]", "x.json")).toThrow(/expected a JSON object/);
    expect(() => parseDefaultsText("null", "x.json")).toThrow(/expected a JSON object/);
  });
});

describe("readDefaultsFile", () => {
  it("returns {} when the file does not exist", async () => {
    expect(await readDefaultsFile(path.join(os.tmpdir(), "no-such-dir", DEFAULTS_FILENAME))).toEqual({});
  });
});

describe("validateDefaults", () => {
  it("accepts a realistic sparse set", () => {
    expect(() =>
      validateDefaults({
        preferred_payment: ["cash", "venmo"],
        contact_note: "WeChat: xxx",
        pickup_windows: ["Weekday evenings"],
        no_lowball: true,
        price: { currency: "USD", negotiable: true },
        dimensions: { unit: "in" },
        weight: { unit: "lb" },
      }),
    ).not.toThrow();
  });

  it("rejects reserved_for with its own message", () => {
    expect(() => validateDefaults({ reserved_for: "someone" })).toThrow(/private buyer info/);
  });

  it.each(["name", "status", "listed_date", "sold_date"])(
    "rejects the per-item field %s",
    (field) => {
      expect(() => validateDefaults({ [field]: "x" })).toThrow(/can never be a default/);
    },
  );

  it("rejects a field outside the item.json schema", () => {
    expect(() => validateDefaults({ colour: "red" })).toThrow(/outside the item\.json schema/);
  });

  it("rejects an invalid leaf value naming the path", () => {
    expect(() => validateDefaults({ no_lowball: "yes" })).toThrow(/no_lowball/);
    expect(() => validateDefaults({ dimensions: { length: -1 } })).toThrow(/dimensions\.length/);
    expect(() => validateDefaults({ price: { bogus: true } })).toThrow(/bogus/);
  });

  it("rejects a non-object dimensions/weight default", () => {
    expect(() => validateDefaults({ dimensions: null })).toThrow(/dimensions.*expected an object/);
  });
});

describe("mergeDefaultsLayers", () => {
  it("category overrides site scalars and replaces arrays wholesale", () => {
    expect(
      mergeDefaultsLayers(
        { contact_note: "site", pickup_windows: ["a", "b"], no_lowball: false },
        { contact_note: "cat", pickup_windows: ["c"] },
      ),
    ).toEqual({ contact_note: "cat", pickup_windows: ["c"], no_lowball: false });
  });

  it("deep-merges nested objects leaf by leaf", () => {
    expect(
      mergeDefaultsLayers({ price: { currency: "EUR", negotiable: false } }, { price: { negotiable: true } }),
    ).toEqual({ price: { currency: "EUR", negotiable: true } });
  });
});

describe("mergeDefaultsIntoTemplate", () => {
  const template = () => buildItemTemplate("Desk Lamp", "2026-08-02");

  it("merges defaults over the template", () => {
    const merged = mergeDefaultsIntoTemplate(template(), {
      contact_note: "WeChat: xxx",
      price: { currency: "EUR", negotiable: true },
      dimensions: { unit: "in" },
    });
    expect(merged.contact_note).toBe("WeChat: xxx");
    expect(merged.price.currency).toBe("EUR");
    expect(merged.price.negotiable).toBe(true);
    // Untouched template leaves survive the merge.
    expect(merged.price.show_tiers).toBe(false);
    expect(merged.dimensions.length).toBeNull();
    expect(merged.dimensions.unit).toBe("in");
  });

  it("never lets defaults touch name, status, listed_date, sold_date, reserved_for", () => {
    const merged = mergeDefaultsIntoTemplate(template(), {
      name: "Hijacked",
      status: "available",
      listed_date: "2000-01-01",
      sold_date: "2000-01-02",
      reserved_for: "someone",
    });
    expect(merged.name).toBe("Desk Lamp");
    expect(merged.status).toBe("draft");
    expect(merged.listed_date).toBe("2026-08-02");
    expect(merged.sold_date).toBeNull();
    expect("reserved_for" in merged).toBe(false);
  });

  it("does not mutate the template", () => {
    const base = template();
    mergeDefaultsIntoTemplate(base, { contact_note: "x" });
    expect(base.contact_note).toBe("");
  });
});

describe("loadMergedDefaults", () => {
  let root = "";

  afterEach(async () => {
    if (root !== "") await fs.rm(root, { recursive: true, force: true });
    root = "";
  });

  async function itemsRoot(): Promise<string> {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "item-defaults-"));
    const items = path.join(root, "content", "items");
    await fs.mkdir(path.join(items, "electronics"), { recursive: true });
    return items;
  }

  it("merges site and category layers, category winning", async () => {
    const items = await itemsRoot();
    await fs.writeFile(
      path.join(items, DEFAULTS_FILENAME),
      JSON.stringify({ contact_note: "site", no_lowball: true }),
      "utf-8",
    );
    await fs.writeFile(
      path.join(items, "electronics", DEFAULTS_FILENAME),
      JSON.stringify({ contact_note: "cat" }),
      "utf-8",
    );
    expect(await loadMergedDefaults(items, "electronics")).toEqual({
      contact_note: "cat",
      no_lowball: true,
    });
  });

  it("returns {} when neither file exists", async () => {
    const items = await itemsRoot();
    expect(await loadMergedDefaults(items, "electronics")).toEqual({});
  });

  it("rejects an invalid layer naming the file and the field", async () => {
    const items = await itemsRoot();
    await fs.writeFile(path.join(items, DEFAULTS_FILENAME), JSON.stringify({ name: "X" }), "utf-8");
    await expect(loadMergedDefaults(items, "electronics")).rejects.toThrow(
      new RegExp(`${path.join(items, DEFAULTS_FILENAME).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*"name"`),
    );
  });

  it("rejects unparseable JSON naming the file", async () => {
    const items = await itemsRoot();
    await fs.writeFile(path.join(items, "electronics", DEFAULTS_FILENAME), "{oops", "utf-8");
    await expect(loadMergedDefaults(items, "electronics")).rejects.toThrow(/electronics\/_defaults\.json.*not valid JSON/);
  });
});
