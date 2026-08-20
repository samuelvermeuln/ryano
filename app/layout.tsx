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
  title: {
    default: "RYANO",
    template: "%s | RYANO",
  },
  description:
    "Plataforma para conectar dados esportivos, acompanhar evolução e receber relatórios no WhatsApp.",
  alternates: {
    canonical: "/",
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
