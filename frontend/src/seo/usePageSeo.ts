import { useEffect } from "react";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "./site";
import { breadcrumbJsonLd, organizationJsonLd, webSiteJsonLd } from "./jsonLd";
import type { PageSeo } from "./types";

const JSON_LD_ID = "adaptest-jsonld";

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function setJsonLd(blocks: Record<string, unknown>[]) {
  let el = document.getElementById(JSON_LD_ID) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement("script");
    el.id = JSON_LD_ID;
    el.type = "application/ld+json";
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(blocks.length === 1 ? blocks[0] : blocks);
}

export function usePageSeo(seo: PageSeo, extraJsonLd?: Record<string, unknown> | Record<string, unknown>[]) {
  useEffect(() => {
    const canonical = `${SITE_URL}${seo.path === "/" ? "" : seo.path}`;
    const title = seo.title.includes(SITE_NAME) ? seo.title : `${seo.title} | ${SITE_NAME}`;
    const keywords = seo.keywords?.join(", ");

    document.title = title;
    upsertMeta("name", "description", seo.description);
    if (keywords) upsertMeta("name", "keywords", keywords);
    upsertMeta("name", "robots", seo.noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large");
    upsertMeta("name", "author", SITE_NAME);
    upsertMeta("name", "application-name", SITE_NAME);

    upsertLink("canonical", canonical);

    upsertMeta("property", "og:site_name", SITE_NAME);
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", seo.description);
    upsertMeta("property", "og:url", canonical);
    upsertMeta("property", "og:type", seo.ogType ?? "website");
    upsertMeta("property", "og:locale", "en_IN");
    upsertMeta("property", "og:image", DEFAULT_OG_IMAGE);

    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", seo.description);
    upsertMeta("name", "twitter:image", DEFAULT_OG_IMAGE);

    const baseLd: Record<string, unknown>[] = [organizationJsonLd(), webSiteJsonLd()];
    if (seo.path !== "/") {
      baseLd.push(
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: seo.title.split("—")[0]?.trim() || seo.title, path: seo.path },
        ]),
      );
    }
    const extras = extraJsonLd
      ? Array.isArray(extraJsonLd)
        ? extraJsonLd
        : [extraJsonLd]
      : seo.jsonLd
        ? Array.isArray(seo.jsonLd)
          ? seo.jsonLd
          : [seo.jsonLd]
        : [];
    setJsonLd([...baseLd, ...extras]);

    return () => {
      /* keep last route's tags; next navigation overwrites */
    };
  }, [seo, extraJsonLd]);
}
