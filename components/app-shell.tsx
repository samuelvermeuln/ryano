"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from "@tabler/icons-react";
import { motion } from "motion/react";

import { AppHeader } from "@/components/app-header";
import { NavIcon } from "@/components/nav-icon";
import { ThemedWordmark } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import type { NavigationItem } from "@/lib/navigation";

export type { NavigationItem } from "@/lib/navigation";

type ShellMode = "app" | "admin";

type AppShellProps = {
  navigation: readonly NavigationItem[];
  userName: string;
  userImage?: string | null;
  mode: ShellMode;
  children: ReactNode;
  mobileDock?: ReactNode;
};

const SIDEBAR_STORAGE_KEY = "ryano-sidebar-collapsed";
const sidebarSpring = { type: "spring", stiffness: 420, damping: 36, mass: 0.8 } as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getHeaderNavigation(navigation: readonly NavigationItem[], mode: ShellMode) {
  if (mode === "admin") {
    return navigation.slice(0, 4);
  }

  const preferred = ["/onboarding", "/app/dashboard", "/app/atividades", "/app/integracoes"];
  const items = preferred
    .map((href) => navigation.find((item) => item.href === href))
    .filter((item): item is NavigationItem => Boolean(item));

  return items.length > 0 ? items : navigation.slice(0, 3);
}

function getUserMenuItems(mode: ShellMode) {
  if (mode === "admin") {
    return [
      { href: "/admin", label: "Minha conta" },
      { href: "/admin/integracoes", label: "Configurações" },
    ] as const;
  }

  return [
    { href: "/app/perfil", label: "Minha conta" },
    { href: "/app/seguranca", label: "Configurações" },
  ] as const;
}

function useDesktopScrollLock() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const media = window.matchMedia("(min-width: 1024px)");
    const html = document.documentElement;
    const body = document.body;

    const apply = () => {
      if (media.matches) {
        html.style.overflow = "hidden";
        body.style.overflow = "hidden";
        body.style.height = "100%";
        return;
      }

      html.style.overflow = "";
      body.style.overflow = "";
      body.style.height = "";
    };

    apply();
    media.addEventListener("change", apply);

    return () => {
      media.removeEventListener("change", apply);
      html.style.overflow = "";
      body.style.overflow = "";
      body.style.height = "";
    };
  }, []);
}

function NavigationLink({ item, collapsed }: { item: NavigationItem; collapsed: boolean }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);

  return (
    <Link
      href={item.href}
      aria-label={collapsed ? item.label : undefined}
      className={`group relative block overflow-visible rounded-[16px] transition ${
        collapsed ? "px-0 py-0" : "px-0 py-0"
      } ${active ? "text-foreground" : "text-foreground/68 hover:text-foreground"}`}
    >
      <motion.div
        layout
        transition={sidebarSpring}
        className={`relative flex min-h-[52px] items-center rounded-[16px] border py-2.5 ${
          collapsed ? "justify-center px-0" : "justify-start px-3"
        } ${
          active
            ? "border-white/14 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]"
            : "border-transparent bg-transparent hover:bg-white/6"
        }`}
      >
        {active ? (
          <motion.div
            layoutId="desktop-nav-active"
            className="absolute inset-0 rounded-[16px] bg-[linear-gradient(135deg,oklch(0.83_0.08_215_/_0.2),oklch(0.82_0.12_165_/_0.18))]"
            transition={sidebarSpring}
          />
        ) : null}

        <div className={`relative flex items-center ${collapsed ? "w-12 justify-center" : "w-full gap-3"}`}>
          <motion.div
            layout
            className={`grid h-12 w-12 shrink-0 place-items-center rounded-[16px] border ${
              active
                ? "border-white/14 bg-white/12 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                : "border-white/10 bg-white/6 text-foreground/74"
            }`}
          >
            <NavIcon name={item.icon} />
          </motion.div>

          <motion.div
            className="min-w-0 overflow-hidden"
            initial={false}
            animate={
              collapsed
                ? { width: 0, opacity: 0, x: -6 }
                : { width: "auto", opacity: 1, x: 0 }
            }
            transition={{
              width: sidebarSpring,
              opacity: { duration: collapsed ? 0.12 : 0.16, delay: collapsed ? 0 : 0.09 },
              x: { duration: collapsed ? 0.12 : 0.16, delay: collapsed ? 0 : 0.09 },
            }}
          >
            <p className="truncate text-sm font-semibold tracking-tight">{item.label}</p>
          </motion.div>
        </div>
      </motion.div>

      {collapsed ? (
        <span className="pointer-events-none absolute left-[calc(100%+0.75rem)] top-1/2 z-30 -translate-y-1/2 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium whitespace-nowrap text-foreground opacity-0 shadow-[0_12px_30px_rgba(4,78,95,0.2)] transition group-hover:opacity-100 group-focus-visible:opacity-100"
          style={{ background: "var(--floating-surface)" }}>
          {item.label}
        </span>
      ) : null}
    </Link>
  );
}

export function AppShell({ navigation, userName, userImage, mode, children, mobileDock }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const headerNavigation = useMemo(() => getHeaderNavigation(navigation, mode), [mode, navigation]);
  const userMenuItems = useMemo(() => getUserMenuItems(mode), [mode]);

  useDesktopScrollLock();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const saved = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
      setCollapsed(saved === "true");
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const prefetchRoutes = () => {
      for (const item of navigation) {
        router.prefetch(item.href);
      }
    };

    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(prefetchRoutes);
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = globalThis.setTimeout(prefetchRoutes, 120);
    return () => globalThis.clearTimeout(timeoutId);
  }, [navigation, router]);

  return (
    <div className="aurora-bg min-h-screen px-1 py-4 sm:px-1 lg:ml-4 lg:h-dvh lg:overflow-hidden lg:py-3 lg:pr-3 lg:pl-0 xl:py-4 xl:pr-4 xl:pl-0">
      <div className="flex w-full flex-col gap-4 lg:h-full lg:min-h-0 lg:flex-row lg:gap-3">
        <motion.aside
          animate={{ width: collapsed ? 76 : 240 }}
          transition={sidebarSpring}
          style={{ backgroundImage: "var(--sidebar-surface-gradient)" }}
          className="glass hidden h-full shrink-0 overflow-hidden rounded-[24px] lg:flex lg:flex-col"
        >
          <div className={`flex h-full flex-col ${collapsed ? "px-2 py-3" : "p-3"}`}>
            <div className={`flex pb-3 ${collapsed ? "flex-col items-center gap-2" : "items-center justify-between gap-2"}`}>
              <div className={`flex min-w-0 items-center ${collapsed ? "justify-center" : "gap-3"}`}>
                <div >
                    {collapsed ? <Image src="/logo.png" alt="RYVANO" width={500} height={500} className="h-7 w-7 object-contain" priority /> : null}
                  </div>
                <motion.div
                  className="overflow-hidden"
                  initial={false}
                  animate={collapsed ? { width: 0, opacity: 0, x: -6 } : { width: "auto", opacity: 1, x: 0 }}
                  transition={{
                    width: sidebarSpring,
                    opacity: { duration: collapsed ? 0.12 : 0.16, delay: collapsed ? 0 : 0.09 },
                    x: { duration: collapsed ? 0.12 : 0.16, delay: collapsed ? 0 : 0.09 },
                  }}
                >
                  <ThemedWordmark />
                </motion.div>
              </div>

              <button
                type="button"
                aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
                onClick={() => setCollapsed((current) => !current)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] border border-white/10 bg-white/6 text-foreground/74 transition hover:bg-white/10 hover:text-foreground"
              >
                {collapsed ? <IconLayoutSidebarLeftExpand size={20} /> : <IconLayoutSidebarLeftCollapse size={20} />}
              </button>
            </div>

            <nav className="mt-3 flex flex-1 flex-col gap-2 overflow-hidden">
              {navigation.map((item) => (
                <NavigationLink key={item.href} item={item} collapsed={collapsed} />
              ))}
            </nav>

            <div className="mt-4 border-t border-white/10 pt-3">
              
            </div>
          </div>
        </motion.aside>

        <div className="flex min-w-0 flex-1 flex-col lg:min-h-0">
          <div className="flex flex-1 flex-col gap-4 lg:min-h-0">
            <div className="thin-scrollbar lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overflow-x-hidden lg:pr-0.5">
              <div className="space-y-10 px-1 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:px-4 lg:min-h-full lg:space-y-8 lg:pb-6">
                <AppHeader
                  tagline="Treinos, saúde e alertas do seu relógio, direto no seu WhatsApp."
                  navLinks={headerNavigation.map((item) => ({
                    href: item.href,
                    label: item.label,
                    active: isActive(pathname, item.href),
                  }))}
                  action={<UserMenu userName={userName} userImage={userImage} items={userMenuItems} />}
                  showBrand={false}
                  compact
                  animate={false}
                />

                <main className="space-y-4 lg:space-y-4">
                  {children}
                </main>
              </div>
            </div>
          </div>
        </div>
      </div>

      {mobileDock}
    </div>
  );
}
