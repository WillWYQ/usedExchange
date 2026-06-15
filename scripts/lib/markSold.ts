import { applyEdits, modify, parse as parseJsonc } from "jsonc-parser";

// Sets status to "sold" and sold_date to `today` on the given item.json text.
// item.json is JSONC — it may contain `// options: ...` hints written by
// `pnpm create-item`. Uses targeted edits (modify/applyEdits) instead of a
// full parse/stringify round trip so those comments (and any seller
// formatting) survive. Returns null if the item is already marked sold.
export function applyMarkSold(text: string, today: string): string | null {
  const raw = parseJsonc(text) as Record<string, unknown>;
  if (raw["status"] === "sold") return null;

  const formattingOptions = { tabSize: 2, insertSpaces: true, eol: "\n" };
  let next = applyEdits(
    text,
    modify(text, ["status"], "sold", { formattingOptions }),
  );
  next = applyEdits(
    next,
    modify(next, ["sold_date"], today, { formattingOptions }),
  );
  return next;
}
