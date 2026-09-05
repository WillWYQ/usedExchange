/**
 * Single source of truth for "is this a safe, URL-stable slug?" — shared by
 * the seller-facing CLI scripts (create-item, mark-sold) and the static-export
 * route generation (generateStaticParams). A folder name that fails this check
 * must never be turned into a static route: `output: 'export'` writes one HTML
 * file per emitted param, and a slug containing spaces, parentheses, or
 * non-ASCII characters produces a file path that won't match the URL Next.js
 * encodes for `<Link>`, resulting in a live 404 with no server to fall back to.
 */
export const SAFE_SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export function isValidSlug(value: string): boolean {
  return SAFE_SLUG_RE.test(value);
}

// Matches Unicode combining diacritical marks (U+0300–U+036F) left behind by
// NFKD decomposition — e.g. "é" → "e" + U+0301. Used only by slugify() below.
const COMBINING_MARKS_RE = /[\u0300-\u036f]/g;

/**
 * Best-effort conversion of an arbitrary, seller-typed string (e.g. an
 * `item.tags` entry) into a candidate URL segment. Unlike category/item
 * folder names — which sellers already type as kebab-case and which this
 * module only ever *validates* — free-text fields like tags are not
 * guaranteed to be slug-safe, so callers that route on them (currently
 * `/tags/{tag}`, see lib/content/loader.ts's `loadTagIndex`) need a way to
 * derive a route segment first.
 *
 * Diacritics are stripped (NFKD-decomposed, then combining marks removed) so
 * e.g. "café" becomes "cafe" rather than being rejected outright; anything
 * else outside [a-z0-9] collapses to a single hyphen. The result is NOT
 * guaranteed to satisfy isValidSlug (e.g. an all-symbol or non-Latin-script
 * input can slugify to "") — callers MUST still check isValidSlug(result)
 * before treating it as a safe static-export route segment.
 */
export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(COMBINING_MARKS_RE, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
