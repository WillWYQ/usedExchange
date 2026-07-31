import { describe, expect, it, afterEach } from "vitest";
import type { ImageSyncResult } from "./imageSync";
import type { SseEvent } from "./studioApi";
import {
  getSyncRunner,
  isSyncRunning,
  resetSyncStateForTests,
  setSyncRunner,
  streamImageSync,
} from "./studioSync";

function emptyResult(overrides: Partial<ImageSyncResult> = {}): ImageSyncResult {
  return {
    total: 0,
    uploaded: 0,
    skipped: 0,
    stripped: 0,
    purged: 0,
    manifest: {},
    images: [],
    failures: [],
    ...overrides,
  };
}

async function collect(gen: AsyncGenerator<SseEvent>): Promise<SseEvent[]> {
  const events: SseEvent[] = [];
  for await (const evt of gen) events.push(evt);
  return events;
}

afterEach(() => {
  resetSyncStateForTests();
});

describe("the sync runner registry", () => {
  it("starts empty and remembers what is registered", () => {
    expect(getSyncRunner()).toBeNull();
    const runner = async () => emptyResult();
    setSyncRunner(runner);
    expect(getSyncRunner()).toBe(runner);
  });
});

describe("streamImageSync", () => {
  it("streams every progress event and then a done event", async () => {
    const events = await collect(
      streamImageSync(async (onProgress) => {
        onProgress({ type: "scanned", total: 2 });
        onProgress({
          type: "file",
          manifestKey: "a/b/01.png",
          completed: 1,
          total: 2,
          uploaded: true,
        });
        return emptyResult({ total: 2, uploaded: 1, skipped: 1 });
      }),
    );

    expect(events.map((e) => e.event)).toEqual(["progress", "progress", "done"]);
    expect(events[0]?.data).toMatchObject({ type: "scanned", total: 2 });
    expect(events[2]?.data).toMatchObject({ total: 2, uploaded: 1 });
  });

  it("reports a failed sync as an error event rather than throwing", async () => {
    const events = await collect(
      streamImageSync(async () => {
        throw new Error("R2 credentials missing");
      }),
    );

    expect(events.map((e) => e.event)).toEqual(["error"]);
    expect(events[0]?.data).toMatchObject({ error: "R2 credentials missing" });
  });

  it("holds the mutex for the duration and releases it afterwards", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const gen = streamImageSync(async () => {
      await gate;
      return emptyResult();
    });

    expect(isSyncRunning()).toBe(false);
    const first = gen.next();
    await Promise.resolve();
    expect(isSyncRunning()).toBe(true);

    release();
    await first;
    await collect(gen);
    expect(isSyncRunning()).toBe(false);
  });

  it("releases the mutex even when the sync throws", async () => {
    await collect(
      streamImageSync(async () => {
        throw new Error("boom");
      }),
    );
    expect(isSyncRunning()).toBe(false);
  });

  it("keeps the mutex held when the consumer abandons the stream while the sync is still in flight", async () => {
    // The seller closes the tab mid-sync: the middleware calls
    // iterator.return() on client disconnect (studio/vite.config.ts), which
    // must NOT free the lock while syncImagesToCdn is still writing
    // lib/generated/image-manifest.json and .image-cache/checksums.json — a
    // second sync starting from a reopened tab would overlap the orphaned
    // one. The runner below emits one progress event and then blocks on a
    // gate the test controls, so gen.next() resolves while the run is
    // genuinely still in flight (parked on a yield, not on the internal
    // 50ms poll gap) — the position a real sync is in most of the time.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const gen = streamImageSync(async (onProgress) => {
      onProgress({ type: "scanned", total: 1 });
      await gate;
      return emptyResult();
    });

    const { value, done } = await gen.next();
    expect(done).toBe(false);
    expect(value).toMatchObject({ event: "progress" });

    await gen.return(undefined as never);
    // The work has not finished — the gate is still closed — so the lock
    // must still be held even though the stream itself was abandoned.
    expect(isSyncRunning()).toBe(true);

    // Once the write actually completes, the lock releases on its own; no
    // consumer needs to still be listening for that to happen.
    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(isSyncRunning()).toBe(false);
  });
});
