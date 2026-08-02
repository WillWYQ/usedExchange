// Usage: pnpm studio [--port 5200]
// Starts Seller Studio: a local-only dashboard for managing content/.
// Binds 127.0.0.1 only — this server writes files, holds CDN credentials, and
// runs git, so it must never be reachable from the network.

import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { loadDotEnvLocal } from "./lib/loadEnv";
import { setSyncRunner } from "./lib/studioSync";
import { syncImagesToCdn } from "./lib/imageSync";
import { siteConfig } from "@/content/config";
import type { ImageStorageAdapter } from "@/lib/images/adapter";

const DEFAULT_PORT = 5174;
const require = createRequire(import.meta.url);

function assertViteInstalled(): void {
  try {
    require.resolve("vite");
  } catch {
    console.error(
      "Error: vite is not installed.\n" +
        "  Seller Studio ships as a dev dependency. Run `pnpm install` first, then `pnpm studio`.",
    );
    process.exit(1);
  }
}

function assertStudioConfigPresent(configFile: string): void {
  if (!fs.existsSync(configFile)) {
    console.error(
      "Error: Seller Studio is not installed in this site.\n" +
        "  studio/vite.config.ts was not found. Run `pnpm update-site` to pull it from the\n" +
        "  template, then `pnpm install`, then `pnpm studio` again.",
    );
    process.exit(1);
  }
}

function parsePort(args: string[]): number {
  const idx = args.indexOf("--port");
  if (idx === -1) return DEFAULT_PORT;

  const port = Number(args[idx + 1]);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    console.error(`Error: --port must be an integer between 1024 and 65535. Got: "${args[idx + 1]}"`);
    process.exit(1);
  }
  return port;
}

/**
 * The adapter for the configured provider. Mirrors createAdapter() in
 * scripts/sync-images.ts, which is private to that CLI; duplicating a
 * three-branch switch is cheaper than a third extraction with one consumer.
 * All three constructors take no arguments; the R2 one throws when any CF_R2_*
 * variable is missing, which is why loadDotEnvLocal() runs first.
 */
async function createAdapter(): Promise<ImageStorageAdapter> {
  const provider = siteConfig.imageStorage.provider;
  if (provider === "cloudflare-r2") {
    const { CloudflareR2Adapter } = await import("@/lib/images/cloudflare-r2");
    return new CloudflareR2Adapter();
  }
  if (provider === "vercel-blob") {
    const { VercelBlobAdapter } = await import("@/lib/images/vercel-blob");
    return new VercelBlobAdapter();
  }
  const { LocalAdapter } = await import("@/lib/images/local");
  return new LocalAdapter();
}

async function main(): Promise<void> {
  assertViteInstalled();

  const configFile = path.join(process.cwd(), "studio", "vite.config.ts");
  assertStudioConfigPresent(configFile);

  const port = parsePort(process.argv.slice(2));
  const { createServer } = await import("vite");

  loadDotEnvLocal();

  const cwd = process.cwd();
  // The adapter is constructed per run, not once at startup: the R2 constructor
  // throws on missing credentials, and that must surface as an "error" event on
  // the seller's progress stream rather than preventing studio from starting at
  // all — they may only want the item table.
  setSyncRunner(async (onProgress) =>
    syncImagesToCdn({
      adapter: await createAdapter(),
      contentItemsDir: path.join(cwd, "content", "items"),
      manifestPath: path.join(cwd, "lib", "generated", "image-manifest.json"),
      checksumsPath: path.join(cwd, ".image-cache", "checksums.json"),
      onProgress,
    }),
  );

  const server = await createServer({
    configFile,
    server: { host: "127.0.0.1", port, strictPort: false },
  });

  await server.listen();

  const resolvedUrl = server.resolvedUrls?.local[0] ?? `http://127.0.0.1:${port}`;
  console.log(
    `\n  Seller Studio  →  ${resolvedUrl}\n` +
      `  Local only — not reachable from your network.\n` +
      `  Press Ctrl+C to stop.\n`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
