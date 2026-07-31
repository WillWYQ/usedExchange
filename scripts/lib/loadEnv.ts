// tsx does not load .env.local automatically. Both `pnpm upload-images` and
// `pnpm studio` need CF_R2_* in the environment before an adapter is
// constructed, so the parser lives here rather than in either entry point.

import fs from "fs";
import path from "path";

/** Populate process.env from .env.local. Existing values always win. */
export function loadDotEnvLocal(cwd: string = process.cwd()): void {
  const envPath = path.join(cwd, ".env.local");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line
      .slice(eqIdx + 1)
      .trim()
      .replace(/^(["'])(.*)\1$/, "$2");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
