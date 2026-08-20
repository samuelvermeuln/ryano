import type { MetadataRoute } from "next";

import { getPublicAppUrl } from "@/server/env";
import { sitemapRoutes } from "@/server/site-discovery";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const publicAppUrl = getPublicAppUrl();
  const lastModified = new Date();

  return sitemapRoutes.map((route) => ({
    url: `${publicAppUrl}${route.path === "/" ? "" : route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
