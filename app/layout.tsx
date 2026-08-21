import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { getIndexableAppUrl } from "@/server/env";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const indexableAppUrl = getIndexableAppUrl();

export const metadata: Metadata = {
  metadataBase: indexableAppUrl ? new URL(indexableAppUrl) : undefined,
  applicationName: "ryvano",
  title: {
    default: "ryvano — Seus treinos analisados no WhatsApp",
    template: "%s | ryvano",
  },
  description:
    "Acompanhe corrida, ciclismo, natação e triathlon com relatórios claros de desempenho entregues direto no WhatsApp.",
  referrer: "origin-when-cross-origin",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: indexableAppUrl,
    siteName: "ryvano",
    title: "ryvano — Seus treinos analisados no WhatsApp",
    description:
      "Acompanhe corrida, ciclismo, natação e triathlon com relatórios claros de desempenho entregues direto no WhatsApp.",
    images: [{ url: "/opengraph-image" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ryvano — Seus treinos analisados no WhatsApp",
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
