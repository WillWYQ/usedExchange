// Covers review finding 1: the write endpoint (POST /api/items/bulk-status)
// had no CSRF protection — a `text/plain` cross-origin POST is a CORS "simple"
// request, so it reaches the server with no preflight. checkStudioCsrf is the
// pure guard the Vite middleware (studio/vite.config.ts) runs before handing a
// request to handleStudioRequest; testing it directly here — rather than
// spinning up a real Vite dev server — is the layer that makes this behavior
// unit-testable.
import { describe, expect, it } from "vitest";
import { checkStudioCsrf } from "./csrfGuard";

describe("checkStudioCsrf", () => {
  it("allows GET regardless of headers — Vite's own CORS/allowedHosts checks cover reads", () => {
    expect(
      checkStudioCsrf("GET", { origin: "https://evil.example", host: "127.0.0.1:5174" }),
    ).toBeNull();
  });

  it("allows a same-origin JSON POST", () => {
    expect(
      checkStudioCsrf("POST", {
        origin: "http://127.0.0.1:5174",
        host: "127.0.0.1:5174",
        "content-type": "application/json",
      }),
    ).toBeNull();
  });

  it("allows a JSON POST with no Origin header", () => {
    expect(
      checkStudioCsrf("POST", { host: "127.0.0.1:5174", "content-type": "application/json" }),
    ).toBeNull();
  });

  it("allows a JSON POST with a charset parameter on content-type", () => {
    expect(
      checkStudioCsrf("POST", {
        host: "127.0.0.1:5174",
        "content-type": "application/json; charset=utf-8",
      }),
    ).toBeNull();
  });

  it("rejects a POST with no content-type at all", () => {
    const result = checkStudioCsrf("POST", { host: "127.0.0.1:5174" });
    expect(result).not.toBeNull();
    expect(result?.status).toBe(415);
  });

  it("rejects a POST whose content-type is text/plain (the CORS-simple-request attack)", () => {
    const result = checkStudioCsrf("POST", {
      host: "127.0.0.1:5174",
      "content-type": "text/plain",
    });
    expect(result).not.toBeNull();
    expect(result?.status).toBe(415);
    expect(result?.body.error).toMatch(/application\/json/);
  });

  it("rejects a POST with a cross-origin Origin header even when content-type is JSON", () => {
    const result = checkStudioCsrf("POST", {
      origin: "https://evil.example",
      host: "127.0.0.1:5174",
      "content-type": "application/json",
    });
    expect(result).not.toBeNull();
    expect(result?.status).toBe(403);
  });

  it("allows HEAD regardless of headers, same as GET", () => {
    expect(
      checkStudioCsrf("HEAD", { origin: "https://evil.example", host: "127.0.0.1:5174" }),
    ).toBeNull();
  });

  it("rejects a PUT with a foreign origin — fails closed on unrecognized state-changing methods", () => {
    const result = checkStudioCsrf("PUT", {
      origin: "https://evil.example",
      host: "127.0.0.1:5174",
      "content-type": "application/json",
    });
    expect(result).not.toBeNull();
    expect(result?.status).toBe(403);
  });

  it("rejects a PUT with no content-type at all — the method is no longer exempt by default", () => {
    const result = checkStudioCsrf("PUT", { host: "127.0.0.1:5174" });
    expect(result).not.toBeNull();
    expect(result?.status).toBe(415);
  });

  it("rejects a cross-origin PATCH with a CORS-simple content type", () => {
    const rejection = checkStudioCsrf("PATCH", {
      origin: "https://evil.example",
      host: "127.0.0.1:5174",
      "content-type": "text/plain",
    });
    expect(rejection).not.toBeNull();
    expect(rejection?.status).toBe(415);
  });
});
