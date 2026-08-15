// A narrow, purpose-built reader/writer for content/config.ts's
// contact.platforms array — specifically the qr_image (and label) fields
// within each element.
//
// configEdit.ts's generic ConfigField model deliberately does not walk array
// literals (see its own comment on `walk()`: "Arrays and anything we don't
// model are read-only in this work... an element add/remove... is a
// different, far riskier operation than the single-value splices this module
// guarantees"). That means contact.platforms is exposed there as a single
// opaque "unsupported" field, and nothing inside it is reachable through the
// generic read/write pipeline.
//
// This module fills exactly that one gap without touching configEdit.ts's
// broader array-avoidance stance: it can replace an existing qr_image value,
// or add qr_image (and label, if that's also absent) to an element that
// doesn't have one yet — but it never adds, removes, or reorders an array
// ELEMENT itself, which is the specific operation configEdit.ts's comment
// calls "far riskier." Every edit here is either a pure value splice (same
// guarantee writeConfigValue gives every other field) or a property
// insertion within an object literal that already exists.

import ts from "typescript";
import { findConfigObject } from "./configEdit";

export type ContactPlatformSummary = {
  index: number;
  type: string;
  value: string | undefined;
  label: string | undefined;
  qrImage: string | undefined;
};

function propName(m: ts.PropertyAssignment, sf: ts.SourceFile): string {
  return m.name.getText(sf).replace(/^["']|["']$/g, "");
}

function findObjectProperty(
  obj: ts.ObjectLiteralExpression,
  name: string,
  sf: ts.SourceFile,
): ts.PropertyAssignment | undefined {
  return obj.properties.find(
    (m): m is ts.PropertyAssignment => ts.isPropertyAssignment(m) && propName(m, sf) === name,
  );
}

function stringProp(
  obj: ts.ObjectLiteralExpression,
  name: string,
  sf: ts.SourceFile,
): string | undefined {
  const prop = findObjectProperty(obj, name, sf);
  if (prop === undefined || !ts.isStringLiteral(prop.initializer)) return undefined;
  return prop.initializer.text;
}

function findPlatformsArray(source: string): { sf: ts.SourceFile; arr: ts.ArrayLiteralExpression } | undefined {
  const parsed = findConfigObject(source);
  if (parsed === undefined) return undefined;
  const { sf, obj } = parsed;
  const contactProp = findObjectProperty(obj, "contact", sf);
  if (contactProp === undefined || !ts.isObjectLiteralExpression(contactProp.initializer)) return undefined;
  const platformsProp = findObjectProperty(contactProp.initializer, "platforms", sf);
  if (platformsProp === undefined || !ts.isArrayLiteralExpression(platformsProp.initializer)) return undefined;
  return { sf, arr: platformsProp.initializer };
}

export function readContactPlatforms(source: string): ContactPlatformSummary[] {
  const found = findPlatformsArray(source);
  if (found === undefined) return [];
  const { sf, arr } = found;
  const out: ContactPlatformSummary[] = [];
  arr.elements.forEach((el, index) => {
    if (!ts.isObjectLiteralExpression(el)) return;
    const type = stringProp(el, "type", sf);
    if (type === undefined) return; // malformed entry — skip rather than guess
    out.push({
      index,
      type,
      value: stringProp(el, "value", sf),
      label: stringProp(el, "label", sf),
      qrImage: stringProp(el, "qr_image", sf),
    });
  });
  return out;
}

function defaultLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/** Replaces an existing qr_image value in place, or inserts qr_image (and
 * label, if that's also absent) into the platform's object literal. Throws
 * if `index` doesn't name an existing object-literal element. */
export function writeContactPlatformQrImage(source: string, index: number, newPath: string): string {
  const found = findPlatformsArray(source);
  if (found === undefined) throw new Error("no contact.platforms array found in config source");
  const { sf, arr } = found;
  const el = arr.elements[index];
  if (el === undefined) {
    throw new Error(`contact.platforms[${index}] does not exist`);
  }
  if (!ts.isObjectLiteralExpression(el)) {
    throw new Error(`contact.platforms[${index}] is not an object literal`);
  }

  const qrImageProp = findObjectProperty(el, "qr_image", sf);
  if (qrImageProp !== undefined && ts.isStringLiteral(qrImageProp.initializer)) {
    const start = qrImageProp.initializer.getStart(sf);
    const end = qrImageProp.initializer.getEnd();
    return source.slice(0, start) + JSON.stringify(newPath) + source.slice(end);
  }

  // No qr_image property yet: insert it (and label, if that's also absent)
  // right before the element's closing brace — a property insertion into an
  // object literal that already exists, never a new array element.
  const type = stringProp(el, "type", sf) ?? "contact";
  const hasLabel = findObjectProperty(el, "label", sf) !== undefined;
  const insertions = [`qr_image: ${JSON.stringify(newPath)}`];
  if (!hasLabel) insertions.push(`label: ${JSON.stringify(defaultLabel(type))}`);

  const closeBrace = el.getEnd() - 1;
  const needsComma = el.properties.length > 0;
  const insertText = `${needsComma ? ", " : ""}${insertions.join(", ")}`;
  return source.slice(0, closeBrace) + insertText + source.slice(closeBrace);
}
