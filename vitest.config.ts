import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // tsconfig.json sets "jsx": "preserve" (Next.js owns that transform for the app
  // build); Vitest's esbuild needs an explicit runtime to compile .tsx test files.
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": __dirname,
    },
  },
});
