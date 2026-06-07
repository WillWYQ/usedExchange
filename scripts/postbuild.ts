import { execSync } from "child_process";
import { siteConfig } from "@/content/config";

if (siteConfig.sitemap.enabled) {
  console.log("[postbuild] generating sitemap + robots.txt via next-sitemap…");
  try {
    execSync("npx next-sitemap --config next-sitemap.config.js", { stdio: "inherit" });
    console.log("[postbuild] sitemap generated.");
  } catch (err) {
    console.error("[postbuild] next-sitemap failed:", err);
    process.exit(1);
  }
} else {
  console.log("[postbuild] sitemap disabled — skipping.");
}
