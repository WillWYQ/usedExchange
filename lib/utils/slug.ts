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
