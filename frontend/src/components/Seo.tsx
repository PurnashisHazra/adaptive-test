import type { ReactNode } from "react";
import { usePageSeo } from "../seo/usePageSeo";
import type { PageSeo } from "../seo/types";

/** Updates document head (title, meta, canonical, Open Graph, JSON-LD). */
export function Seo({
  seo,
  jsonLd,
  children,
}: {
  seo: PageSeo;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  children?: ReactNode;
}) {
  usePageSeo(seo, jsonLd);
  return children ?? null;
}
