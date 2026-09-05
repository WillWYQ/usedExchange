// Pure text transform applied to a source item.json's contents when
// scripts/duplicate.ts copies it into a new item folder. The folder/photo
// copy itself is filesystem I/O and lives in the CLI wrapper — this module
// only decides which fields must change so the copy doesn't inherit
// listing-lifecycle state that belongs to the ORIGINAL item, not the new one.
//
// Fields reset, and why (cross-checked against scripts/lib/itemTemplate.ts's
// fresh-item defaults so a duplicate looks exactly like a freshly scaffolded
// item on every field it touches):
//   - status            -> "draft"   (required by the task; a duplicate must
//                           not go live with the source's old status)
//   - listed_date       -> today     (itemTemplate.ts always stamps a fresh
//                           item with the creation date, not null; keeping
//                           the source's old listed_date would make a brand
//                           new listing immediately look stale)
//   - sold_date         -> null      (itemTemplate.ts's fresh-item default;
//                           a duplicate was never sold)
//   - price_reduced     -> false     (itemTemplate.ts's fresh-item default;
//                           this flag records negotiation history specific
//                           to the SOURCE item's listing lifetime)
//   - previous_lowest_price -> null  (same reasoning as price_reduced —
//                           itemTemplate.ts default; it's a record of a price
//                           cut that happened to the original listing)
//   - min_acceptable_offer  -> null  (same reasoning; itemTemplate.ts default)
//
// `reserved_for` (private buyer info, Iron Rule 4) is stripped outright if
// present, rather than reset to some placeholder: it is never part of the
// editable-field allowlist (see itemFields.ts), so it can't be round-tripped
// through applyFieldEdits, and duplicating it would leak one buyer's private
// note into an unrelated new listing.
import { applyEdits, modify, parse as parseJsonc } from "jsonc-parser";
import { applyFieldEdits } from "./itemEdit";

const FORMATTING_OPTIONS = { tabSize: 2, insertSpaces: true, eol: "\n" };
const PRIVATE_FIELD = "reserved_for";

export function applyDuplicateEdits(text: string, today: string): string {
  let next = text;

  const raw = parseJsonc(next) as Record<string, unknown> | undefined;
  if (raw && Object.prototype.hasOwnProperty.call(raw, PRIVATE_FIELD)) {
    next = applyEdits(
      next,
      modify(next, [PRIVATE_FIELD], undefined, { formattingOptions: FORMATTING_OPTIONS }),
    );
  }

  return applyFieldEdits(next, [
    { path: ["status"], value: "draft" },
    { path: ["listed_date"], value: today },
    { path: ["sold_date"], value: null },
    { path: ["price_reduced"], value: false },
    { path: ["previous_lowest_price"], value: null },
    { path: ["min_acceptable_offer"], value: null },
  ]);
}
