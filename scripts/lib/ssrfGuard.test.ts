import * as http from "http";
import type { AddressInfo } from "net";
import * as zlib from "zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SsrfError,
  checkHostnameAllowed,
  fetchUrlSafely,
  isDisallowedAddress,
  __setAddressValidatorForTests,
  __setDnsLookupForTests,
} from "./ssrfGuard";

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve((server.address() as AddressInfo).port);
    });
  });
}

function closeAll(servers: http.Server[]): Promise<void[]> {
  return Promise.all(servers.map((s) => new Promise<void>((r) => s.close(() => r()))));
}

describe("isDisallowedAddress", () => {
  it.each([
    ["0.0.0.0/8", "0.0.0.0"],
    ["10.0.0.0/8", "10.1.2.3"],
    ["100.64.0.0/10 (CGNAT)", "100.64.0.1"],
    ["127.0.0.0/8 (loopback)", "127.0.0.1"],
    ["169.254.0.0/16 (link-local)", "169.254.1.1"],
    ["169.254.169.254 (cloud metadata)", "169.254.169.254"],
    ["172.16.0.0/12", "172.16.0.1"],
    ["172.16.0.0/12 upper bound", "172.31.255.254"],
    ["192.0.0.0/24 (IETF protocol assignments)", "192.0.0.1"],
    ["192.168.0.0/16", "192.168.1.1"],
    ["198.18.0.0/15 (benchmarking)", "198.18.0.1"],
    ["224.0.0.0/4 (multicast)", "224.0.0.1"],
    ["240.0.0.0/4 (reserved)", "240.0.0.1"],
    ["255.255.255.255 (broadcast)", "255.255.255.255"],
  ])("rejects IPv4 %s: %s", (_label, ip) => {
    expect(isDisallowedAddress(ip)).toBe(true);
  });

  it.each([
    ["::1 (loopback)", "::1"],
    [":: (unspecified)", "::"],
    ["fc00::/7 (ULA)", "fc00::1"],
    ["fd00::/8 (ULA)", "fd12:3456:789a::1"],
    ["fe80::/10 (link-local)", "fe80::1"],
    ["ff00::/8 (multicast)", "ff02::1"],
    ["IPv4-mapped IPv6 wrapping metadata IP", "::ffff:169.254.169.254"],
    ["IPv4-mapped IPv6 wrapping private IP", "::ffff:10.0.0.5"],
    ["IPv4-compatible IPv6 wrapping loopback", "::127.0.0.1"],
  ])("rejects IPv6 %s: %s", (_label, ip) => {
    expect(isDisallowedAddress(ip)).toBe(true);
  });

  it.each([
    ["public IPv4", "8.8.8.8"],
    ["public IPv4", "1.1.1.1"],
    ["public IPv4 just below 172.16.0.0/12", "172.15.255.255"],
    ["public IPv6", "2606:4700:4700::1111"],
    ["public IPv6", "2001:4860:4860::8888"],
  ])("allows %s: %s", (_label, ip) => {
    expect(isDisallowedAddress(ip)).toBe(false);
  });

  it("fails closed on garbage input", () => {
    expect(isDisallowedAddress("not-an-ip")).toBe(true);
  });
});

describe("checkHostnameAllowed", () => {
  afterEach(() => {
    __setDnsLookupForTests(null);
  });

  it("returns the resolved address and family when a hostname's only address is allowed", async () => {
    __setDnsLookupForTests(async () => [{ address: "93.184.216.34", family: 4 }]);

    const result = await checkHostnameAllowed("example.com");

    expect(result).toEqual({ allowed: true, address: "93.184.216.34", family: 4 });
  });

  it("rejects when the hostname resolves to a disallowed address", async () => {
    __setDnsLookupForTests(async () => [{ address: "127.0.0.1", family: 4 }]);

    const result = await checkHostnameAllowed("localhost.example");

    expect(result.allowed).toBe(false);
  });

  it("rejects if ANY of several resolved addresses is disallowed, even if the first is fine", async () => {
    __setDnsLookupForTests(async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ]);

    const result = await checkHostnameAllowed("mixed.example");

    expect(result.allowed).toBe(false);
  });

  it("returns the first address when a hostname resolves to multiple allowed addresses", async () => {
    __setDnsLookupForTests(async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "93.184.216.35", family: 4 },
    ]);

    const result = await checkHostnameAllowed("multi.example");

    expect(result).toEqual({ allowed: true, address: "93.184.216.34", family: 4 });
  });

  it("rejects (does not throw) when DNS resolution fails", async () => {
    __setDnsLookupForTests(async () => {
      throw new Error("ENOTFOUND");
    });

    const result = await checkHostnameAllowed("nonexistent.invalid");

    expect(result.allowed).toBe(false);
  });
});

describe("fetchUrlSafely — scheme validation", () => {
  it("rejects file:// with no network attempt", async () => {
    await expect(fetchUrlSafely("file:///etc/passwd", { timeoutMs: 200, maxBytes: 1000 })).rejects.toThrow(
      SsrfError,
    );
  });

  it("rejects ftp://", async () => {
    await expect(
      fetchUrlSafely("ftp://example.com/file", { timeoutMs: 200, maxBytes: 1000 }),
    ).rejects.toThrow(SsrfError);
  });

  it("rejects javascript:", async () => {
    await expect(
      fetchUrlSafely("javascript:alert(1)", { timeoutMs: 200, maxBytes: 1000 }),
    ).rejects.toThrow(SsrfError);
  });

  it("rejects a malformed URL", async () => {
    await expect(fetchUrlSafely("not a url", { timeoutMs: 200, maxBytes: 1000 })).rejects.toThrow(
      SsrfError,
    );
  });
});

describe("fetchUrlSafely — real local server, real address validator", () => {
  it("rejects a real listening server on 127.0.0.1 (loopback)", async () => {
    const server = http.createServer((_req, res) => res.end("hi"));
    const port = await listen(server);
    try {
      await expect(
        fetchUrlSafely(`http://127.0.0.1:${port}/`, { timeoutMs: 500, maxBytes: 1000 }),
      ).rejects.toThrow(SsrfError);
    } finally {
      await closeAll([server]);
    }
  });
});

describe("fetchUrlSafely — DNS-mocked hostname rejection", () => {
  afterEach(() => {
    __setDnsLookupForTests(null);
  });

  it("rejects a hostname resolving to a private address before connecting", async () => {
    __setDnsLookupForTests(async () => [{ address: "10.0.0.5", family: 4 }]);
    await expect(
      fetchUrlSafely("http://internal.example.test/", { timeoutMs: 500, maxBytes: 1000 }),
    ).rejects.toThrow(SsrfError);
  });

  it("rejects a hostname resolving to the cloud metadata address", async () => {
    __setDnsLookupForTests(async () => [{ address: "169.254.169.254", family: 4 }]);
    await expect(
      fetchUrlSafely("http://metadata.example.test/", { timeoutMs: 500, maxBytes: 1000 }),
    ).rejects.toThrow(SsrfError);
  });

  it("rejects a hostname resolving to a mix of public + private addresses entirely", async () => {
    __setDnsLookupForTests(async () => [
      { address: "8.8.8.8", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ]);
    await expect(
      fetchUrlSafely("http://mixed.example.test/", { timeoutMs: 500, maxBytes: 1000 }),
    ).rejects.toThrow(SsrfError);
  });

  it("rejects when DNS resolution itself fails", async () => {
    __setDnsLookupForTests(async () => {
      throw new Error("ENOTFOUND");
    });
    await expect(
      fetchUrlSafely("http://nowhere.example.test/", { timeoutMs: 500, maxBytes: 1000 }),
    ).rejects.toThrow(SsrfError);
  });
});

// The real isDisallowedAddress correctly refuses 127.0.0.1 (proven above), so
// a real listening test server can never be reached through the unmodified
// guard. This override trusts loopback ONLY, falling through to the real
// range checks for every other address — so these tests still exercise real
// HTTP mechanics (redirects, header parsing, body streaming, size cap,
// timeout) end to end against a real server, while a redirect to a
// (DNS-mocked) private address mid-chain is still correctly rejected.
const allowLoopbackOnly = (ip: string): boolean =>
  ip === "127.0.0.1" || ip === "::1" ? false : isDisallowedAddress(ip);

describe("fetchUrlSafely — end-to-end mechanics against a real server (loopback trusted for test reachability)", () => {
  beforeEach(() => {
    __setAddressValidatorForTests(allowLoopbackOnly);
  });
  afterEach(() => {
    __setAddressValidatorForTests(null);
  });

  it("returns bytes, contentType (charset stripped), and finalUrl on a plain 200", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true }));
    });
    const port = await listen(server);
    try {
      const result = await fetchUrlSafely(`http://127.0.0.1:${port}/thing`, {
        timeoutMs: 2000,
        maxBytes: 10_000,
      });
      expect(result.contentType).toBe("application/json");
      expect(result.bytes.toString("utf8")).toBe(JSON.stringify({ ok: true }));
      expect(result.finalUrl).toBe(`http://127.0.0.1:${port}/thing`);
    } finally {
      await closeAll([server]);
    }
  });

  it("returns \"\" contentType when the header is absent", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, {});
      res.end("plain");
    });
    const port = await listen(server);
    try {
      const result = await fetchUrlSafely(`http://127.0.0.1:${port}/`, {
        timeoutMs: 2000,
        maxBytes: 10_000,
      });
      expect(result.contentType).toBe("");
    } finally {
      await closeAll([server]);
    }
  });

  it("follows a redirect chain and reports the final URL", async () => {
    const server = http.createServer((req, res) => {
      if (req.url === "/start") {
        res.writeHead(302, { Location: "/middle" });
        res.end();
      } else if (req.url === "/middle") {
        res.writeHead(302, { Location: "/end" });
        res.end();
      } else if (req.url === "/end") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("landed");
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    const port = await listen(server);
    try {
      const result = await fetchUrlSafely(`http://127.0.0.1:${port}/start`, {
        timeoutMs: 2000,
        maxBytes: 10_000,
      });
      expect(result.bytes.toString("utf8")).toBe("landed");
      expect(result.finalUrl).toBe(`http://127.0.0.1:${port}/end`);
    } finally {
      await closeAll([server]);
    }
  });

  it("throws once maxRedirects is exceeded", async () => {
    const server = http.createServer((req, res) => {
      const n = Number((req.url ?? "/0").slice(1));
      res.writeHead(302, { Location: `/${n + 1}` });
      res.end();
    });
    const port = await listen(server);
    try {
      await expect(
        fetchUrlSafely(`http://127.0.0.1:${port}/0`, {
          timeoutMs: 2000,
          maxBytes: 10_000,
          maxRedirects: 2,
        }),
      ).rejects.toThrow(SsrfError);
    } finally {
      await closeAll([server]);
    }
  });

  it("throws and does not buffer once maxBytes is exceeded", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      const chunk = Buffer.alloc(1024, "a");
      let sent = 0;
      const interval = setInterval(() => {
        if (res.destroyed) {
          clearInterval(interval);
          return;
        }
        res.write(chunk);
        sent += chunk.length;
        if (sent > 100_000) clearInterval(interval);
      }, 1);
    });
    const port = await listen(server);
    try {
      await expect(
        fetchUrlSafely(`http://127.0.0.1:${port}/`, { timeoutMs: 2000, maxBytes: 2000 }),
      ).rejects.toThrow(SsrfError);
    } finally {
      await closeAll([server]);
    }
  });

  it("throws once timeoutMs is exceeded against a stalling server", async () => {
    const server = http.createServer((_req, res) => {
      // never responds
      void res;
    });
    const port = await listen(server);
    try {
      await expect(
        fetchUrlSafely(`http://127.0.0.1:${port}/`, { timeoutMs: 150, maxBytes: 10_000 }),
      ).rejects.toThrow(/timed out/i);
    } finally {
      await closeAll([server]);
    }
  }, 3000);

  it("re-validates the address on every redirect hop and rejects a hop that resolves to a private address", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(302, { Location: "http://internal.example.test/secret" });
      res.end();
    });
    const port = await listen(server);
    __setDnsLookupForTests(async () => [{ address: "10.0.0.5", family: 4 }]);
    try {
      await expect(
        fetchUrlSafely(`http://127.0.0.1:${port}/start`, { timeoutMs: 2000, maxBytes: 10_000 }),
      ).rejects.toThrow(SsrfError);
    } finally {
      __setDnsLookupForTests(null);
      await closeAll([server]);
    }
  });

  it("sends the Referer header when options.referer is provided", async () => {
    let receivedReferer: string | undefined;
    const server = http.createServer((req, res) => {
      receivedReferer = req.headers.referer;
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html></html>");
    });
    const port = await listen(server);
    try {
      await fetchUrlSafely(`http://127.0.0.1:${port}/`, {
        timeoutMs: 2000,
        maxBytes: 10_000,
        referer: "https://seller-pasted-site.example/listing/123",
      });
      expect(receivedReferer).toBe("https://seller-pasted-site.example/listing/123");
    } finally {
      await closeAll([server]);
    }
  });

  it("sends no Referer header when options.referer is omitted", async () => {
    let receivedReferer: string | undefined;
    const server = http.createServer((req, res) => {
      receivedReferer = req.headers.referer;
      res.end("ok");
    });
    const port = await listen(server);
    try {
      await fetchUrlSafely(`http://127.0.0.1:${port}/`, { timeoutMs: 2000, maxBytes: 10_000 });
      expect(receivedReferer).toBeUndefined();
    } finally {
      await closeAll([server]);
    }
  });

  it("transparently decompresses a gzip response", async () => {
    const server = http.createServer((_req, res) => {
      const body = zlib.gzipSync(Buffer.from("hello from gzip"));
      res.writeHead(200, { "Content-Encoding": "gzip" });
      res.end(body);
    });
    const port = await listen(server);
    try {
      const result = await fetchUrlSafely(`http://127.0.0.1:${port}/`, { timeoutMs: 2000, maxBytes: 10_000 });
      expect(result.bytes.toString("utf-8")).toBe("hello from gzip");
    } finally {
      await closeAll([server]);
    }
  });

  it("caps DECOMPRESSED size, not compressed size — rejects a small payload that expands past maxBytes", async () => {
    // 200KB of a single repeated byte compresses to well under 2KB, but
    // decompresses back to 200KB -- bigger than the tiny maxBytes below. If
    // the cap were (wrongly) applied to wire bytes, this would pass.
    const huge = Buffer.alloc(200_000, "a");
    const compressed = zlib.gzipSync(huge);
    expect(compressed.length).toBeLessThan(2_000); // sanity: tiny on the wire

    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Encoding": "gzip" });
      res.end(compressed);
    });
    const port = await listen(server);
    try {
      await expect(
        fetchUrlSafely(`http://127.0.0.1:${port}/`, { timeoutMs: 2000, maxBytes: 10_000 }),
      ).rejects.toThrow(/exceeded maxBytes/);
    } finally {
      await closeAll([server]);
    }
  });

  it("passes an uncompressed response through unchanged (no content-encoding header)", async () => {
    const server = http.createServer((_req, res) => {
      res.end("plain text, no encoding");
    });
    const port = await listen(server);
    try {
      const result = await fetchUrlSafely(`http://127.0.0.1:${port}/`, { timeoutMs: 2000, maxBytes: 10_000 });
      expect(result.bytes.toString("utf-8")).toBe("plain text, no encoding");
    } finally {
      await closeAll([server]);
    }
  });
});
