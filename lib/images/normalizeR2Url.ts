// Ensures an https:// prefix; trims whitespace and trailing slash.
export function normalizeR2Url(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, "");
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}
