"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconArrowLeft, IconHome2, IconMapPinOff } from "@tabler/icons-react";
import { motion } from "motion/react";

import { AuroraBackground } from "@/components/aurora-background";
import { ThemedWordmark } from "@/components/theme-toggle";

/**
 * 404 — same brand chrome as the public marketing pages (AuroraBackground +
 * logo), never the framework's bare default page. "Voltar" uses browser
 * history (`router.back()`) per the request; "Ir para o início" is the
 * always-safe fallback for when there's no meaningful history to go back to
 * (direct link, bookmark, shared URL) — 404-page best practice is to never
 * leave the visitor with only a dead end.
 */
export function NotFoundContent() {
  const router = useRouter();

  return (
    <AuroraBackground className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 24, filter: "blur(10px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="glass w-full max-w-lg rounded-[28px] p-8 text-center sm:p-10"
      >
        <Link href="/" className="inline-flex" aria-label="Ryvano — início">
          <ThemedWordmark />
        </Link>

        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="landing-card-icon-shell feature-icon-loop relative mx-auto mt-8 grid h-20 w-20 place-items-center rounded-[24px] border border-white/10 bg-sky-300/10"
        >
          <span className="landing-card-icon-glow feature-icon-pulse absolute inset-1 rounded-[18px] bg-white/8" aria-hidden="true" />
          <IconMapPinOff size={38} stroke={1.7} aria-hidden="true" className="relative z-10 text-sky-300" />
        </motion.div>

        <p className="mt-7 text-xs font-semibold uppercase tracking-[0.22em] text-accent">Erro 404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Página não encontrada</h1>
        <p className="mt-3 text-sm leading-7 text-foreground/68 sm:text-base">
          Sentimos muito! A página que você está procurando não existe, foi movida ou o endereço digitado está incorreto.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => router.back()}
            className="glass-button inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-foreground"
          >
            <IconArrowLeft size={18} stroke={1.9} aria-hidden="true" />
            Voltar
          </button>
          <Link
            href="/"
            className="glass-button-primary inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold"
          >
            <IconHome2 size={18} stroke={1.9} aria-hidden="true" />
            Ir para o início
          </Link>
        </div>
      </motion.div>
    </AuroraBackground>
  );
}
