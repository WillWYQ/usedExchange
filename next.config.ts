import type { NextConfig } from "next";
import { siteConfig } from "./content/config";
import { normalizeR2Url } from "./lib/images/normalizeR2Url";

// Allowed remote image hostname patterns for next/image (Vercel mode only).
// Static mode uses plain <img> via AdaptiveImage — no remote patterns needed.
const remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [];

if (siteConfig.imageStorage.provider === "vercel-blob") {
  remotePatterns.push({
    protocol: "https",
    hostname: "*.public.blob.vercel-storage.com",
  });
}

if (siteConfig.imageStorage.provider === "cloudflare-r2") {
  const raw = process.env["CF_R2_PUBLIC_URL"] ?? "https://example.com";
  const r2Url = new URL(normalizeR2Url(raw));
  remotePatterns.push({
    protocol: "https",
    hostname: r2Url.hostname,
  });
}

const nextConfig: NextConfig = {
  ...(siteConfig.deploymentMode === "static" && { output: "export" }),

  images: {
    unoptimized: siteConfig.deploymentMode === "static",
    remotePatterns,
  },

  poweredByHeader: false,
};

export default nextConfig;
