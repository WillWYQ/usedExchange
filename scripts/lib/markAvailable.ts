import { parse as parseJsonc } from "jsonc-parser";
import { applyFieldEdits } from "./itemEdit";

// Sets status to "available" and clears sold_date on the given item.json text.
// Returns null if the item is already available (mirrors applyMarkSold's
// no-op-if-already-target-state shape in scripts/lib/markSold.ts).
//
// Design call: this resets status to "available" from ANY other state (sold,
// pending, reserved, draft) rather than refusing unless the item is currently
// "sold" — a seller re-listing a draft, or un-reserving a pending item, is a
// legitimate use of "make this available again", not a misuse of the script.
// sold_date is always cleared to `null` (not "" or removed) because
// lib/content/schema.ts's `sold_date` field (nullableDateString) is
// nullable, and scripts/lib/itemTemplate.ts's fresh-item template uses the
// same `null` placeholder — so this keeps an "available" item's sold_date in
// the same shape a never-sold item already has on disk.
export function applyMarkAvailable(text: string): string | null {
  const raw = parseJsonc(text) as Record<string, unknown>;
  if (raw["status"] === "available") return null;

  return applyFieldEdits(text, [
    { path: ["status"], value: "available" },
    { path: ["sold_date"], value: null },
  ]);
}
