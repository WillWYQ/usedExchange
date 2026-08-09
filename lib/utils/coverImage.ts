// Single source of truth for "which image is the cover" — used by both the
// site build (lib/content/loader.ts, resolving CDN/local URLs) and Seller
// Studio (scripts/lib/studioApi.ts, resolving bare filenames for its own
// thumbnail route). Keeping the rule in one place means Studio's preview
// can never silently disagree with what the live site shows.
export function pickCoverFilename(filenames: string[]): string | null {
  const coverIdx = filenames.findIndex((f) => /^cover\./i.test(f));
  if (coverIdx !== -1) return filenames[coverIdx] ?? null;
  return filenames[0] ?? null;
}
