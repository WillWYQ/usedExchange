// Usage: pnpm studio [--port 5200]
// Starts Seller Studio: a local-only dashboard for managing content/.
// Binds 127.0.0.1 only — this server writes files, holds CDN credentials, and
// runs git, so it must never be reachable from the network.

import path from "path";
import { createRequire } from "module";

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

async function main(): Promise<void> {
  assertViteInstalled();

  const port = parsePort(process.argv.slice(2));
  const { createServer } = await import("vite");

  const server = await createServer({
    configFile: path.join(process.cwd(), "studio", "vite.config.ts"),
    server: { host: "127.0.0.1", port },
  });

  await server.listen();
  console.log(
    `\n  Seller Studio  →  http://127.0.0.1:${port}\n` +
      `  Local only — not reachable from your network.\n` +
      `  Press Ctrl+C to stop.\n`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
