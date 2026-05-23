#!/usr/bin/env node
/**
 * Writes public/sitemap.xml from PUBLIC_SITEMAP_PATHS.
 * Set VITE_SITE_URL before build (default https://adaptest.in).
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteUrl = (process.env.VITE_SITE_URL || "https://adaptest.in").replace(/\/$/, "");

const paths = [
  { loc: "/", changefreq: "daily", priority: "1.0" },
  { loc: "/mock-tests", changefreq: "weekly", priority: "0.9" },
  { loc: "/cat-mock-test", changefreq: "weekly", priority: "0.9" },
  { loc: "/ssc-mock-test", changefreq: "weekly", priority: "0.9" },
  { loc: "/bank-exam-mock-test", changefreq: "weekly", priority: "0.85" },
  { loc: "/auth", changefreq: "monthly", priority: "0.5" },
];

const lastmod = new Date().toISOString().slice(0, 10);

const urls = paths
  .map(
    (p) => `  <url>
    <loc>${siteUrl}${p.loc === "/" ? "/" : p.loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`,
  )
  .join("\n");

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

const out = join(__dirname, "..", "public", "sitemap.xml");
writeFileSync(out, xml, "utf8");
console.log(`Wrote ${out} (${paths.length} URLs → ${siteUrl})`);
