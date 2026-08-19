import { describe, expect, it } from "vitest";
import {
  buildMergedCorsRules,
  corsAlreadyAllowsOrigin,
  originFromBaseUrl,
  FLYER_CORS_RULE_ID,
} from "./r2Cors";

describe("originFromBaseUrl", () => {
  it("strips a trailing slash", () => {
    expect(originFromBaseUrl("https://example.com/")).toBe("https://example.com");
  });

  it("leaves a URL with no trailing slash untouched", () => {
    expect(originFromBaseUrl("https://example.com")).toBe("https://example.com");
  });
});

describe("corsAlreadyAllowsOrigin", () => {
  it("returns false for an empty rule set", () => {
    expect(corsAlreadyAllowsOrigin([], "https://example.com")).toBe(false);
  });

  it("returns true for an exact origin + GET match", () => {
    const rules = [{ AllowedOrigins: ["https://example.com"], AllowedMethods: ["GET"] }];
    expect(corsAlreadyAllowsOrigin(rules, "https://example.com")).toBe(true);
  });

  it("returns true for a wildcard origin", () => {
    const rules = [{ AllowedOrigins: ["*"], AllowedMethods: ["GET"] }];
    expect(corsAlreadyAllowsOrigin(rules, "https://example.com")).toBe(true);
  });

  it("returns false when the origin matches but GET is not allowed", () => {
    const rules = [{ AllowedOrigins: ["https://example.com"], AllowedMethods: ["PUT"] }];
    expect(corsAlreadyAllowsOrigin(rules, "https://example.com")).toBe(false);
  });

  it("returns false when GET is allowed but for a different origin", () => {
    const rules = [{ AllowedOrigins: ["https://other.com"], AllowedMethods: ["GET"] }];
    expect(corsAlreadyAllowsOrigin(rules, "https://example.com")).toBe(false);
  });
});

describe("buildMergedCorsRules", () => {
  it("adds a new GET rule when there are no existing rules", () => {
    const { rules, alreadyPresent } = buildMergedCorsRules([], "https://example.com");
    expect(alreadyPresent).toBe(false);
    expect(rules).toEqual([
      {
        ID: FLYER_CORS_RULE_ID,
        AllowedOrigins: ["https://example.com"],
        AllowedMethods: ["GET"],
        AllowedHeaders: ["*"],
      },
    ]);
  });

  it("reports alreadyPresent and leaves rules untouched when already covered", () => {
    const existing = [{ AllowedOrigins: ["https://example.com"], AllowedMethods: ["GET"] }];
    const { rules, alreadyPresent } = buildMergedCorsRules(existing, "https://example.com");
    expect(alreadyPresent).toBe(true);
    expect(rules).toBe(existing);
  });

  it("appends to, rather than replaces, unrelated existing rules", () => {
    const existing = [{ ID: "other-tool", AllowedOrigins: ["https://other.com"], AllowedMethods: ["PUT"] }];
    const { rules } = buildMergedCorsRules(existing, "https://example.com");
    expect(rules).toHaveLength(2);
    expect(rules[0]).toBe(existing[0]);
    expect(rules[1]).toMatchObject({ AllowedOrigins: ["https://example.com"] });
  });

  it("normalizes a trailing slash on baseUrl before comparing and storing", () => {
    const { rules } = buildMergedCorsRules([], "https://example.com/");
    expect(rules[0]?.AllowedOrigins).toEqual(["https://example.com"]);
  });
});
