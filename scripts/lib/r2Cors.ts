// Pure logic for scripts/configure-image-cors.ts, split out so it's testable
// without mocking the AWS SDK (matches the sync-images.ts / imageSync.ts split
// — thin I/O entry point, tested pure core).
//
// Reuses the SDK's own CORSRule type (type-only import — no runtime AWS SDK
// dependency here, so this file stays trivially unit-testable) rather than a
// parallel hand-rolled type, so it can never drift from what
// Get/PutBucketCorsCommand actually accept.
import type { CORSRule } from "@aws-sdk/client-s3";

export type R2CorsRule = CORSRule;

export const FLYER_CORS_RULE_ID = "usedexchange-item-flyer";

/** Strips a trailing slash so it matches R2's exact-origin CORS comparison. */
export function originFromBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

/**
 * Returns true when `rules` already has a rule covering GET requests from
 * `origin` — either an exact match or a "*" wildcard.
 */
export function corsAlreadyAllowsOrigin(rules: R2CorsRule[], origin: string): boolean {
  return rules.some(
    (rule) =>
      (rule.AllowedOrigins ?? []).some((o) => o === origin || o === "*") &&
      (rule.AllowedMethods ?? []).some((m) => m.toUpperCase() === "GET"),
  );
}

/**
 * Appends a GET-only rule for `origin` to `existingRules` without touching or
 * removing any rule already there — a seller's bucket may be shared with
 * other tools, so this must never clobber unrelated CORS configuration.
 * Returns `alreadyPresent: true` (rules unchanged) if `origin` is already
 * covered.
 */
export function buildMergedCorsRules(
  existingRules: R2CorsRule[],
  baseUrl: string,
): { rules: R2CorsRule[]; alreadyPresent: boolean } {
  const origin = originFromBaseUrl(baseUrl);
  if (corsAlreadyAllowsOrigin(existingRules, origin)) {
    return { rules: existingRules, alreadyPresent: true };
  }
  return {
    rules: [
      ...existingRules,
      {
        ID: FLYER_CORS_RULE_ID,
        AllowedOrigins: [origin],
        AllowedMethods: ["GET"],
        AllowedHeaders: ["*"],
      },
    ],
    alreadyPresent: false,
  };
}
