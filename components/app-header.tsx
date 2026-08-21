"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion } from "motion/react";

type HeaderLink = {
  href: string;
  label: string;
  active?: boolean;
};

type AppHeaderProps = {
  tagline: string;
  navLinks?: readonly HeaderLink[];
  action?: ReactNode;
  className?: string;
  brandHref?: string;
  animate?: boolean;
};

export function AppHeader({
  tagline,
  navLinks = [],
  action,
  className = "",
  brandHref = "/",
  animate = true,
}: AppHeaderProps) {
  const header = (
    <header
      className={`glass sticky top-4 z-30 rounded-[30px] border-white/14 bg-[linear-gradient(135deg,oklch(0.42_0.05_220_/_0.68),oklch(0.36_0.05_190_/_0.62),oklch(0.34_0.05_165_/_0.58))] px-5 py-4 shadow-[0_18px_44px_rgba(4,78,95,0.18)] sm:px-6 ${className}`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <Link href={brandHref} className="min-w-0">
          <p className="text-sm font-semibold tracking-[0.24em] text-foreground/88">RYANO</p>
          <p className="mt-1 truncate text-sm text-foreground/66">{tagline}</p>
        </Link>

        <div className="flex items-center justify-between gap-3 lg:justify-end">
          {navLinks.length > 0 ? (
            <nav className="hidden flex-wrap items-center gap-2 text-sm text-foreground/74 lg:flex">
              {navLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-full px-3 py-2 transition ${
                    item.active
                      ? "bg-white/12 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]"
                      : "text-foreground/74 hover:bg-white/6 hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          ) : null}

          {action}
        </div>
      </div>
    </header>
  );

  if (!animate) {
    return header;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {header}
    </motion.div>
  );
}
