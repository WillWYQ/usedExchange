// Bounded-concurrency map — the single shared limiter for the whole project.
//
// Both the content loader (lib/content/loader.ts) and the image-sync pipeline
// (scripts/sync-images.ts) walk the content/ tree and open a file descriptor per
// item. A plain `Promise.all(items.map(fn))` fans out *all* of them at once; on a
// large catalogue that can exhaust the process file-descriptor limit and throw
// `EMFILE: too many open files`. Routing both call sites through this helper caps
// the number of in-flight operations so the FD ceiling is never the limit.
//
// No "use client" and no Node-only imports — safe to import from server
// components, the loader, and standalone tsx scripts alike.
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!, index);
    }
  }

  // Spawn at most `limit` workers (and never more than there are items). Guard
  // against a non-positive `limit` so a caller passing 0 doesn't deadlock with
  // zero workers draining a non-empty queue.
  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}
