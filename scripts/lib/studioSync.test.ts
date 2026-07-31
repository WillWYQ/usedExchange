import { describe, expect, it, afterEach } from "vitest";
import type { ImageSyncResult } from "./imageSync";
import type { SseEvent } from "./studioApi";
import {
  getSyncRunner,
  isSyncRunning,
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
  setSyncRunner(null);
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

  it("releases the mutex when the consumer abandons the stream", async () => {
    // The seller closes the tab mid-sync: the middleware stops iterating, so
    // the generator's finally block is the only thing that can free the lock.
    const gen = streamImageSync(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return emptyResult();
    });

    await gen.next();
    await gen.return(undefined as never);
    expect(isSyncRunning()).toBe(false);
  });
});
