import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { handleStudioRequest } from "../scripts/lib/studioApi";

const studioDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(studioDir, "..");

// One port for both the frontend and the API: no CORS, no second process to
// manage, one terminal to close.
function studioApiPlugin(): Plugin {
  return {
    name: "studio-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();

        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          void handleStudioRequest({
            method: req.method ?? "GET",
            url: req.url ?? "",
            body: Buffer.concat(chunks),
            projectRoot,
          })
            .then((result) => {
              res.statusCode = result.status;
              res.setHeader("content-type", "application/json; charset=utf-8");
              res.end(JSON.stringify(result.body));
            })
            .catch((err: unknown) => {
              res.statusCode = 500;
              res.setHeader("content-type", "application/json; charset=utf-8");
              res.end(
                JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
              );
            });
        });
      });
    },
  };
}

export default defineConfig({
  root: studioDir,
  // Local tool: never expose the write/git/CDN surface to the network.
  server: { host: "127.0.0.1", port: 5174 },
  plugins: [react(), studioApiPlugin()],
  resolve: { alias: { "@": projectRoot } },
});
