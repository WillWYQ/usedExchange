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
          // Guarded the same way the response path is guarded: once the file
          // or SSE branches below start writing, headers can be sent long
          // before writableEnded is true (pipe() flushes headers on its first
          // internal write; the SSE loop flushes on its first res.write()).
          // Checking only writableEnded here would let this listener call
          // res.setHeader() on an already-sent response and throw
          // ERR_HTTP_HEADERS_SENT, crashing the whole dev server.
          if (res.headersSent || res.writableEnded) return;
          res.statusCode = 400;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: err.message }));
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
                const fileStream = createReadStream(result.file);
                fileStream.on("error", (err: NodeJS.ErrnoException) => {
                  // A photo can be deleted between listing and this request
                  // (Task 2 serves thumbnails from disk), so ENOENT here is an
                  // ordinary race, not a bug — a 404 is the right answer, not
                  // a crash. pipe() may have already flushed headers by the
                  // time a *later* read fails, so only try to write a status
                  // if nothing has gone out yet; otherwise the most we can do
                  // is stop the response.
                  if (res.headersSent) {
                    res.destroy();
                    return;
                  }
                  res.statusCode = err.code === "ENOENT" ? 404 : 500;
                  res.setHeader("content-type", "application/json; charset=utf-8");
                  res.end(JSON.stringify({ error: err.message }));
                });
                fileStream.pipe(res);
                return;
              }

              if (isSseResponse(result)) {
                res.statusCode = result.status;
                res.setHeader("content-type", "text/event-stream");
                res.setHeader("cache-control", "no-store");
                res.setHeader("connection", "keep-alive");

                // "close" on the *response* fires reliably when the seller
                // closes the tab or the connection drops mid-sync, which
                // res.writableEnded alone never catches — that only becomes
                // true once the *server* calls res.end(). (Verified against a
                // running server: req.on("close") does not fire on a
                // client-side disconnect in this Vite/Node setup even though
                // req.destroyed flips to true; res.on("close") does — Node's
                // ServerResponse "close" event is documented to cover both
                // normal completion and premature termination of the
                // underlying connection, which is exactly the case here.)
                // Without this, an abandoned request leaves the loop
                // iterating result.events forever, and any resulting write
                // failure (EPIPE) has no handler and takes the dev server
                // down.
                let clientClosed = false;
                const onClientClosed = () => {
                  clientClosed = true;
                };
                res.on("close", onClientClosed);
                res.on("error", onClientClosed);

                // Grabbed explicitly (rather than `for await (… of result.events)`)
                // so `.return()` below is reachable: AsyncIterable's public
                // surface is only `[Symbol.asyncIterator]`, not `return`.
                const iterator = result.events[Symbol.asyncIterator]();
                try {
                  while (!clientClosed && !res.writableEnded) {
                    const { value, done } = await iterator.next();
                    if (done) break;
                    res.write(`event: ${value.event}\ndata: ${JSON.stringify(value.data)}\n\n`);
                  }
                } finally {
                  // Load-bearing when the generator is paused on a long await
                  // between events: "close" only sets a flag the loop checks
                  // between iterations, so calling return() directly is what
                  // actually asks the generator to stop now rather than after
                  // its next yield. This does NOT release the sync mutex —
                  // that is bound via .finally() to the sync work itself in
                  // studioSync.ts's streamImageSync, not to this generator's
                  // lifetime (see the comment there), so an abandoned request
                  // stops driving this loop but the mutex correctly stays
                  // held until the real work on disk actually finishes.
                  await iterator.return?.();
                  res.off("close", onClientClosed);
                  res.off("error", onClientClosed);
                }

                if (!res.writableEnded) res.end();
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
