/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: process.env["NEXT_PUBLIC_SITE_URL"] || "https://your-domain.com",
  generateRobotsTxt: true,
  // Static export writes pages to ./out
  outDir: "./out",
  robotsTxtOptions: {
    policies: [{ userAgent: "*", allow: "/" }],
  },
};
