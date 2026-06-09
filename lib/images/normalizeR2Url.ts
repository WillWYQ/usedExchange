// Normalises a configured R2 public URL to a clean https origin.
//
// FIX Edge L2: the previous `trimmed.startsWith("http")` check let bare values
// like "httptypo.com" slip through unprefixed (later throwing an opaque error in
// `new URL(...)` inside next.config.ts), and silently kept insecure "http://"
// origins despite this helper's "ensure https" contract. We now match a real
// http(s):// scheme and force https, prefixing a scheme-less host.
export function normalizeR2Url(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^http:\/\//i, "https://");
  }
  return `https://${trimmed}`;
}
