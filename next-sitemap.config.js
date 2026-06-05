/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: process.env["NEXT_PUBLIC_SITE_URL"] || "https://your-domain.com",
  generateRobotsTxt: true,
  outDir: "./out",
};
