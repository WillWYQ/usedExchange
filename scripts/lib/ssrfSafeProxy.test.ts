import * as http from "http";
import * as net from "net";
import { afterEach, describe, expect, it } from "vitest";

import {
  __setAddressValidatorForTests,
  __setDnsLookupForTests,
} from "./ssrfGuard";
import { __closeSsrfSafeProxyForTests, getSsrfSafeProxy } from "./ssrfSafeProxy";

// These tests drive the proxy over REAL sockets against REAL listening servers.
// The only thing stubbed is ssrfGuard's own DNS / address-validator seam (the
// same seam scripts/lib/ssrfGuard.test.ts uses), because every address a test
// can actually bind is by definition loopback, which the real validator must --
// correctly -- reject. Tests that assert the guard *fires* use the real
// validator so the rejection is proven against a real listening socket.

type TestServer = { server: http.Server; port: number; connections: number; hits: string[] };

const servers: TestServer[] = [];
const sockets: net.Socket[] = [];

function track(server: http.Server): TestServer {
  const entry: TestServer = { server, port: 0, connections: 0, hits: [] };
  server.on("connection", () => {
    entry.connections += 1;
  });
  servers.push(entry);
  return entry;
}

async function startHttpServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
  host = "127.0.0.1",
): Promise<TestServer> {
  const server = http.createServer();
  const entry = track(server);
  server.on("request", (req, res) => {
    entry.hits.push(`${req.method} ${req.url} host=${req.headers.host ?? ""}`);
    handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, host, resolve));
  entry.port = (server.address() as net.AddressInfo).port;
  return entry;
}

/** A raw TCP server that upper-cases whatever it receives -- stands in for the
 *  opaque byte stream a CONNECT tunnel carries (TLS, or a WebSocket frame). */
async function startEchoServer(host = "127.0.0.1"): Promise<TestServer> {
  const server = net.createServer((socket) => {
    socket.on("data", (chunk) => socket.write(chunk.toString().toUpperCase()));
  }) as unknown as http.Server;
  const entry = track(server);
  await new Promise<void>((resolve) => server.listen(0, host, resolve));
  entry.port = (server.address() as net.AddressInfo).port;
  return entry;
}

/** A raw TCP server that writes one fixed, byte-exact HTTP response to every
 *  connection -- for responses a real http.Server would never let a test
 *  produce (here: a status line outside the range ServerResponse accepts). */
async function startRawServer(response: string, host = "127.0.0.1"): Promise<TestServer> {
  const server = net.createServer((socket) => {
    socket.once("data", () => {
      socket.write(response);
      socket.end();
    });
  }) as unknown as http.Server;
  const entry = track(server);
  await new Promise<void>((resolve) => server.listen(0, host, resolve));
  entry.port = (server.address() as net.AddressInfo).port;
  return entry;
}

function openSocket(port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1");
    sockets.push(socket);
    socket.once("connect", () => resolve(socket));
    socket.once("error", reject);
  });
}

/** Reads until the end of an HTTP head (CRLFCRLF), returning the head plus any
 *  bytes that already arrived after it. Resolves with what it has if the peer
 *  closes first, so a hung socket surfaces as a test timeout, not a false pass. */
function readHead(socket: net.Socket): Promise<{ head: string; rest: Buffer }> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("end", onClose);
      socket.off("close", onClose);
      socket.off("error", onError);
    };
    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      const idx = buffer.indexOf("\r\n\r\n");
      if (idx !== -1) {
        cleanup();
        resolve({ head: buffer.subarray(0, idx).toString(), rest: buffer.subarray(idx + 4) });
      }
    };
    const onClose = () => {
      cleanup();
      resolve({ head: buffer.toString(), rest: Buffer.alloc(0) });
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    socket.on("data", onData);
    socket.on("end", onClose);
    socket.on("close", onClose);
    socket.on("error", onError);
  });
}

function readChunk(socket: net.Socket): Promise<string> {
  return new Promise((resolve, reject) => {
    socket.once("data", (chunk: Buffer) => resolve(chunk.toString()));
    socket.once("error", reject);
  });
}

/** Talks to the proxy the way a real HTTP client does: absolute-form request
 *  target when `absolute`, origin-form + Host header otherwise. */
function proxyRequest(
  proxyPort: number,
  target: string,
  hostHeader: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: proxyPort,
        method: "GET",
        path: target,
        headers: { Host: hostHeader, "Proxy-Connection": "keep-alive" },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (d: string) => {
          body += d;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

afterEach(async () => {
  __setDnsLookupForTests(null);
  __setAddressValidatorForTests(null);
  for (const socket of sockets.splice(0)) socket.destroy();
  for (const entry of servers.splice(0)) {
    await new Promise<void>((resolve) => entry.server.close(() => resolve()));
  }
  await __closeSsrfSafeProxyForTests();
});

describe("getSsrfSafeProxy — lifecycle", () => {
  it("listens on an ephemeral port bound to 127.0.0.1 only", async () => {
    const proxy = await getSsrfSafeProxy();

    expect(proxy.port).toBeGreaterThan(0);
    expect(proxy.server.listening).toBe(true);
    const address = proxy.server.address() as net.AddressInfo;
    expect(address.address).toBe("127.0.0.1");
  });

  it("reuses the same server across calls", async () => {
    const first = await getSsrfSafeProxy();
    const second = await getSsrfSafeProxy();

    expect(second.server).toBe(first.server);
    expect(second.port).toBe(first.port);
  });

  it("starts exactly one server when concurrent callers race a cold cache", async () => {
    const [a, b, c] = await Promise.all([
      getSsrfSafeProxy(),
      getSsrfSafeProxy(),
      getSsrfSafeProxy(),
    ]);

    expect(b.server).toBe(a.server);
    expect(c.server).toBe(a.server);
  });

  it("starts a replacement when the cached server is no longer listening", async () => {
    const first = await getSsrfSafeProxy();
    await new Promise<void>((resolve) => first.server.close(() => resolve()));

    const second = await getSsrfSafeProxy();

    expect(second.server).not.toBe(first.server);
    expect(second.server.listening).toBe(true);
  });
});

describe("SSRF-safe proxy — CONNECT tunnelling", () => {
  it("tunnels bytes both ways once the target passes checkHostnameAllowed", async () => {
    __setAddressValidatorForTests(() => false); // nothing disallowed
    const echo = await startEchoServer();
    const proxy = await getSsrfSafeProxy();
    const socket = await openSocket(proxy.port);

    socket.write(`CONNECT 127.0.0.1:${echo.port} HTTP/1.1\r\nHost: 127.0.0.1:${echo.port}\r\n\r\n`);
    const { head } = await readHead(socket);
    expect(head.split("\r\n")[0]).toMatch(/^HTTP\/1\.1 200 /);

    socket.write("ping-through-tunnel");
    await expect(readChunk(socket)).resolves.toBe("PING-THROUGH-TUNNEL");
    expect(echo.connections).toBe(1);
  });

  it("answers 403 and never opens the upstream connection when the target is disallowed", async () => {
    // Real validator: 127.0.0.1 is genuinely rejected, against a real listener.
    const echo = await startEchoServer();
    const proxy = await getSsrfSafeProxy();
    const socket = await openSocket(proxy.port);

    socket.write(`CONNECT 127.0.0.1:${echo.port} HTTP/1.1\r\nHost: 127.0.0.1:${echo.port}\r\n\r\n`);
    const { head } = await readHead(socket);

    expect(head.split("\r\n")[0]).toMatch(/^HTTP\/1\.1 403 /);
    expect(echo.connections).toBe(0);
  });

  it("parses a bracketed IPv6 CONNECT authority instead of mangling it", async () => {
    __setAddressValidatorForTests(() => false);
    const echo = await startEchoServer("::1");
    const proxy = await getSsrfSafeProxy();
    const socket = await openSocket(proxy.port);

    socket.write(`CONNECT [::1]:${echo.port} HTTP/1.1\r\nHost: [::1]:${echo.port}\r\n\r\n`);
    const { head } = await readHead(socket);
    expect(head.split("\r\n")[0]).toMatch(/^HTTP\/1\.1 200 /);

    socket.write("v6");
    await expect(readChunk(socket)).resolves.toBe("V6");
    expect(echo.connections).toBe(1);
  });

  it("rejects an IPv6 CONNECT target that is disallowed", async () => {
    const echo = await startEchoServer("::1");
    const proxy = await getSsrfSafeProxy();
    const socket = await openSocket(proxy.port);

    socket.write(`CONNECT [::1]:${echo.port} HTTP/1.1\r\nHost: [::1]:${echo.port}\r\n\r\n`);
    const { head } = await readHead(socket);

    expect(head.split("\r\n")[0]).toMatch(/^HTTP\/1\.1 403 /);
    expect(echo.connections).toBe(0);
  });

  it("answers 400 and closes the socket for an unparseable CONNECT authority", async () => {
    const proxy = await getSsrfSafeProxy();
    const socket = await openSocket(proxy.port);

    socket.write("CONNECT 127.0.0.1:99999 HTTP/1.1\r\nHost: x\r\n\r\n");
    const { head } = await readHead(socket);

    expect(head.split("\r\n")[0]).toMatch(/^HTTP\/1\.1 400 /);
  });

  it("answers 502 and closes the socket when the hostname check itself throws", async () => {
    __setAddressValidatorForTests(() => {
      throw new Error("validator exploded");
    });
    const proxy = await getSsrfSafeProxy();
    const socket = await openSocket(proxy.port);

    socket.write("CONNECT 127.0.0.1:9 HTTP/1.1\r\nHost: x\r\n\r\n");
    const { head } = await readHead(socket);

    expect(head.split("\r\n")[0]).toMatch(/^HTTP\/1\.1 502 /);
  });
});

describe("SSRF-safe proxy — plain HTTP requests", () => {
  it("forwards an allowed absolute-form request to the pinned address", async () => {
    const upstream = await startHttpServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("upstream-body");
    });
    // pinned.test exists in no DNS anywhere: the request can only succeed if the
    // proxy connects to the address checkHostnameAllowed handed back, and sends
    // the original hostname in the Host header.
    __setDnsLookupForTests(async () => [{ address: "127.0.0.1", family: 4 }]);
    __setAddressValidatorForTests(() => false);
    const proxy = await getSsrfSafeProxy();

    const res = await proxyRequest(
      proxy.port,
      `http://pinned.test:${upstream.port}/asset`,
      `pinned.test:${upstream.port}`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toBe("upstream-body");
    expect(upstream.hits).toEqual([`GET /asset host=pinned.test:${upstream.port}`]);
  });

  it("unbrackets an IPv6 literal target so the guard sees a real address", async () => {
    // new URL("http://[::1]:80/").hostname keeps the brackets, and "[::1]" is
    // not an IP as far as net.isIP is concerned -- so leaving them on sends the
    // guard down its DNS path, where it fails closed and blocks a destination
    // it should have range-checked. Fail-closed is safe but wrong: this proves
    // the address itself is what gets validated.
    const upstream = await startHttpServer((_req, res) => {
      res.writeHead(200);
      res.end("v6-upstream-body");
    }, "::1");
    __setAddressValidatorForTests(() => false);
    const proxy = await getSsrfSafeProxy();

    const res = await proxyRequest(
      proxy.port,
      `http://[::1]:${upstream.port}/v6`,
      `[::1]:${upstream.port}`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toBe("v6-upstream-body");
    expect(upstream.hits).toEqual([`GET /v6 host=[::1]:${upstream.port}`]);
  });

  it("answers 403 and never contacts the upstream when the hostname is disallowed", async () => {
    const upstream = await startHttpServer((_req, res) => {
      res.writeHead(200);
      res.end("SUPER-SECRET-INTERNAL-DATA");
    });
    __setDnsLookupForTests(async () => [{ address: "127.0.0.1", family: 4 }]);
    // Real validator: internal.test resolves to loopback, so it must be rejected.
    const proxy = await getSsrfSafeProxy();

    const res = await proxyRequest(
      proxy.port,
      `http://internal.test:${upstream.port}/admin`,
      `internal.test:${upstream.port}`,
    );

    expect(res.status).toBe(403);
    expect(res.body).not.toContain("SUPER-SECRET-INTERNAL-DATA");
    expect(upstream.connections).toBe(0);
  });

  it("falls back to the Host header when the request target is origin-form", async () => {
    const upstream = await startHttpServer((_req, res) => {
      res.writeHead(200);
      res.end("origin-form-ok");
    });
    __setDnsLookupForTests(async () => [{ address: "127.0.0.1", family: 4 }]);
    __setAddressValidatorForTests(() => false);
    const proxy = await getSsrfSafeProxy();

    const res = await proxyRequest(proxy.port, "/relative", `pinned.test:${upstream.port}`);

    expect(res.status).toBe(200);
    expect(res.body).toBe("origin-form-ok");
    expect(upstream.hits).toEqual([`GET /relative host=pinned.test:${upstream.port}`]);
  });

  it("answers 400 for a non-HTTP request target rather than trying to fetch it", async () => {
    const proxy = await getSsrfSafeProxy();

    const res = await proxyRequest(proxy.port, "ftp://files.example.com/secret", "files.example.com");

    expect(res.status).toBe(400);
  });

  it("hands the upstream status and body straight back without following redirects", async () => {
    const upstream = await startHttpServer((_req, res) => {
      res.writeHead(302, { location: "http://somewhere-else.test/next" });
      res.end();
    });
    __setDnsLookupForTests(async () => [{ address: "127.0.0.1", family: 4 }]);
    __setAddressValidatorForTests(() => false);
    const proxy = await getSsrfSafeProxy();

    const res = await proxyRequest(
      proxy.port,
      `http://pinned.test:${upstream.port}/start`,
      `pinned.test:${upstream.port}`,
    );

    // The 3xx must come back to the client (Chromium) so the next hop arrives
    // as its own proxied request and gets its own checkHostnameAllowed call.
    expect(res.status).toBe(302);
    expect(upstream.hits).toHaveLength(1);
  });

  it("answers 502 when the hostname check itself throws", async () => {
    __setAddressValidatorForTests(() => {
      throw new Error("validator exploded");
    });
    const proxy = await getSsrfSafeProxy();

    const res = await proxyRequest(proxy.port, "http://1.2.3.4/x", "1.2.3.4");

    expect(res.status).toBe(502);
  });
});

// Every input this proxy handles is attacker-influenced: the destination
// host comes from a rendered page's own JavaScript, and the response bytes
// come from whatever that host chooses to send. A throw that escapes a
// handler here is not one failed thumbnail -- Node's default for an uncaught
// exception (and, since Node 15, for an unhandled rejection) is to kill the
// process, which would take down the seller's whole Studio session.
describe("SSRF-safe proxy — fault containment", () => {
  it("survives an upstream status code that ServerResponse.writeHead refuses", async () => {
    // "099" parses as statusCode 99, and res.writeHead(99) throws
    // ERR_HTTP_INVALID_STATUS_CODE -- a SYNCHRONOUS throw from inside
    // http.request's own 'response' callback, so it is an uncaught
    // exception, not a rejection an outer .catch() could ever see.
    const upstream = await startRawServer("HTTP/1.1 099 Weird\r\nContent-Length: 2\r\n\r\nhi");
    __setDnsLookupForTests(async () => [{ address: "127.0.0.1", family: 4 }]);
    __setAddressValidatorForTests(() => false);
    const proxy = await getSsrfSafeProxy();

    const outcome = await Promise.race([
      proxyRequest(proxy.port, `http://pinned.test:${upstream.port}/x`, `pinned.test:${upstream.port}`).then(
        (res) => `status:${res.status}`,
        () => "socket-closed",
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve("hung"), 3000)),
    ]);

    // Either answer is acceptable (the response is unrepresentable, so the
    // client gets nothing useful either way) -- what must never happen is a
    // client left hanging on a half-written response, or a dead proxy.
    expect(outcome).not.toBe("hung");
    expect(proxy.server.listening).toBe(true);
  });

  it("destroys the response instead of crashing when the request handler rejects", async () => {
    const proxy = await getSsrfSafeProxy();
    // A request object whose very first property access throws stands in for
    // any unanticipated failure inside handleRequest: without a .catch() on
    // the call site, the rejected promise it produces is an unhandled
    // rejection, which is fatal by default.
    const req = {
      get url(): string {
        throw new Error("synthetic request-object failure");
      },
      headers: {},
      method: "GET",
      on() {
        return this;
      },
      resume() {},
      pipe() {},
    };
    let destroyed = false;
    const res = {
      headersSent: false,
      writableEnded: false,
      destroy() {
        destroyed = true;
      },
      on() {
        return this;
      },
      writeHead() {
        return this;
      },
      end() {},
    };

    proxy.server.emit(
      "request",
      req as unknown as http.IncomingMessage,
      res as unknown as http.ServerResponse,
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(destroyed).toBe(true);
    expect(proxy.server.listening).toBe(true);
  });

  it("destroys the client socket instead of crashing when the CONNECT handler rejects", async () => {
    const proxy = await getSsrfSafeProxy();
    const req = {
      get url(): string {
        throw new Error("synthetic connect-request failure");
      },
      headers: {},
      method: "CONNECT",
    };
    const socket = {
      destroyed: false,
      writableEnded: false,
      on() {
        return this;
      },
      destroy() {
        this.destroyed = true;
      },
      end() {},
    };

    proxy.server.emit(
      "connect",
      req as unknown as http.IncomingMessage,
      socket as unknown as net.Socket,
      Buffer.alloc(0),
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(socket.destroyed).toBe(true);
    expect(proxy.server.listening).toBe(true);
  });
});
