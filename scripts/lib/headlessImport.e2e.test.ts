import * as http from "http";
import * as net from "net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { launchChromiumOrError } from "./chromiumLauncher";
import { __closeHeadlessBrowserForTests, renderWithHeadlessBrowser } from "./headlessImport";
import { __setAddressValidatorForTests } from "./ssrfGuard";
import { __closeSsrfSafeProxyForTests, PROXY_BLOCKED_MESSAGE } from "./ssrfSafeProxy";

// End-to-end, real Chromium, real sockets, real ssrfGuard. This file exists for
// one finding: context.route() is BLIND to redirect hops. When its handler calls
// route.continue() and the response is a 3xx, Chromium follows the redirect
// internally and the handler is never invoked again for the target -- so a single
// 302 to an internal address walked straight past checkHostnameAllowed and the
// internal server's body came back in renderWithHeadlessBrowser's return value.
// The local SSRF-pinning forward proxy closes that: a redirect hop is just
// another connection through the proxy, and the proxy checks every one.
//
// The only stub is ssrfGuard's address-validator seam, which here allows exactly
// 127.0.0.1 (where the "public" origin server listens) and rejects everything
// else -- including ::1, where the "internal" server listens. Two different
// loopback families is what lets one test have both an allowed origin and a
// forbidden internal target without needing a real public host.

const SECRET = "SUPER-SECRET-INTERNAL-DATA";

let chromiumAvailable = false;
let originPort = 0;
let internalPort = 0;
let internalHits: string[] = [];
let originServer: http.Server;
let internalServer: http.Server;

function listen(server: http.Server, host: string): Promise<number> {
  return new Promise((resolve) =>
    server.listen(0, host, () => resolve((server.address() as net.AddressInfo).port)),
  );
}

beforeAll(async () => {
  const probe = await launchChromiumOrError();
  if ("browser" in probe) {
    chromiumAvailable = true;
    await probe.browser.close();
  }

  internalServer = http.createServer((req, res) => {
    internalHits.push(`${req.method} ${req.url}`);
    res.writeHead(200, { "content-type": "text/html", "access-control-allow-origin": "*" });
    res.end(`<html><body>${SECRET}</body></html>`);
  });
  internalPort = await listen(internalServer, "::1");

  originServer = http.createServer((req, res) => {
    if (req.url === "/redirect") {
      res.writeHead(302, { location: `http://[::1]:${internalPort}/admin` });
      res.end();
      return;
    }
    if (req.url === "/xhr") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(
        `<html><body><div id="out">pending</div><script>` +
          `fetch("http://[::1]:${internalPort}/data").then(r=>r.text())` +
          `.then(t=>{document.getElementById("out").textContent=t})` +
          `.catch(()=>{document.getElementById("out").textContent="blocked"})` +
          `</script></body></html>`,
      );
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<html><body>ORIGIN-PAGE-RENDERED</body></html>");
  });
  originPort = await listen(originServer, "127.0.0.1");
}, 120_000);

afterAll(async () => {
  __setAddressValidatorForTests(null);
  await __closeHeadlessBrowserForTests();
  await __closeSsrfSafeProxyForTests();
  await new Promise<void>((resolve) => originServer.close(() => resolve()));
  await new Promise<void>((resolve) => internalServer.close(() => resolve()));
}, 60_000);

describe("renderWithHeadlessBrowser — real Chromium SSRF containment", () => {
  it(
    "does not leak the body of an internal host reached through a 302 redirect",
    async (ctx) => {
      if (!chromiumAvailable) ctx.skip();
      internalHits = [];
      __setAddressValidatorForTests((ip) => ip !== "127.0.0.1");

      const result = await renderWithHeadlessBrowser(
        `http://127.0.0.1:${originPort}/redirect`,
        { timeoutMs: 15_000 },
      );

      expect(result.available).toBe(true);
      const html = result.available ? result.html : "";
      expect(html).not.toContain(SECRET);
      // Proves the block came from THIS proxy, not from the internal server
      // happening to be unreachable -- without which the assertion above
      // could pass vacuously.
      expect(html).toContain(PROXY_BLOCKED_MESSAGE);
      expect(internalHits).toEqual([]);
    },
    90_000,
  );

  it(
    "control: the same redirect DOES reach the internal host when Chromium is not proxied",
    async (ctx) => {
      if (!chromiumAvailable) ctx.skip();
      internalHits = [];

      // Raw Playwright with the module's own route()/routeWebSocket layers but
      // no proxy -- i.e. the shape of the code before this fix. If this ever
      // stops leaking, the test above has gone vacuous and must be revisited.
      const launch = await launchChromiumOrError();
      if ("error" in launch) throw new Error(launch.error);
      const context = await launch.browser.newContext();
      await context.route("**/*", (route) => route.continue());
      await context.routeWebSocket(/.*/, () => {});
      const page = await context.newPage();
      try {
        await page.goto(`http://127.0.0.1:${originPort}/redirect`, {
          waitUntil: "networkidle",
          timeout: 15_000,
        });
      } catch {
        /* non-fatal, mirrors renderOnce */
      }
      const html = await page.content();
      await context.close();
      await launch.browser.close();

      expect(html).toContain(SECRET);
      expect(internalHits).toEqual(["GET /admin"]);
    },
    90_000,
  );

  it(
    "does not leak the body of an internal host reached through a sub-resource fetch",
    async (ctx) => {
      if (!chromiumAvailable) ctx.skip();
      internalHits = [];
      __setAddressValidatorForTests((ip) => ip !== "127.0.0.1");

      const result = await renderWithHeadlessBrowser(`http://127.0.0.1:${originPort}/xhr`, {
        timeoutMs: 15_000,
      });

      expect(result.available).toBe(true);
      const html = result.available ? result.html : "";
      expect(html).not.toContain(SECRET);
      expect(internalHits).toEqual([]);
    },
    90_000,
  );

  it(
    "still renders an allowed page normally through the proxy",
    async (ctx) => {
      if (!chromiumAvailable) ctx.skip();
      internalHits = [];
      __setAddressValidatorForTests((ip) => ip !== "127.0.0.1");

      const result = await renderWithHeadlessBrowser(`http://127.0.0.1:${originPort}/page`, {
        timeoutMs: 15_000,
      });

      expect(result.available).toBe(true);
      const html = result.available ? result.html : "";
      expect(html).toContain("ORIGIN-PAGE-RENDERED");
      expect(result.available ? result.finalUrl : "").toBe(
        `http://127.0.0.1:${originPort}/page`,
      );
    },
    90_000,
  );
});
