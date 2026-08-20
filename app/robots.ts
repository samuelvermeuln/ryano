import type { MetadataRoute } from "next";

import { getPublicAppUrl } from "@/server/env";

export default function robots(): MetadataRoute.Robots {
  const publicAppUrl = getPublicAppUrl();

  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/_next/static/", "/_next/image/", "/favicon.ico"],
      disallow: ["/app/", "/admin/", "/api/"],
    },
    sitemap: `${publicAppUrl}/sitemap.xml`,
    host: publicAppUrl,
  };
}
