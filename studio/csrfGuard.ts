// The write endpoint (POST /api/items/bulk-status, and every POST route Part 2
// adds behind R2 credentials and git) is reachable from any page the seller's
// browser has open while studio is running: content-type: text/plain is a CORS
// "simple" request, so the browser sends it with no preflight, and the server
// would process it before ever checking who asked. Two independent checks close
// that hole:
//   1. Require content-type: application/json. Browsers refuse to let script set
//      that content-type on a simple request, so this alone forces a preflight —
//      which Vite already declines to answer for a foreign Origin.
//   2. If an Origin header is present, it must match this server's own origin.
//      Real cross-origin requests always carry a browser-set Origin that page
//      script cannot forge, so this is a second, independent line of defense.
// GET is unaffected: Vite's own CORS and allowedHosts checks already cover reads
// (see studio task-4-6 review finding 1), so only state-changing POSTs are
// checked here.
//
// Kept in its own module (not inline in vite.config.ts) so it is unit-testable:
// Vitest's default excludes skip any file named `*.config.*`, which a
// `vite.config.test.ts` would collide with.

type HeaderLike = string | string[] | undefined;

function firstHeader(value: HeaderLike): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function checkStudioCsrf(
  method: string,
  headers: { origin?: HeaderLike; host?: HeaderLike; "content-type"?: HeaderLike },
): { status: number; body: { error: string } } | null {
  if (method !== "POST") return null;

  const contentType = firstHeader(headers["content-type"]);
  if (contentType === undefined || !contentType.toLowerCase().startsWith("application/json")) {
    return { status: 415, body: { error: "content-type must be application/json" } };
  }

  const origin = firstHeader(headers.origin);
  const host = firstHeader(headers.host);
  if (origin !== undefined && origin !== `http://${host}`) {
    return { status: 403, body: { error: "cross-origin request rejected" } };
  }

  return null;
}
