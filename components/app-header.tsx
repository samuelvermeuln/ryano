"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion } from "motion/react";

import { ThemeToggle, ThemedWordmark } from "@/components/theme-toggle";

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
  showBrand?: boolean;
  compact?: boolean;
};

export function AppHeader({
  tagline,
  navLinks = [],
  action,
  className = "",
  brandHref = "/",
  animate = true,
  showBrand = true,
  compact = false,
}: AppHeaderProps) {
  const header = (
    <header
      style={{ backgroundImage: "var(--app-header-gradient)" }}
      className={`glass sticky top-4 z-30 rounded-[30px] border-white/14 px-4 shadow-[0_18px_44px_rgba(4,78,95,0.18)] sm:px-5 lg:px-4 ${compact ? "py-2.5" : "py-4"} ${className}`}
    >
      <div className={`flex ${compact ? "items-center" : "flex-col gap-4 lg:flex-row lg:items-center"} ${showBrand ? "lg:justify-between" : "justify-between"}`}>
        
          {showBrand && (
            <Link href={brandHref} className="min-w-0">
              <ThemedWordmark compact={compact} />
            </Link>
          )}
          {!showBrand && <p className={`truncate text-sm text-foreground/66 ${compact ? "mt-0" : "mt-1"}`}>{tagline}</p>}
        

        <div className={`flex items-center justify-between gap-3 lg:justify-end ${compact ? "w-full" : ""}`}>
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
          <ThemeToggle compact={compact} />
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
