import * as dns from "dns/promises";
import * as http from "http";
import * as https from "https";
import * as net from "net";
import type { LookupAddress } from "dns";

export class SsrfError extends Error {}

export type SafeFetchOptions = {
  timeoutMs: number;
  maxBytes: number;
  maxRedirects?: number;
  userAgent?: string;
};

export type SafeFetchResult = {
  bytes: Buffer;
  contentType: string;
  finalUrl: string;
};

const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_USER_AGENT = "UsedExchangeStudio/1.0 (+local seller tool)";

// Injection seam for tests only — production code always goes through the
// real dns/promises.lookup. Keeps fetchUrlSafely's public signature exactly
// as specified while letting tests force deterministic (non-real-DNS)
// hostname resolutions.
export type DnsLookupFn = (
  hostname: string,
) => Promise<Array<{ address: string; family: number }>>;

let dnsLookupImpl: DnsLookupFn = async (hostname) => {
  const results = (await dns.lookup(hostname, { all: true, verbatim: true })) as LookupAddress[];
  return results.map((r) => ({ address: r.address, family: r.family }));
};

/** Test-only hook — swaps the DNS resolution function. Pass null to restore the real one. */
export function __setDnsLookupForTests(fn: DnsLookupFn | null): void {
  dnsLookupImpl =
    fn ??
    (async (hostname) => {
      const results = (await dns.lookup(hostname, {
        all: true,
        verbatim: true,
      })) as LookupAddress[];
      return results.map((r) => ({ address: r.address, family: r.family }));
    });
}

// Injection seam for tests only, separate from the DNS seam above: it lets an
// end-to-end test exercise the real HTTP mechanics (redirects, body-size cap,
// timeout, header parsing) against a real 127.0.0.1 test server, which real
// isDisallowedAddress logic would otherwise always — correctly — reject. The
// loopback-rejection test itself uses the real (default) validator so the
// guard is still proven to fire against a real listening socket.
let addressValidatorImpl: (ip: string) => boolean = isDisallowedAddress;

/** Test-only hook — swaps the per-address allow/deny check. Pass null to restore the real one. */
export function __setAddressValidatorForTests(fn: ((ip: string) => boolean) | null): void {
  addressValidatorImpl = fn ?? isDisallowedAddress;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = (value << 8) | n;
  }
  return value >>> 0;
}

function inIpv4Range(ip: number, base: string, prefix: number): boolean {
  const baseInt = ipv4ToInt(base);
  if (baseInt === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ip & mask) === (baseInt & mask);
}

function isDisallowedIpv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  if (value === null) return true; // unparseable — fail closed
  if (value === 0xffffffff) return true; // 255.255.255.255
  const ranges: Array<[string, number]> = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ];
  return ranges.some(([base, prefix]) => inIpv4Range(value, base, prefix));
}

/** Expands a normalized IPv6 address (from net.isIPv6-validated input) to a 128-bit BigInt. */
function ipv6ToBigInt(ip: string): bigint | null {
  if (!net.isIPv6(ip)) return null;
  // Strip zone id (e.g. fe80::1%eth0) — irrelevant to range checks.
  const withoutZone = ip.split("%")[0]!;
  let head = withoutZone;
  let tail = "";
  if (withoutZone.includes("::")) {
    const [h, t] = withoutZone.split("::");
    head = h ?? "";
    tail = t ?? "";
  }
  const headGroups = head.length ? head.split(":") : [];
  const tailGroups = tail.length ? tail.split(":") : [];

  // A group may itself be an embedded IPv4 (e.g. "::ffff:1.2.3.4" -> last
  // "group" is "1.2.3.4"), which expands to two hex groups.
  function expandGroup(groups: string[]): string[] {
    const out: string[] = [];
    for (const g of groups) {
      if (g.includes(".")) {
        const v4 = ipv4ToInt(g);
        if (v4 === null) return [];
        out.push(((v4 >>> 16) & 0xffff).toString(16));
        out.push((v4 & 0xffff).toString(16));
      } else {
        out.push(g);
      }
    }
    return out;
  }

  const expandedHead = expandGroup(headGroups);
  const expandedTail = expandGroup(tailGroups);
  const missing = 8 - expandedHead.length - expandedTail.length;
  if (missing < 0) return null;
  const fullGroups = [...expandedHead, ...Array(missing).fill("0"), ...expandedTail];
  if (fullGroups.length !== 8) return null;

  let value = 0n;
  for (const g of fullGroups) {
    if (!/^[0-9a-fA-F]{0,4}$/.test(g)) return null;
    value = (value << 16n) | BigInt(parseInt(g || "0", 16));
  }
  return value;
}

/** Extracts the embedded IPv4 from an IPv4-mapped (::ffff:a.b.c.d) or
 * IPv4-compatible (::a.b.c.d, NAT64-ish) IPv6 address, or null if this
 * address doesn't embed an IPv4 address. */
function embeddedIpv4(value: bigint): string | null {
  const top96 = value >> 32n;
  // ::ffff:0:0/96 — IPv4-mapped
  if (top96 === 0xffffn) {
    const v4 = Number(value & 0xffffffffn);
    return [24, 16, 8, 0].map((shift) => (v4 >>> shift) & 0xff).join(".");
  }
  // ::a.b.c.d/96 (IPv4-compatible, excludes ::0 and ::1 which are handled
  // separately as the unspecified/loopback addresses).
  if (top96 === 0n && value > 1n) {
    const v4 = Number(value & 0xffffffffn);
    return [24, 16, 8, 0].map((shift) => (v4 >>> shift) & 0xff).join(".");
  }
  return null;
}

function isDisallowedIpv6(ip: string): boolean {
  const value = ipv6ToBigInt(ip);
  if (value === null) return true; // unparseable — fail closed

  if (value === 0n) return true; // ::
  if (value === 1n) return true; // ::1

  const embedded = embeddedIpv4(value);
  if (embedded !== null) return isDisallowedIpv4(embedded);

  // fc00::/7
  const fc00 = 0xfc000000000000000000000000000000n;
  if ((value & ~((1n << 121n) - 1n)) === fc00) return true;
  // fe80::/10
  const fe80 = 0xfe800000000000000000000000000000n;
  if ((value & ~((1n << 118n) - 1n)) === fe80) return true;
  // ff00::/8
  const ff00 = 0xff000000000000000000000000000000n;
  if ((value & ~((1n << 120n) - 1n)) === ff00) return true;

  return false;
}

export function isDisallowedAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isDisallowedIpv4(ip);
  if (net.isIPv6(ip)) return isDisallowedIpv6(ip);
  return true; // not a literal IP at all — fail closed
}

type PinnedAddress = { address: string; family: 4 | 6 };

export async function checkHostnameAllowed(
  hostname: string,
): Promise<{ allowed: true; address: string; family: 4 | 6 } | { allowed: false; reason: string }> {
  if (net.isIP(hostname)) {
    if (addressValidatorImpl(hostname)) {
      return { allowed: false, reason: `Disallowed address: ${hostname}` };
    }
    return { allowed: true, address: hostname, family: net.isIPv6(hostname) ? 6 : 4 };
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await dnsLookupImpl(hostname);
  } catch (err) {
    return {
      allowed: false,
      reason: `DNS resolution failed for ${hostname}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (addresses.length === 0) {
    return { allowed: false, reason: `DNS resolution returned no addresses for ${hostname}` };
  }
  // A domain that resolves to a mix of public and private addresses is
  // treated as fully untrustworthy -- reject on ANY disallowed hit, even
  // though only the first address below is ever actually used to connect.
  for (const { address } of addresses) {
    if (addressValidatorImpl(address)) {
      return { allowed: false, reason: `Disallowed resolved address for ${hostname}: ${address}` };
    }
  }
  const first = addresses[0]!;
  return { allowed: true, address: first.address, family: first.family === 6 ? 6 : 4 };
}

async function resolveAndValidate(hostname: string): Promise<PinnedAddress> {
  const check = await checkHostnameAllowed(hostname);
  if (!check.allowed) {
    throw new SsrfError(check.reason);
  }
  return { address: check.address, family: check.family };
}

function resolveRedirectUrl(location: string, base: URL): URL {
  try {
    return new URL(location, base);
  } catch {
    throw new SsrfError(`Invalid redirect location: ${location}`);
  }
}

function stripContentType(header: string | undefined): string {
  if (!header) return "";
  const semi = header.indexOf(";");
  const value = semi === -1 ? header : header.slice(0, semi);
  return value.trim().toLowerCase();
}

export async function fetchUrlSafely(
  url: string,
  options: SafeFetchOptions,
): Promise<SafeFetchResult> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SsrfError(`Malformed URL: ${url}`);
  }

  const deadline = Date.now() + options.timeoutMs;
  const controller = new AbortController();
  const overallTimer = setTimeout(() => {
    controller.abort(new Error("timed out"));
  }, options.timeoutMs);

  try {
    let currentUrl = parsed;
    for (let hop = 0; ; hop++) {
      if (currentUrl.protocol !== "http:" && currentUrl.protocol !== "https:") {
        throw new SsrfError(`Disallowed URL scheme: ${currentUrl.protocol}`);
      }
      if (hop > maxRedirects) {
        throw new SsrfError(`Exceeded maxRedirects (${maxRedirects})`);
      }
      if (controller.signal.aborted) {
        throw new Error("Request timed out");
      }

      const pinned = await resolveAndValidate(currentUrl.hostname);

      const result = await new Promise<
        { kind: "final"; result: SafeFetchResult } | { kind: "redirect"; location: string }
      >((resolvePromise, rejectPromise) => {
        const isHttps = currentUrl.protocol === "https:";
        const transport = isHttps ? https : http;
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) {
          rejectPromise(new Error("Request timed out"));
          return;
        }

        const requestOptions: http.RequestOptions & https.RequestOptions = {
          protocol: currentUrl.protocol,
          host: pinned.address,
          hostname: pinned.address,
          port: currentUrl.port
            ? Number(currentUrl.port)
            : isHttps
              ? 443
              : 80,
          path: `${currentUrl.pathname}${currentUrl.search}`,
          method: "GET",
          headers: {
            Host: currentUrl.host,
            "User-Agent": userAgent,
          },
          // Pinning to the already-validated address means Node must not
          // redo its own DNS lookup — that would reopen the TOCTOU /
          // DNS-rebinding gap this whole module exists to close.
          lookup: (_hostname, _opts, cb) => {
            cb(null, pinned.address, pinned.family);
          },
          family: pinned.family,
          signal: controller.signal,
        };
        if (isHttps) {
          requestOptions.servername = currentUrl.hostname;
          requestOptions.rejectUnauthorized = true;
        }

        const req = transport.request(requestOptions, (res) => {
          const status = res.statusCode ?? 0;
          if (status >= 300 && status < 400 && res.headers.location) {
            res.resume(); // discard redirect body
            resolvePromise({ kind: "redirect", location: res.headers.location });
            return;
          }

          const contentType = stripContentType(res.headers["content-type"]);
          const chunks: Buffer[] = [];
          let total = 0;
          let destroyed = false;

          res.on("data", (chunk: Buffer) => {
            if (destroyed) return;
            total += chunk.length;
            if (total > options.maxBytes) {
              destroyed = true;
              res.destroy();
              rejectPromise(new SsrfError(`Response exceeded maxBytes (${options.maxBytes})`));
              return;
            }
            chunks.push(chunk);
          });
          res.on("end", () => {
            if (destroyed) return;
            resolvePromise({
              kind: "final",
              result: {
                bytes: Buffer.concat(chunks),
                contentType,
                finalUrl: currentUrl.toString(),
              },
            });
          });
          res.on("error", (err) => {
            if (destroyed) return;
            rejectPromise(err);
          });
        });

        req.on("error", (err) => {
          if (controller.signal.aborted) {
            rejectPromise(new Error("Request timed out"));
          } else {
            rejectPromise(err);
          }
        });
        req.end();
      });

      if (result.kind === "final") {
        return result.result;
      }
      currentUrl = resolveRedirectUrl(result.location, currentUrl);
    }
  } finally {
    clearTimeout(overallTimer);
  }
}
