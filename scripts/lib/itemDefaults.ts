// Two-tier item defaults for studio and the CLIs.
//
// Defaults live in sparse JSON files under content/items/:
//   content/items/_defaults.json                (site-wide)
//   content/items/<category>/_defaults.json     (per category)
// Only the fields the seller explicitly set appear in them. When an item is
// created, the layers merge over the built-in template:
//   template <- site <- category,
// with name/listed_date/status re-applied from the template last.
//
// This module parses, validates and merges. It owns no HTTP status codes and
// writes no files — studioApi.ts and create-item.ts own the paths, the writes,
// and the translation of Error into their respective failure shapes.

import fsPromises from "fs/promises";
import path from "path";
import { assertEditableValue, EDITABLE_TOP_LEVEL_FIELDS } from "./itemFields";

export const DEFAULTS_FILENAME = "_defaults.json";

export type DefaultsObject = Record<string, unknown>;

// Fields that belong to one item, never to a template: wrong for every new
// item (name, the dates) or hiding the listing from the site (status).
// reserved_for is Iron Rule 4 — private buyer info, never written by tooling —
// and gets its own message so the reason is obvious.
const NEVER_DEFAULTABLE = new Set(["name", "status", "listed_date", "sold_date"]);
const PRIVATE_FIELD = "reserved_for";

// dimensions/weight defaults may hold single leaves (e.g. only `unit`), so
// they are validated leaf by leaf: the whole-object schemas require every key,
// which sparse defaults must not.
const LEAF_OBJECT_FIELDS = new Set(["dimensions", "weight"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseDefaultsText(text: string, source: string): DefaultsObject {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`invalid defaults in ${source}: not valid JSON`);
  }
  if (!isPlainObject(raw)) {
    throw new Error(`invalid defaults in ${source}: expected a JSON object`);
  }
  return raw;
}

/** A missing file is "no defaults", not an error. Anything else that fails
 * reading propagates — a permissions problem must not read as empty defaults. */
export async function readDefaultsFile(filePath: string): Promise<DefaultsObject> {
  let text: string;
  try {
    text = await fsPromises.readFile(filePath, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
  return parseDefaultsText(text, filePath);
}

export function validateDefaults(defaults: DefaultsObject): void {
  for (const [field, value] of Object.entries(defaults)) {
    if (field === PRIVATE_FIELD) {
      throw new Error(`"${field}" is private buyer info and can never be a default`);
    }
    if (NEVER_DEFAULTABLE.has(field)) {
      throw new Error(`"${field}" belongs to each item and can never be a default`);
    }
    if (!EDITABLE_TOP_LEVEL_FIELDS.includes(field)) {
      throw new Error(`Refusing to store a default outside the item.json schema: "${field}"`);
    }
    if (LEAF_OBJECT_FIELDS.has(field)) {
      if (!isPlainObject(value)) {
        throw new Error(`Invalid value for "${field}": expected an object`);
      }
      for (const [leaf, leafValue] of Object.entries(value)) {
        assertEditableValue([field, leaf], leafValue);
      }
      continue;
    }
    assertEditableValue([field], value);
  }
}

/** Deep merge for plain objects; arrays and scalars are replaced wholesale. */
function deepMerge(base: unknown, override: unknown): unknown {
  if (isPlainObject(base) && isPlainObject(override)) {
    const out: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(override)) {
      out[key] = deepMerge(base[key], value);
    }
    return out;
  }
  return override;
}

export function mergeDefaultsLayers(site: DefaultsObject, category: DefaultsObject): DefaultsObject {
  return deepMerge(site, category) as DefaultsObject;
}

export function mergeDefaultsIntoTemplate<T extends Record<string, unknown>>(
  template: T,
  defaults: DefaultsObject,
): T {
  // Defense in depth: validateDefaults rejects these on the write path, but a
  // hand-edited _defaults.json never passed through it, so the merge strips
  // the never-defaultable and private keys itself.
  const safe: DefaultsObject = {};
  for (const [key, value] of Object.entries(defaults)) {
    if (key === PRIVATE_FIELD || NEVER_DEFAULTABLE.has(key)) continue;
    safe[key] = value;
  }
  const merged = deepMerge(template, safe) as T;
  // TypeScript only permits property writes to a generic T through a widened
  // view; the casts are type-level only and change no runtime behavior.
  const mergedRecord = merged as Record<string, unknown>;
  const templateRecord = template as Record<string, unknown>;
  mergedRecord.name = templateRecord.name;
  mergedRecord.listed_date = templateRecord.listed_date;
  mergedRecord.status = templateRecord.status;
  return merged;
}

async function readAndValidate(filePath: string): Promise<DefaultsObject> {
  const defaults = await readDefaultsFile(filePath);
  try {
    validateDefaults(defaults);
  } catch (err: unknown) {
    throw new Error(`invalid defaults in ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
  return defaults;
}

/** Reads and validates both layers and returns them merged, category over
 * site. Either file may be absent; that is {} and not an error. */
export async function loadMergedDefaults(itemsRoot: string, category: string): Promise<DefaultsObject> {
  const site = await readAndValidate(path.join(itemsRoot, DEFAULTS_FILENAME));
  const categoryDefaults = await readAndValidate(path.join(itemsRoot, category, DEFAULTS_FILENAME));
  return mergeDefaultsLayers(site, categoryDefaults);
}
