import path from "path";
import { createReadStream } from "fs";
import { fileURLToPath } from "url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { handleStudioRequest, isFileResponse, isSseResponse } from "../scripts/lib/studioApi";
import { checkStudioCsrf } from "./csrfGuard";

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

        const csrfRejection = checkStudioCsrf(req.method ?? "GET", {
          origin: req.headers.origin,
          host: req.headers.host,
          "content-type": req.headers["content-type"],
        });
        if (csrfRejection !== null) {
          res.statusCode = csrfRejection.status;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(JSON.stringify(csrfRejection.body));
          return;
        }

        // One photo per request (see the upload route); 32 MB is far above any
        // camera JPEG plus base64's ~33% overhead, and far below anything that
        // would exhaust the dev server.
        const MAX_BODY_BYTES = 32 * 1024 * 1024;
        const chunks: Buffer[] = [];
        let received = 0;
        let aborted = false;

        req.on("data", (chunk: Buffer) => {
          if (aborted) return;
          received += chunk.length;
          if (received > MAX_BODY_BYTES) {
            aborted = true;
            if (!res.headersSent && !res.writableEnded) {
              res.statusCode = 413;
              res.setHeader("content-type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ error: "request body exceeds 32 MB" }));
            }
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });
        // Attaching a "data" listener above puts the stream in flowing mode.
        // If the seller closes the tab mid-request, the request stream emits
        // "error" (e.g. ECONNRESET); an EventEmitter with no "error" listener
        // throws on that event, which would take down the whole dev server.
        req.on("error", (err: Error) => {
          if (!res.writableEnded) {
            res.statusCode = 400;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: err.message }));
          }
        });
        req.on("end", () => {
          if (aborted) return;
          void handleStudioRequest({
            method: req.method ?? "GET",
            url: req.url ?? "",
            body: Buffer.concat(chunks),
            projectRoot,
          })
            .then(async (result) => {
              // The request-error listener above may already have answered if
              // the seller closed the tab mid-request; writing again throws
              // ERR_HTTP_HEADERS_SENT and takes the dev server down with it.
              if (res.headersSent || res.writableEnded) return;

              if (isFileResponse(result)) {
                res.statusCode = result.status;
                res.setHeader("content-type", result.contentType);
                // Photos change whenever the seller re-uploads; never cache.
                res.setHeader("cache-control", "no-store");
                createReadStream(result.file).pipe(res);
                return;
              }

              if (isSseResponse(result)) {
                res.statusCode = result.status;
                res.setHeader("content-type", "text/event-stream");
                res.setHeader("cache-control", "no-store");
                res.setHeader("connection", "keep-alive");
                for await (const evt of result.events) {
                  if (res.writableEnded) break;
                  res.write(`event: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`);
                }
                res.end();
                return;
              }

              res.statusCode = result.status;
              res.setHeader("content-type", "application/json; charset=utf-8");
              res.end(JSON.stringify(result.body));
            })
            .catch((err: unknown) => {
              if (res.headersSent || res.writableEnded) return;
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
