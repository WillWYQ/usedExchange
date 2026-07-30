import { parse as parseJsonc } from "jsonc-parser";
import { applyFieldEdits } from "./itemEdit";

// Sets status to "sold" and sold_date to `today` on the given item.json text.
// Returns null if the item is already marked sold. Comment preservation and the
// field allowlist now live in itemEdit.ts — see that file for why a parse/
// stringify round trip is not an option here.
export function applyMarkSold(text: string, today: string): string | null {
  const raw = parseJsonc(text) as Record<string, unknown>;
  if (raw["status"] === "sold") return null;

  return applyFieldEdits(text, [
    { path: ["status"], value: "sold" },
    { path: ["sold_date"], value: today },
  ]);
}
