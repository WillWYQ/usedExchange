// AST-backed reader and surgical writer for content/config.ts.
//
// The config file is the ONE TypeScript file sellers hand-edit, and it is
// dense with explanatory comments (182 of its 368 lines). The whole point of
// this module is that a write changes exactly one value's characters and leaves
// every other byte — including every comment — untouched. So we locate values
// by their exact character range in the parsed AST and splice there, rather
// than serialising an object back out (which would discard all comments).
//
// Pure module: no fs, no HTTP, no React. studioApi.ts owns the file IO.

import ts from "typescript";

export type ConfigFieldKind = "string" | "number" | "boolean" | "enum" | "unsupported";

export type ConfigField = {
  /** Dotted path from the config root, e.g. "location.lat". */
  path: string;
  /** Current value; `null` for unsupported fields whose value we don't model. */
  value: string | number | boolean | null;
  kind: ConfigFieldKind;
  /** Legal values when `kind === "enum"`, read from the types file. */
  options?: string[];
  /** Explanation taken from the file's own comments. */
  doc?: string;
  /** Grouping title from the `// ── Title ─` dividers (or "UI translations"). */
  section: string;
  /** Character range [start, end) of the value literal in the source. */
  range: [number, number];
};

const I18N_SECTION = "UI translations";
const I18N_TRANSLATIONS_PREFIX = "i18n.translations.";
const DIVIDER_RE = /^\s*\/\/\s*─+\s*(.+?)\s*─+\s*$/;

// ── Parsing helpers ──────────────────────────────────────────────────────────

/** Returns the ObjectLiteralExpression assigned to `siteConfig`, or undefined. */
function findConfigObject(source: string): { sf: ts.SourceFile; obj: ts.ObjectLiteralExpression } | undefined {
  const sf = ts.createSourceFile("config.ts", source, ts.ScriptTarget.Latest, true);
  let found: ts.ObjectLiteralExpression | undefined;
  const visit = (node: ts.Node): void => {
    if (found !== undefined) return;
    if (ts.isVariableDeclaration(node) && node.name.getText(sf) === "siteConfig" && node.initializer !== undefined && ts.isObjectLiteralExpression(node.initializer)) {
      found = node.initializer;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found === undefined ? undefined : { sf, obj: found };
}

function propertyName(node: ts.PropertyName, sf: ts.SourceFile): string {
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  return node.getText(sf).replace(/^["']|["']$/g, "");
}

// ── Enum options from the types file ─────────────────────────────────────────

/**
 * Returns the members of the `SiteConfig` type/interface declared in
 * `typesSource`, or [] if none is found. Handles both
 * `interface SiteConfig { … }` and `type SiteConfig = { … }`.
 */
function siteConfigMembers(typesSource: string): ts.NodeArray<ts.TypeElement> | readonly ts.TypeElement[] {
  const sf = ts.createSourceFile("types.ts", typesSource, ts.ScriptTarget.Latest, true);
  let members: ts.NodeArray<ts.TypeElement> | readonly ts.TypeElement[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === "SiteConfig") {
      members = node.members;
      return;
    }
    if (ts.isTypeAliasDeclaration(node) && node.name.text === "SiteConfig" && ts.isTypeLiteralNode(node.type)) {
      members = node.type.members;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return members;
}

function memberName(member: ts.TypeElement, sf: ts.SourceFile): string | undefined {
  if ((member as ts.PropertySignature).name === undefined) return undefined;
  const name = (member as ts.PropertySignature).name;
  if (name === undefined) return undefined;
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return name.getText(sf);
}

/**
 * Resolves the TypeNode for a dotted path within the SiteConfig members.
 * Returns undefined when the path can't be resolved — notably when it passes
 * through a named type reference (e.g. `ui: UIConfig` from another file),
 * which we deliberately do not follow. Callers then treat the field as a plain
 * string rather than an enum.
 */
function resolveTypeNode(
  members: ts.NodeArray<ts.TypeElement> | readonly ts.TypeElement[],
  parts: string[],
  sf: ts.SourceFile,
): ts.TypeNode | undefined {
  if (parts.length === 0) return undefined;
  const [head, ...rest] = parts;
  const member = members.find((m) => memberName(m, sf) === head);
  if (member === undefined) return undefined;
  const typeNode = (member as ts.PropertySignature).type;
  if (typeNode === undefined) return undefined;
  if (rest.length === 0) return typeNode;
  if (ts.isTypeLiteralNode(typeNode)) return resolveTypeNode(typeNode.members, rest, sf);
  return undefined; // named reference (UIConfig, …) — not followed
}

/** Reads a pure string-literal union like `"a" | "b"` into ["a","b"], else undefined. */
function enumOptions(typeNode: ts.TypeNode | undefined): string[] | undefined {
  if (typeNode === undefined || !ts.isUnionTypeNode(typeNode)) return undefined;
  const options: string[] = [];
  for (const member of typeNode.types) {
    if (ts.isLiteralTypeNode(member) && ts.isStringLiteral(member.literal)) {
      options.push(member.literal.text);
    } else {
      return undefined; // any non-string-literal member disqualifies it
    }
  }
  return options.length > 0 ? options : undefined;
}

// ── Comments and sections ────────────────────────────────────────────────────

/**
 * Collects the doc for one property: a contiguous run of whole-line `//`
 * comments directly above it, or else a trailing `//` comment on its own line.
 * Divider lines and blank lines stop the upward walk and are never included.
 */
function docForProperty(sf: ts.SourceFile, source: string, prop: ts.PropertyAssignment): string | undefined {
  const lines = source.split("\n");
  const propLine = sf.getLineAndCharacterOfPosition(prop.getStart(sf)).line;

  const block: string[] = [];
  for (let i = propLine - 1; i >= 0; i--) {
    const raw = lines[i] ?? "";
    const trimmed = raw.trim();
    if (trimmed === "") break;
    if (DIVIDER_RE.test(trimmed)) break;
    if (trimmed.startsWith("//")) {
      block.unshift(trimmed.replace(/^\/\/\s?/, ""));
      continue;
    }
    break; // any other content (a sibling field) stops the block
  }
  if (block.length > 0) return block.join("\n");

  // Trailing comment on the property's own line, after the value.
  const ownLine = lines[propLine] ?? "";
  const valueEndLine = sf.getLineAndCharacterOfPosition(prop.initializer.getEnd()).line;
  if (valueEndLine === propLine) {
    const after = ownLine.slice(sf.getLineAndCharacterOfPosition(prop.initializer.getEnd()).character);
    const m = after.match(/\/\/\s?(.*)$/);
    if (m !== null && m[1] !== undefined && m[1].trim() !== "") return m[1].trim();
  }
  return undefined;
}

/** Maps line index → divider title for every `// ── Title ─` line. */
function dividerTitles(source: string): Array<{ line: number; title: string }> {
  const out: Array<{ line: number; title: string }> = [];
  source.split("\n").forEach((line, idx) => {
    const m = line.trim().match(DIVIDER_RE);
    if (m !== null && m[1] !== undefined) out.push({ line: idx, title: m[1].trim() });
  });
  return out;
}

function sectionFor(sf: ts.SourceFile, prop: ts.PropertyAssignment, path: string, dividers: Array<{ line: number; title: string }>): string {
  if (path.startsWith(I18N_TRANSLATIONS_PREFIX)) return I18N_SECTION;
  const line = sf.getLineAndCharacterOfPosition(prop.getStart(sf)).line;
  let best: { line: number; title: string } | undefined;
  for (const d of dividers) {
    if (d.line < line && (best === undefined || d.line > best.line)) best = d;
  }
  return best === undefined ? "" : best.title;
}

// ── readConfig ───────────────────────────────────────────────────────────────

export function readConfig(source: string, typesSource: string): ConfigField[] {
  const parsed = findConfigObject(source);
  if (parsed === undefined) {
    throw new Error("no `siteConfig` object found in the config source");
  }
  const { sf, obj } = parsed;
  const typesSf = ts.createSourceFile("types.ts", typesSource, ts.ScriptTarget.Latest, true);
  const typeMembers = siteConfigMembers(typesSource);
  const dividers = dividerTitles(source);
  const fields: ConfigField[] = [];

  const walk = (objLiteral: ts.ObjectLiteralExpression, prefix: string, pendingDoc: string | undefined): void => {
    let pendingConsumed = pendingDoc === undefined; // nothing to hand down → already "consumed"
    for (const member of objLiteral.properties) {
      if (!ts.isPropertyAssignment(member)) continue;
      const key = propertyName(member.name, sf);
      const path = prefix === "" ? key : `${prefix}.${key}`;
      const init = member.initializer;
      const ownDoc = docForProperty(sf, source, member);
      const section = sectionFor(sf, member, path, dividers);

      if (ts.isObjectLiteralExpression(init)) {
        // A comment above an object describes the group; hand it to the first
        // leaf child so the pane shows it on a field it actually renders.
        walk(init, path, ownDoc);
        continue;
      }

      let doc = ownDoc;
      if (doc === undefined && !pendingConsumed) {
        doc = pendingDoc;
        pendingConsumed = true;
      }

      const range: [number, number] = [init.getStart(sf), init.getEnd()];
      const base: Omit<ConfigField, "kind" | "value" | "options"> = { path, doc, section, range };

      if (ts.isStringLiteral(init)) {
        const options = enumOptions(resolveTypeNode(typeMembers, path.split("."), typesSf));
        if (options !== undefined) {
          fields.push({ ...base, kind: "enum", value: init.text, options });
        } else {
          fields.push({ ...base, kind: "string", value: init.text });
        }
      } else if (ts.isNumericLiteral(init)) {
        fields.push({ ...base, kind: "number", value: Number(init.text) });
      } else if (init.kind === ts.SyntaxKind.TrueKeyword) {
        fields.push({ ...base, kind: "boolean", value: true });
      } else if (init.kind === ts.SyntaxKind.FalseKeyword) {
        fields.push({ ...base, kind: "boolean", value: false });
      } else if (ts.isPrefixUnaryExpression(init) && init.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(init.operand)) {
        fields.push({ ...base, kind: "number", value: -Number(init.operand.text) });
      } else {
        // Arrays and anything we don't model are read-only in this work. We
        // refuse to best-effort edit them because an element add/remove or a
        // multi-line value rewrite is a different, far riskier operation than
        // the single-value splices this module guarantees.
        fields.push({ ...base, kind: "unsupported", value: null });
      }
    }
  };

  walk(obj, "", undefined);
  return fields;
}

// ── writeConfigValue ─────────────────────────────────────────────────────────

/** Finds the PropertyAssignment for a dotted path, or undefined. */
function findProperty(obj: ts.ObjectLiteralExpression, parts: string[], sf: ts.SourceFile): ts.PropertyAssignment | undefined {
  const [head, ...rest] = parts;
  for (const member of obj.properties) {
    if (!ts.isPropertyAssignment(member)) continue;
    if (propertyName(member.name, sf) !== head) continue;
    if (rest.length === 0) return member;
    if (ts.isObjectLiteralExpression(member.initializer)) {
      return findProperty(member.initializer, rest, sf);
    }
    return undefined;
  }
  return undefined;
}

function renderValue(newValue: string | number | boolean): string {
  if (typeof newValue === "string") return JSON.stringify(newValue);
  if (typeof newValue === "boolean") return newValue ? "true" : "false";
  return JSON.stringify(newValue);
}

/**
 * Replaces the single value at `path` by its exact character range, leaving
 * every other byte of `source` untouched. Throws on unknown or unsupported
 * paths. Never reformats, re-indents, or re-serialises the file.
 */
export function writeConfigValue(source: string, path: string, newValue: string | number | boolean): string {
  const parsed = findConfigObject(source);
  if (parsed === undefined) {
    throw new Error(`no \`siteConfig\` object found while writing ${path}`);
  }
  const { sf, obj } = parsed;
  const prop = findProperty(obj, path.split("."), sf);
  if (prop === undefined) {
    throw new Error(`Unknown config path: ${path}`);
  }
  const init = prop.initializer;
  if (ts.isObjectLiteralExpression(init) || ts.isArrayLiteralExpression(init)) {
    throw new Error(`Refusing to write ${path}: arrays and objects are read-only here`);
  }
  const start = init.getStart(sf);
  const end = init.getEnd();
  return source.slice(0, start) + renderValue(newValue) + source.slice(end);
}

// ── validateConfigValue ──────────────────────────────────────────────────────

// Fields whose values must be parseable http(s) URLs (or empty). Matched on the
// final path segment so `baseUrl` and `shipping.proxyUrl` are both covered
// without a hand-maintained list of every full path.
function isUrlField(path: string): boolean {
  const last = path.split(".").pop() ?? "";
  return /Url$/.test(last);
}

const NONNEGATIVE_INTEGER_FIELDS = new Set(["recentlyListedCount", "soldArchiveDisplayLimit"]);

export function validateConfigValue(field: ConfigField, newValue: unknown): void {
  const { path, kind } = field;

  if (kind === "unsupported") {
    throw new Error(`Refusing to write ${path}: this field is read-only in studio`);
  }

  if (kind === "enum") {
    if (typeof newValue !== "string" || field.options === undefined || !field.options.includes(newValue)) {
      throw new Error(`Invalid value for ${path}: expected one of ${(field.options ?? []).join(", ")}`);
    }
    return;
  }

  if (kind === "boolean") {
    if (typeof newValue !== "boolean") {
      throw new Error(`Invalid value for ${path}: expected true or false`);
    }
    return;
  }

  if (kind === "number") {
    if (typeof newValue !== "number" || !Number.isFinite(newValue)) {
      throw new Error(`Invalid value for ${path}: expected a finite number`);
    }
    const last = path.split(".").pop() ?? "";
    if (NONNEGATIVE_INTEGER_FIELDS.has(last)) {
      if (!Number.isInteger(newValue) || newValue < 0) {
        throw new Error(`Invalid value for ${path}: expected a whole number ≥ 0`);
      }
    } else if (!Number.isInteger(newValue)) {
      // Counts and retention days are whole numbers; lat/lng are the exceptions.
      if (path !== "location.lat" && path !== "location.lng") {
        throw new Error(`Invalid value for ${path}: expected a whole number`);
      }
    }
    if (path === "location.lat" && (newValue < -90 || newValue > 90)) {
      throw new Error(`Invalid value for ${path}: latitude must be within ±90`);
    }
    if (path === "location.lng" && (newValue < -180 || newValue > 180)) {
      throw new Error(`Invalid value for ${path}: longitude must be within ±180`);
    }
    return;
  }

  // kind === "string"
  if (typeof newValue !== "string") {
    throw new Error(`Invalid value for ${path}: expected a string`);
  }
  // A config value is a plain string literal. A `${…}` sequence or a backtick
  // would either be an injection attempt or would corrupt the literal when we
  // write it back, so refuse both outright.
  if (newValue.includes("${") || newValue.includes("`")) {
    throw new Error(`Invalid value for ${path}: template-literal characters are not allowed`);
  }
  if (isUrlField(path)) {
    if (newValue === "") return; // empty means "not set"
    try {
      const url = new URL(newValue);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("bad protocol");
      }
    } catch {
      throw new Error(`Invalid value for ${path}: must be an http(s) URL (or empty)`);
    }
  }
}
