import type { NextConfig } from "next";

import { noIndexExactPaths, privateExactPaths, privatePathPrefixes } from "./server/site-discovery";

const crawlerAllowHeader = "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
const crawlerDenyHeader = "noindex, nofollow, noarchive, nosnippet";
const discoveryCacheHeader = "public, max-age=0, s-maxage=300, stale-while-revalidate=86400";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@resvg/resvg-js"],
  async headers() {
    const privateSources = [...privatePathPrefixes.map((prefix) => `${prefix}/:path*`), ...privateExactPaths];
    const privateExactSourceSet = new Set<string>(privateExactPaths);
    const discoveryFileSet = new Set(["/robots.txt", "/sitemap.xml", "/llms.txt", "/llms-full.txt"]);
    const noIndexSources = noIndexExactPaths.filter(
      (path) => !privateExactSourceSet.has(path) && !discoveryFileSet.has(path),
    );

    return [
      {
        source: "/",
        headers: [
          { key: "X-Robots-Tag", value: crawlerAllowHeader },
          { key: "Cache-Control", value: discoveryCacheHeader },
        ],
      },
      {
        source: "/termos",
        headers: [
          { key: "X-Robots-Tag", value: crawlerAllowHeader },
          { key: "Cache-Control", value: discoveryCacheHeader },
        ],
      },
      {
        source: "/privacidade",
        headers: [
          { key: "X-Robots-Tag", value: crawlerAllowHeader },
          { key: "Cache-Control", value: discoveryCacheHeader },
        ],
      },
      {
        source: "/robots.txt",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, follow" },
          { key: "Cache-Control", value: discoveryCacheHeader },
        ],
      },
      {
        source: "/sitemap.xml",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, follow" },
          { key: "Cache-Control", value: discoveryCacheHeader },
        ],
      },
      {
        source: "/llms.txt",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, follow" },
          { key: "Cache-Control", value: discoveryCacheHeader },
        ],
      },
      {
        source: "/llms-full.txt",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, follow" },
          { key: "Cache-Control", value: discoveryCacheHeader },
        ],
      },
      ...noIndexSources.map((source) => ({
        source,
        headers: [{ key: "X-Robots-Tag", value: crawlerDenyHeader }],
      })),
      ...privateSources.map((source) => ({
        source,
        headers: [{ key: "X-Robots-Tag", value: crawlerDenyHeader }],
      })),
    ];
  },
};

export default nextConfig;
