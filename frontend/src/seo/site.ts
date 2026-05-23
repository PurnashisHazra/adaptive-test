/** Canonical public site URL (no trailing slash). */
export const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, "") || "https://adaptest.in";

export const SITE_NAME = "AdapTest";
export const SITE_TAGLINE = "Adaptive CAT & SSC mock tests with AI-powered question selection";
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.svg`;
export const SUPPORT_EMAIL = "hello@adaptest.in";

export const PUBLIC_SITEMAP_PATHS = [
  "/",
  "/mock-tests",
  "/cat-mock-test",
  "/ssc-mock-test",
  "/bank-exam-mock-test",
  "/auth",
] as const;

export type PublicSitemapPath = (typeof PUBLIC_SITEMAP_PATHS)[number];
