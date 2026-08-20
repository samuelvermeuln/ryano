import type { Metadata } from "next";

import { getPublicAppUrl } from "@/server/env";

type SeoPageOptions = {
  title: string;
  description: string;
  path: string;
};

export function absoluteUrl(path: string) {
  const publicAppUrl = getPublicAppUrl();
  return new URL(path, publicAppUrl).toString();
}

export function buildIndexableMetadata({ title, description, path }: SeoPageOptions): Metadata {
  const url = absoluteUrl(path);

  return {
    title,
    description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      url,
      title,
      description,
      siteName: "RYANO",
      images: [{ url: "/opengraph-image" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/twitter-image"],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
}

export function buildNoIndexMetadata({ title, description, path }: SeoPageOptions): Metadata {
  return {
    title,
    description,
    alternates: {
      canonical: path,
    },
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: {
        index: false,
        follow: false,
        noimageindex: true,
        "max-image-preview": "none",
        "max-snippet": 0,
        "max-video-preview": 0,
      },
    },
  };
}
