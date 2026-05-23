# SEO deployment checklist (AdapTest)

Technical SEO is built into the frontend (`frontend/src/seo/`, landing pages, `sitemap.xml`, `robots.txt`). **Ranking #1 on Google** also depends on backlinks, content freshness, Core Web Vitals, and competition—you must complete the steps below after each production deploy.

## 1. Build with canonical URL

```bash
cd frontend
echo 'VITE_SITE_URL=https://adaptest.in' >> .env.production
npm ci && npm run build
```

`prebuild` regenerates `public/sitemap.xml` from `VITE_SITE_URL`.

## 2. Verify live files

```bash
curl -sI https://adaptest.in/robots.txt
curl -sI https://adaptest.in/sitemap.xml
curl -s https://adaptest.in/ | head -40
```

## 3. Google Search Console

1. Add property **https://adaptest.in** (and **https://www.adaptest.in** if used).
2. Verify via DNS TXT or nginx HTML file.
3. Submit sitemap: `https://adaptest.in/sitemap.xml`
4. Request indexing for:
   - `/`
   - `/cat-mock-test`
   - `/ssc-mock-test`
   - `/mock-tests`

## 4. Public landing URLs (target keywords)

| URL | Primary keywords |
|-----|------------------|
| `/` | CAT mock test, SSC mock test, adaptive mocks |
| `/cat-mock-test` | CAT mocks, CAT mock test online |
| `/ssc-mock-test` | SSC mock test, SSC CGL mock |
| `/bank-exam-mock-test` | IBPS mock, bank mock test |
| `/mock-tests` | online mock test hub |

## 5. Recommended next steps (off-page)

- Add **1200×630 PNG** at `public/og-image.png` and point `DEFAULT_OG_IMAGE` in `src/seo/site.ts` (social previews prefer PNG).
- Publish blog posts linking to each landing page (e.g. “How to use adaptive CAT mocks”).
- Get coaching institutes to link to `adaptest.in` from their sites.
- Monitor Search Console → **Pages** and **Queries** for “CAT mock”, “SSC mock test”.

## 6. Optional: prerender

For faster crawler snapshots, consider prerendering `/`, `/cat-mock-test`, and `/ssc-mock-test` at build time (e.g. `vite-plugin-prerender`). The SPA already renders full content in the DOM after JS runs.
