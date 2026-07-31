// The CDN sync, wrapped for studio: one run at a time, progress delivered as
// server-sent events.
//
// The mutex is not politeness. Two concurrent runs both write
// lib/generated/image-manifest.json and .image-cache/checksums.json, and the
// loser's write wins — which can leave a committed manifest that omits photos
// that were in fact uploaded, or a checksum cache claiming files are current
// when they are not. That damage outlives the session.
//
// The runner is injected rather than imported. scripts/lib/imageSync.ts pulls
// in sharp, and the R2 adapter pulls @aws-sdk/client-s3; importing either here
// would drag both into Vite's config bundle, since studio/vite.config.ts
// imports studioApi.ts which imports this file. scripts/studio.ts runs under
// tsx, resolves them natively, and registers the closure before listen().

import type { ImageSyncProgress, ImageSyncResult } from "./imageSync";
import type { SseEvent } from "./studioApi";

export type SyncRunner = (
  onProgress: (progress: ImageSyncProgress) => void,
) => Promise<ImageSyncResult>;

type SyncState = {
  runner: SyncRunner | null;
  running: boolean;
};

// State lives on globalThis, not in module-scoped `let`s. studio/vite.config.ts
// statically imports studioApi.ts, and this project's `vite` resolves to 8.1.5
// (the 5.4.21 folder under node_modules/.pnpm is only vitest's own private
// dependency, never what `pnpm studio` loads). Vite 8 bundles the config file
// with rolldown; its `externalize-deps` plugin only externalizes bare-specifier
// imports (packages), so every relative import reachable from the config —
// including this file, reached through studioApi.ts — is inlined into the
// bundle. Because this package.json has no "type": "module", the bundled
// config is evaluated through Node's CJS `require.extensions` +
// `Module.prototype._compile`, not by writing and importing a temp .mjs file —
// there is no file on disk to go looking for. The net effect either way: this
// module is compiled into a *second*, independent copy inside Vite's bundled
// config, distinct from the copy scripts/studio.ts resolves natively via tsx.
// Plain module-level variables would silently split into two unsynchronized
// instances: setSyncRunner() called from scripts/studio.ts would mutate the
// tsx copy, while every actual request runs through the Vite-bundled copy's
// getSyncRunner(), which would see null forever. Verified empirically against
// a running server (a runner registered before listen() was still reported as
// unregistered — 503 — on the very next request) and by intercepting
// Module.prototype._compile to dump the bundled config source, which contains
// this file's code with no reference to sharp or @aws-sdk. globalThis is the
// one thing both copies genuinely share: it's the real JS global object for
// the process, untouched by rolldown's per-module bundling (unlike
// import.meta.url, which gets rewritten back to each source file's original
// path even post-bundling — so printing it from both copies misleadingly
// looks identical).
const STATE_KEY = Symbol.for("usedExchange.studioSync.state");

function syncState(): SyncState {
  const g = globalThis as typeof globalThis & { [STATE_KEY]?: SyncState };
  return (g[STATE_KEY] ??= { runner: null, running: false });
}

export function setSyncRunner(next: SyncRunner | null): void {
  syncState().runner = next;
}

export function getSyncRunner(): SyncRunner | null {
  return syncState().runner;
}

export function isSyncRunning(): boolean {
  return syncState().running;
}

/**
 * Test-only: clears both the registered runner and the running flag in one
 * call. A plain `setSyncRunner(null)` in `afterEach` does not reset `running`
 * — if a mutex assertion fails mid-test before its `release()` runs, `running`
 * stays `true` for every test that follows, turning one failure into a
 * cascade that hides the actual cause. Not used by production code.
 */
export function resetSyncStateForTests(): void {
  const s = syncState();
  s.runner = null;
  s.running = false;
}

// Split out so the "error" in state check narrows normally: `settled` is a
// `let` reassigned inside the .then() closures below, and TS's control-flow
// narrowing does not carry a clean discriminated-union type for `in` checks
// on a variable in that shape — passing it across a function-call boundary
// gives the callee a plain, narrowable parameter type instead.
function toFinalEvent(state: { result: ImageSyncResult } | { error: string }): SseEvent {
  if ("error" in state) {
    return { event: "error", data: { error: state.error } };
  }
  return { event: "done", data: state.result };
}

export async function* streamImageSync(run: SyncRunner): AsyncGenerator<SseEvent> {
  syncState().running = true;

  // Progress arrives through a callback while the run is in flight, but a
  // generator can only yield when its consumer asks. Buffer what the callback
  // reports and drain the buffer between polls.
  const pending: ImageSyncProgress[] = [];
  let settled: { result: ImageSyncResult } | { error: string } | null = null;

  // The release is bound to this promise settling, not to the generator's
  // lifetime. It used to live in a `finally` around the loop below, which
  // runs the instant the consumer abandons the stream (the middleware calls
  // iterator.return() on client disconnect) — even while `run()` is still
  // mid-flight writing lib/generated/image-manifest.json and
  // .image-cache/checksums.json. That let a second sync start and overlap the
  // orphaned one, exactly what the mutex exists to prevent (see the header
  // comment). Attaching .finally() to the work itself means the lock is held
  // until the writes are actually done, regardless of whether anyone is
  // still listening.
  const inFlight = run((progress) => {
    pending.push(progress);
  })
    .then(
      (result) => {
        settled = { result };
      },
      (err: unknown) => {
        settled = { error: err instanceof Error ? err.message : String(err) };
      },
    )
    .finally(() => {
      syncState().running = false;
    });

  for (;;) {
    while (pending.length > 0) {
      yield { event: "progress", data: pending.shift() };
    }
    if (settled !== null) break;
    // Hand control back to the event loop so the sync can advance; without
    // this the loop spins without ever letting the callback fire.
    await Promise.race([inFlight, new Promise((r) => setTimeout(r, 50))]);
  }

  while (pending.length > 0) {
    yield { event: "progress", data: pending.shift() };
  }

  yield toFinalEvent(settled);
}
