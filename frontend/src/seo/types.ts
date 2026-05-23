export type PageSeo = {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  noindex?: boolean;
  ogType?: "website" | "article";
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
};
