import type { MetadataRoute } from "next";

import { getPublicAppUrl } from "@/server/env";
import { aiCrawlerAgents, llmsRoutes, privateExactPaths, privatePathPrefixes } from "@/server/site-discovery";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const publicAppUrl = getPublicAppUrl();
  const publicAllowPaths = llmsRoutes.map((route) => route.path).concat(["/_next/static/", "/_next/image/", "/favicon.ico"]);
  const privateDisallowPaths = [...privateExactPaths, ...privatePathPrefixes.map((prefix) => `${prefix}/`)];

  return {
    rules: [
      {
        userAgent: "*",
        allow: publicAllowPaths,
        disallow: privateDisallowPaths,
      },
      ...aiCrawlerAgents.map((userAgent) => ({
        userAgent,
        allow: publicAllowPaths,
        disallow: privateDisallowPaths,
      })),
    ],
    sitemap: `${publicAppUrl}/sitemap.xml`,
    host: new URL(publicAppUrl).host,
  };
}
