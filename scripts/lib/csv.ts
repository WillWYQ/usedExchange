// Shared CSV serialisation, extracted from scripts/export-facebook.ts so
// pnpm export-csv doesn't reimplement quoting rules — one escaping
// implementation used by both CSV-producing scripts.

/** Quotes a cell only when it contains a comma, quote, or newline; doubles
 *  any embedded quotes (standard RFC 4180 escaping). */
export function csvCell(value: string): string {
  const s = String(value).replace(/"/g, '""');
  return /[,"\n\r]/.test(s) ? `"${s}"` : s;
}

/** CRLF row separator, matching Excel/Facebook's expected CSV line endings. */
export function toCsvString(headers: string[], rows: string[][]): string {
  return [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\r\n");
}
