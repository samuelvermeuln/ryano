"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBrandWhatsapp } from "@tabler/icons-react";
import { motion, useReducedMotion } from "motion/react";

import { ThemeToggle, ThemedWordmark } from "@/components/theme-toggle";
import { useScrollCollapse } from "@/components/use-scroll-collapse";

// Alias mantido para compatibilidade com o teste existente
// (tests/app-header-scroll-collapse.test.tsx) e com quem já importava esse
// nome diretamente de `@/components/app-header`. A implementação em si vive
// em `@/components/use-scroll-collapse` (compartilhada com o mobile dock).
export const useScrollDirection = useScrollCollapse;

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
  const isAppVariant = compact && !showBrand;
  const pathname = usePathname();
  const scrollCollapsed = useScrollDirection(isAppVariant, { resetKey: pathname });
  const reducedMotion = Boolean(useReducedMotion());

  const verticalPaddingClass = isAppVariant
    ? scrollCollapsed
      ? "py-1 lg:py-2.5"
      : "py-2.5"
    : compact
      ? "py-2.5"
      : "py-4";

  const header = (
    <header
      style={{ backgroundImage: "var(--app-header-gradient)" }}
      className={`app-header-no-anchor glass sticky top-4 z-30 rounded-[30px] border-white/14 shadow-[0_18px_44px_rgba(4,78,95,0.18)] ${className}`}
    >
      <div className={`px-4 sm:px-5 lg:px-4 transition-[padding] duration-300 ease-out ${verticalPaddingClass}`}>
      <div className={`flex ${compact && !showBrand ? "flex-col gap-3 lg:flex-row lg:items-center lg:justify-between" : compact ? "items-center" : "flex-col gap-4 lg:flex-row lg:items-center"} ${showBrand ? "lg:justify-between" : compact ? "" : "justify-between"}`}>
        {showBrand ? (
          <Link href={brandHref} className="min-w-0">
            <ThemedWordmark compact={compact} />
          </Link>
        ) : (
          <motion.div
            className={`flex min-w-0 flex-1 items-center gap-3 lg:max-w-[40rem] ${isAppVariant ? "hidden lg:flex" : ""}`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.span
              className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-500/12 shadow-[0_10px_28px_rgba(37,211,102,0.18)]"
              animate={{ y: [0, -1.5, 0], scale: [1, 1.04, 1] }}
              transition={{ duration: 3.2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
              aria-hidden="true"
            >
              <motion.span
                className="absolute inset-0 rounded-full bg-emerald-400/20 blur-md"
                animate={{ opacity: [0.35, 0.65, 0.35], scale: [0.92, 1.08, 0.92] }}
                transition={{ duration: 3.2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
              />
              <IconBrandWhatsapp size={22} stroke={2} color="#25D366" className="relative z-10" />
            </motion.span>

            <motion.p
              className={`min-w-0 text-sm font-medium leading-5 text-foreground/78 text-pretty ${compact ? "mt-0" : "mt-1"}`}
              initial={{ opacity: 0, clipPath: "inset(0 100% 0 0)" }}
              animate={{ opacity: 1, clipPath: "inset(0 0 0 0)" }}
              transition={{ duration: 0.65, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            >
              {tagline}
            </motion.p>
          </motion.div>
        )}

        <div className={`flex items-center justify-between gap-3 lg:justify-end ${compact ? "w-full lg:w-auto" : ""}`}>
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
          {isAppVariant ? (
            <motion.div
              className="flex items-center gap-3"
              style={{ transformOrigin: "right center" }}
              initial={false}
              animate={reducedMotion ? undefined : { scale: scrollCollapsed ? 0.94 : 1 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <ThemeToggle compact={compact} />
              {action}
            </motion.div>
          ) : (
            <>
              <ThemeToggle compact={compact} />
              {action}
            </>
          )}
        </div>
      </div>
      </div>

      <motion.div
        aria-hidden={!isAppVariant || scrollCollapsed}
        initial={false}
        animate={
          reducedMotion
            ? undefined
            : isAppVariant && !scrollCollapsed
              ? { maxHeight: 56, opacity: 1 }
              : { maxHeight: 0, opacity: 0 }
        }
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className={`overflow-hidden lg:hidden ${isAppVariant ? "" : "hidden"}`}
        style={
          reducedMotion
            ? {
                maxHeight: isAppVariant && !scrollCollapsed ? 56 : 0,
                opacity: isAppVariant && !scrollCollapsed ? 1 : 0,
              }
            : undefined
        }
      >
        <div className="app-header-whatsapp-band flex items-center gap-2 rounded-b-[30px] border-t px-4 py-3">
          <IconBrandWhatsapp size={16} stroke={1.8} className="shrink-0" aria-hidden="true" />
          <p className="text-sm font-medium">{tagline}</p>
        </div>
      </motion.div>
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
