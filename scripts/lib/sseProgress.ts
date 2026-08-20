// Shared "buffer progress, drain on each poll, yield a final event" generator
// shape used by both scripts/lib/studioSync.ts's streamImageSync and
// scripts/lib/studioApi.ts's streamCatalogPdfExport: progress for either
// operation arrives through a plain callback while the real work is in
// flight, but a generator can only yield when its consumer asks it to.
//
// Any operation-specific settle-time work (studioSync.ts's mutex release,
// studioApi.ts's PDF-export token registration) belongs in the `runWork`
// promise chain the caller builds and passes in here, not in this file —
// this generator's own lifetime is not trustworthy for that: studio's Vite
// middleware calls iterator.return?.() the instant an SSE client disconnects,
// which can end this generator before its trailing yield ever runs, while
// the real work keeps going regardless of whether anyone is still listening.

import type { SseEvent } from "./studioApi";

export async function* streamProgressAsSse<TProgress, TSettled>(
  runWork: (onProgress: (progress: TProgress) => void) => Promise<TSettled>,
  onThrow: (err: unknown) => TSettled,
  toFinalEvent: (settled: TSettled) => SseEvent,
): AsyncGenerator<SseEvent> {
  const pending: TProgress[] = [];
  let settled: TSettled | null = null;

  const inFlight = runWork((progress) => {
    pending.push(progress);
  }).then(
    (result) => {
      settled = result;
    },
    (err: unknown) => {
      settled = onThrow(err);
    },
  );

  for (;;) {
    while (pending.length > 0) {
      yield { event: "progress", data: pending.shift() };
    }
    if (settled !== null) break;
    // Hand control back to the event loop so the work can advance; without
    // this the loop spins without ever letting the progress callback fire.
    await Promise.race([inFlight, new Promise((r) => setTimeout(r, 50))]);
  }
  while (pending.length > 0) {
    yield { event: "progress", data: pending.shift() };
  }
  yield toFinalEvent(settled);
}
