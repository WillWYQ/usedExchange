// A local, loopback-only HTTP forward proxy that every byte of headless
// Chromium's traffic is routed through (scripts/lib/headlessImport.ts passes
// it to browser.newContext({ proxy })). It is the authoritative SSRF boundary
// for the headless-render path.
//
// WHY A PROXY AND NOT context.route():
//
//   1. route() is blind to redirects. When its handler calls route.continue()
//      and the response is a 3xx, Chromium follows the redirect INTERNALLY --
//      the handler is never invoked again for the target. A single 302 to
//      http://127.0.0.1:<port>/admin therefore walked straight past
//      checkHostnameAllowed, and the internal server's body came back as the
//      rendered HTML. Through a proxy there is no such thing as an "internal"
//      hop: every redirect target is a fresh connection the proxy must approve.
//
//   2. route() cannot pin. Even when its handler approved a hostname, Chromium
//      then did its OWN DNS lookup to decide where to connect -- a rebinding
//      window between the check and the connection. Here the proxy resolves
//      once, via checkHostnameAllowed, and then opens the connection itself to
//      the exact address that was validated. There is no second lookup.
//
//   3. route() never sees WebSocket handshakes at all. Chromium sends ws:// and
//      wss:// to an HTTP proxy as CONNECT, so they land in this module's
//      CONNECT path and get the same hostname check as everything else.
//
// headlessImport.ts keeps its context.route() and context.routeWebSocket()
// layers as defence in depth (and for the asset-blocking bandwidth saving);
// this module is what makes the guarantee.

import * as http from "http";
import * as net from "net";
import { checkHostnameAllowed } from "./ssrfGuard";

export type SsrfSafeProxy = { server: http.Server; port: number };

/** Body returned for a blocked plain-HTTP request. Chromium renders it as the
 *  page/response content, so it deliberately carries no hostname, no resolved
 *  address and no rejection reason -- a page that triggered the block must not
 *  be able to read internal DNS results back out of the error. */
export const PROXY_BLOCKED_MESSAGE = "Blocked by the UsedExchange Studio SSRF guard.";

const PROXY_HOST = "127.0.0.1";
const DEFAULT_HTTP_PORT = 80;
const DEFAULT_CONNECT_PORT = 443;

// RFC 7230 §6.1: these describe a single transport hop and must never be
// forwarded across the proxy in either direction.
const HOP_BY_HOP_HEADERS = [
  "connection",
  "proxy-connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

function stripHopByHop<T extends http.IncomingHttpHeaders | http.OutgoingHttpHeaders>(headers: T): T {
  for (const name of HOP_BY_HOP_HEADERS) {
    delete headers[name];
  }
  return headers;
}

/** `new URL("http://[::1]:80/").hostname` keeps the brackets; net.isIP and the
 *  ssrfGuard range checks want the bare address. */
function unbracket(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

type Target = { hostname: string; port: number; hostHeader: string };

/** Parses a CONNECT request-target, which is authority-form: `host:port`, with
 *  an IPv6 literal bracketed (`[::1]:443`). Empirically confirmed against
 *  Chromium: hostnames arrive unbracketed, IPv6 literals bracketed. */
function parseAuthority(authority: string, defaultPort: number): Target | null {
  const match = /^(?:\[([0-9A-Fa-f:.]+)\]|([^:[\]]+))(?::(\d{1,5}))?$/.exec(authority);
  if (!match) return null;
  const hostname = match[1] ?? match[2] ?? "";
  if (hostname.length === 0) return null;
  const port = match[3] === undefined ? defaultPort : Number(match[3]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { hostname, port, hostHeader: authority };
}

/** A request that reaches a forward proxy carries an absolute-form target
 *  (`GET http://host/path HTTP/1.1`). The Host header is the fallback for the
 *  origin-form a non-proxy-aware client might send. */
function parseRequestTarget(req: http.IncomingMessage): (Target & { path: string }) | null {
  const rawTarget = req.url ?? "";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(rawTarget)) {
    let parsed: URL;
    try {
      parsed = new URL(rawTarget);
    } catch {
      return null;
    }
    // https:// and wss:// reach a forward proxy as CONNECT, never as a request
    // with an absolute target, so anything else here is malformed or hostile.
    if (parsed.protocol !== "http:") return null;
    const hostname = unbracket(parsed.hostname);
    if (hostname.length === 0) return null;
    const port = parsed.port ? Number(parsed.port) : DEFAULT_HTTP_PORT;
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    return {
      hostname,
      port,
      hostHeader: parsed.host,
      path: `${parsed.pathname}${parsed.search}`,
    };
  }
  const hostHeader = req.headers.host;
  if (!hostHeader) return null;
  const authority = parseAuthority(hostHeader, DEFAULT_HTTP_PORT);
  if (!authority) return null;
  return { ...authority, path: rawTarget.startsWith("/") ? rawTarget : `/${rawTarget}` };
}

function respondAndEnd(res: http.ServerResponse, status: number, body: string): void {
  if (res.headersSent || res.writableEnded) return;
  res.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    connection: "close",
  });
  res.end(body);
}

function endSocket(socket: net.Socket, status: number, message: string): void {
  if (socket.destroyed || socket.writableEnded) return;
  socket.end(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`);
}

async function handleConnect(
  req: http.IncomingMessage,
  clientSocket: net.Socket,
  head: Buffer,
): Promise<void> {
  // Attached BEFORE the first await: a client that resets during the hostname
  // check would otherwise emit an unhandled 'error' and take down the process.
  clientSocket.on("error", () => clientSocket.destroy());

  const target = parseAuthority(req.url ?? "", DEFAULT_CONNECT_PORT);
  if (!target) {
    endSocket(clientSocket, 400, "Bad Request");
    return;
  }

  let check: Awaited<ReturnType<typeof checkHostnameAllowed>>;
  try {
    check = await checkHostnameAllowed(target.hostname);
  } catch {
    endSocket(clientSocket, 502, "Bad Gateway");
    return;
  }
  if (!check.allowed) {
    endSocket(clientSocket, 403, "Forbidden");
    return;
  }
  if (clientSocket.destroyed) return;

  // check.address is always a literal IP (checkHostnameAllowed either echoes an
  // IP hostname back or returns a resolved address), and net.connect skips DNS
  // entirely for a literal host -- so this connects to precisely the address
  // that was validated, with no second lookup to rebind.
  const upstream = net.connect({ port: target.port, host: check.address }, () => {
    if (clientSocket.destroyed) {
      upstream.destroy();
      return;
    }
    clientSocket.setNoDelay(true);
    upstream.setNoDelay(true);
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head.length > 0) upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });
  upstream.on("error", () => {
    if (clientSocket.writableEnded || clientSocket.destroyed) return;
    // Nothing has been written to the client yet if the pipe never started.
    endSocket(clientSocket, 502, "Bad Gateway");
    clientSocket.destroy();
  });
  clientSocket.on("error", () => upstream.destroy());
  clientSocket.on("close", () => upstream.destroy());
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const target = parseRequestTarget(req);
  if (!target) {
    respondAndEnd(res, 400, "Malformed proxy request target.");
    req.resume();
    return;
  }

  let check: Awaited<ReturnType<typeof checkHostnameAllowed>>;
  try {
    check = await checkHostnameAllowed(target.hostname);
  } catch {
    respondAndEnd(res, 502, "Hostname check failed.");
    req.resume();
    return;
  }
  if (!check.allowed) {
    respondAndEnd(res, 403, PROXY_BLOCKED_MESSAGE);
    req.resume();
    return;
  }

  const headers = stripHopByHop({ ...req.headers });
  headers.host = target.hostHeader;

  const upstream = http.request(
    {
      host: check.address,
      port: target.port,
      path: target.path,
      method: req.method,
      headers,
      // Same pinning contract as ssrfGuard.fetchUrlSafely: Node must not redo
      // its own lookup, or the address actually connected to could differ from
      // the one checkHostnameAllowed approved.
      lookup: (_hostname, _options, cb) => {
        cb(null, check.address, check.family);
      },
      family: check.family,
    } satisfies http.RequestOptions,
    (upstreamRes) => {
      if (res.writableEnded) {
        upstreamRes.destroy();
        return;
      }
      // Attached before anything below can throw: an 'error' event with no
      // listener is itself an uncaught exception, and this stream is fed by
      // whatever the upstream host chooses to send.
      upstreamRes.on("error", () => {
        upstreamRes.destroy();
        res.destroy();
      });
      const responseHeaders = stripHopByHop({ ...upstreamRes.headers });
      // 3xx responses are handed straight back to Chromium rather than followed
      // here: Chromium then issues the next hop as its own proxied request, so
      // every hop gets its own checkHostnameAllowed call. That is the whole fix.
      //
      // Wrapped because writeHead re-validates values the UPSTREAM chose, and
      // the client parser is more permissive than the server writer: a status
      // line of "HTTP/1.1 099" parses to 99, which ServerResponse rejects with
      // ERR_HTTP_INVALID_STATUS_CODE. That throw is SYNCHRONOUS, raised from
      // inside http.request's own 'response' emit -- an uncaught exception no
      // .catch() on handleRequest's promise can ever see, and an uncaught
      // exception is fatal to the whole Studio process by default.
      try {
        res.writeHead(upstreamRes.statusCode ?? 502, responseHeaders);
        upstreamRes.pipe(res);
      } catch {
        // The response is unrepresentable (or its head is already half
        // written), so there is nothing safe left to send. Fail closed rather
        // than leave Chromium waiting on a response that will never arrive.
        upstreamRes.destroy();
        res.destroy();
      }
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent && !res.writableEnded) {
      respondAndEnd(res, 502, "Upstream request failed.");
      return;
    }
    res.destroy();
  });
  res.on("close", () => upstream.destroy());
  req.on("error", () => upstream.destroy());
  req.pipe(upstream);
}

// Started once and kept for the life of the process, mirroring how
// headlessImport.ts keeps one warm Chromium: the in-flight promise (not just
// the resolved value) is cached, so concurrent cold-cache callers await one
// start instead of racing two servers into existence and orphaning one.
let cachedProxy: SsrfSafeProxy | null = null;
let startInFlight: Promise<SsrfSafeProxy> | null = null;

async function startProxy(): Promise<SsrfSafeProxy> {
  const server = http.createServer();
  // Both handlers own their own failures internally (every await is wrapped,
  // every stream gets an 'error' listener), so these .catch()es should never
  // fire. They exist because the cost of being wrong is not one failed
  // thumbnail: Node terminates the process on an unhandled rejection, and the
  // inputs reaching these handlers -- destination host, request headers,
  // upstream response bytes -- all come from a rendered page and whatever it
  // chooses to talk to. Fail closed instead: no answer, no hanging peer, and
  // above all a Studio session that is still running. Swallowed rather than
  // logged, matching this module's other last-resort handlers below; anything
  // the seller needs to see is already surfaced by the import route itself.
  server.on("request", (req, res) => {
    void handleRequest(req, res).catch(() => {
      res.destroy();
    });
  });
  server.on("connect", (req, socket: net.Socket, head: Buffer) => {
    void handleConnect(req, socket, head).catch(() => {
      socket.destroy();
    });
  });
  // Chromium tunnels ws:// and wss:// with CONNECT (verified against Chromium
  // 1.63), so an Upgrade sent to the proxy itself is unexpected. Forwarding one
  // would open a tunnel this module never validated, so it fails closed.
  server.on("upgrade", (_req, socket: net.Socket) => {
    socket.destroy();
  });
  server.on("clientError", (_err, socket: net.Socket) => {
    socket.destroy();
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => {
      server.removeListener("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(0, PROXY_HOST);
  });

  // Past listen(), a stray socket-level error must never become an unhandled
  // 'error' event on the server.
  server.on("error", () => {});
  server.on("close", () => {
    if (cachedProxy?.server === server) cachedProxy = null;
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("SSRF-safe proxy could not bind an ephemeral port on 127.0.0.1");
  }

  // A helper server should not by itself hold the process open; Studio's own
  // server (or an in-flight render) is what keeps the loop alive.
  server.unref();
  return { server, port: address.port };
}

/**
 * Returns the running local SSRF-pinning forward proxy, starting it on an
 * OS-assigned ephemeral port bound to 127.0.0.1 if it is not already up.
 * Rejects if it cannot be started -- callers MUST fail closed rather than
 * render without it.
 */
export async function getSsrfSafeProxy(): Promise<SsrfSafeProxy> {
  if (cachedProxy && cachedProxy.server.listening) {
    return cachedProxy;
  }
  cachedProxy = null;
  if (!startInFlight) {
    startInFlight = startProxy()
      .then((proxy) => {
        cachedProxy = proxy;
        return proxy;
      })
      .finally(() => {
        startInFlight = null;
      });
  }
  return startInFlight;
}

/** Test-only teardown, mirrors ssrfGuard.ts's __set*ForTests seams. Without it
 *  a listening proxy would outlive the suite that started it. */
export async function __closeSsrfSafeProxyForTests(): Promise<void> {
  const proxy = cachedProxy;
  cachedProxy = null;
  startInFlight = null;
  if (!proxy) return;
  proxy.server.closeAllConnections();
  await new Promise<void>((resolve) => proxy.server.close(() => resolve()));
}
