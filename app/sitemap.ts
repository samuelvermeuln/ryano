import type { MetadataRoute } from "next";

import { getPublicAppUrl } from "@/server/env";

const publicRoutes = ["/", "/termos", "/privacidade"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const publicAppUrl = getPublicAppUrl();
  const lastModified = new Date();

  return publicRoutes.map((route, index) => ({
    url: `${publicAppUrl}${route === "/" ? "" : route}`,
    lastModified,
    changeFrequency: index === 0 ? "weekly" : "monthly",
    priority: index === 0 ? 1 : 0.6,
  }));
}
