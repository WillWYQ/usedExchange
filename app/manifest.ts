import type { MetadataRoute } from "next";
import { siteConfig } from "@/content/config";

// Next.js file-convention route — emitted as a static manifest.webmanifest
// at build time. No service worker; this only makes the site installable
// (Add to Home Screen) with a proper name/icon/theme, it doesn't add offline
// support.
//
// `dynamic = "force-static"` is required under `output: "export"` — without
// it, `next build` fails to collect page data for this route (metadata
// routes default to dynamic; static export needs every route to opt in
// explicitly). See https://nextjs.org/docs/advanced-features/static-html-export
export const dynamic = "force-static";
//
// Icons are pre-rendered PNGs (public/icon-192.png, public/icon-512.png),
// rasterized once from the vector app/icon.svg via sharp (already a project
// dependency — see lib/images/stripMetadata.ts for another use). If
// icon.svg ever changes, regenerate them with:
//   node -e "const sharp=require('sharp'),fs=require('fs');(async()=>{for(const s of [192,512]){await sharp(fs.readFileSync('app/icon.svg'),{density:72*(s/200)}).resize(s,s).png().toFile('public/icon-'+s+'.png');}})();"
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.name,
    short_name: siteConfig.name,
    description: siteConfig.meta.description,
    start_url: "/",
    display: "standalone",
    background_color: "#f8f4ec",
    theme_color: "#f8f4ec",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
