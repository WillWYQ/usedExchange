/**
 * scripts/configure-image-cors.ts — pnpm configure-image-cors
 *
 * One-time setup for the item-detail "Download Flyer" button (lib/pdf/generateItemFlyer.ts):
 * it fetches each photo's raw bytes from the browser to embed them in the PDF, which — unlike
 * the plain <img> tags used everywhere else on the site — requires the CDN to send CORS headers.
 * This adds a GET-only CORS rule for the site's own baseUrl to the R2 bucket, without touching
 * any other rule already configured there.
 *
 * Manual fallback (same policy, via the Cloudflare dashboard) is documented in
 * docs/setup_instruction.md's "Configure CORS" step; this script exists so most sellers never
 * have to do that by hand.
 */

import {
  S3Client,
  GetBucketCorsCommand,
  PutBucketCorsCommand,
} from "@aws-sdk/client-s3";
import { siteConfig } from "@/content/config";
import { loadDotEnvLocal } from "./lib/loadEnv";
import { buildMergedCorsRules, type R2CorsRule } from "./lib/r2Cors";

loadDotEnvLocal();

function printManualFallback(baseUrl: string): void {
  console.log(`
Add this CORS policy by hand instead:
  Cloudflare Dashboard → R2 → your bucket → Settings → CORS Policy → Add:

[
  {
    "AllowedOrigins": ["${baseUrl}"],
    "AllowedMethods": ["GET"],
    "AllowedHeaders": ["*"]
  }
]

(see docs/setup_instruction.md, "Configure CORS")`);
}

async function main(): Promise<void> {
  if (siteConfig.imageStorage.provider !== "cloudflare-r2") {
    console.log(
      `[configure-image-cors] imageStorage.provider is "${siteConfig.imageStorage.provider}", not "cloudflare-r2" — nothing to configure.`,
    );
    return;
  }

  const accountId = process.env["CF_R2_ACCOUNT_ID"];
  const accessKeyId = process.env["CF_R2_ACCESS_KEY_ID"];
  const secretAccessKey = process.env["CF_R2_SECRET_ACCESS_KEY"];
  const bucket = process.env["CF_R2_BUCKET"];

  const missing = [
    ["CF_R2_ACCOUNT_ID", accountId],
    ["CF_R2_ACCESS_KEY_ID", accessKeyId],
    ["CF_R2_SECRET_ACCESS_KEY", secretAccessKey],
    ["CF_R2_BUCKET", bucket],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    console.error(
      `[configure-image-cors] Missing required environment variables:\n${missing.map((v) => `  - ${v}`).join("\n")}\n\nCopy .env.example to .env.local and fill in your R2 credentials.`,
    );
    process.exit(1);
  }

  const baseUrl = siteConfig.baseUrl;
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
  });

  try {
    let existingRules: R2CorsRule[] = [];
    try {
      const existing = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
      existingRules = (existing.CORSRules ?? []) as R2CorsRule[];
    } catch (err) {
      // No CORS policy configured yet on this bucket — that's the expected
      // starting state for most sellers, not an error.
      if (!(err instanceof Error) || !err.name.includes("NoSuchCORSConfiguration")) throw err;
    }

    const { rules, alreadyPresent } = buildMergedCorsRules(existingRules, baseUrl);
    if (alreadyPresent) {
      console.log(`[configure-image-cors] ${baseUrl} is already allowed — nothing to do.`);
      return;
    }

    await client.send(
      new PutBucketCorsCommand({
        Bucket: bucket,
        CORSConfiguration: { CORSRules: rules },
      }),
    );
    console.log(`[configure-image-cors] Added a GET CORS rule for ${baseUrl} to bucket "${bucket}".`);
    console.log("Item flyer photos should now embed correctly — try downloading one from a live item page.");
  } catch (err) {
    console.error(
      `[configure-image-cors] Could not update the bucket's CORS policy automatically: ${err instanceof Error ? err.message : String(err)}`,
    );
    console.error(
      "This usually means your R2 API token is scoped to object read/write only, without bucket-settings permission.",
    );
    printManualFallback(baseUrl);
    process.exit(1);
  }
}

main();
