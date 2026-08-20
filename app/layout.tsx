import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { getPublicAppUrl } from "@/server/env";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const publicAppUrl = getPublicAppUrl();

export const metadata: Metadata = {
  metadataBase: new URL(publicAppUrl),
  applicationName: "RYANO",
  title: {
    default: "RYANO — Seus treinos analisados no WhatsApp",
    template: "%s | RYANO",
  },
  description:
    "Acompanhe corrida, ciclismo, natação e triathlon com relatórios claros de desempenho entregues direto no WhatsApp.",
  referrer: "origin-when-cross-origin",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: publicAppUrl,
    siteName: "RYANO",
    title: "RYANO — Seus treinos analisados no WhatsApp",
    description:
      "Acompanhe corrida, ciclismo, natação e triathlon com relatórios claros de desempenho entregues direto no WhatsApp.",
    images: [{ url: "/opengraph-image" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "RYANO — Seus treinos analisados no WhatsApp",
    description:
      "Acompanhe corrida, ciclismo, natação e triathlon com relatórios claros de desempenho entregues direto no WhatsApp.",
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
