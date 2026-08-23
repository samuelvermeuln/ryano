"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from "@tabler/icons-react";
import { motion } from "motion/react";

import { AppHeader } from "@/components/app-header";
import { UserMenu } from "@/components/user-menu";

type NavIconName =
  | "dashboard"
  | "activities"
  | "integrations"
  | "reports"
  | "profile"
  | "security"
  | "overview"
  | "users"
  | "whatsapp"
  | "onboarding";

export type NavigationItem = {
  href: string;
  label: string;
  subtitle?: string;
  icon: NavIconName;
};

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
          <motion.div layout className="grid h-12 w-12 shrink-0 place-items-center rounded-[16px] border border-white/10 bg-white/6">
            <NavIcon name={item.icon} active={active} />
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
        <span className="pointer-events-none absolute left-[calc(100%+0.75rem)] top-1/2 z-30 -translate-y-1/2 rounded-full border border-white/10 bg-[rgba(12,25,38,0.92)] px-3 py-1.5 text-xs font-medium whitespace-nowrap text-foreground opacity-0 shadow-[0_12px_30px_rgba(4,78,95,0.2)] transition group-hover:opacity-100 group-focus-visible:opacity-100">
          {item.label}
        </span>
      ) : null}
    </Link>
  );
}

export function AppShell({ navigation, userName, userImage, mode, children, mobileDock }: AppShellProps) {
  const pathname = usePathname();
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

  return (
    <div className="aurora-bg min-h-screen px-4 py-4 ml-4 sm:px-4 lg:h-dvh lg:overflow-hidden lg:py-3 lg:pr-3 lg:pl-0 xl:py-4 xl:pr-4 xl:pl-0">
      <div className="flex w-full flex-col gap-4 lg:h-full lg:min-h-0 lg:flex-row lg:gap-3">
        <motion.aside
          animate={{ width: collapsed ? 76 : 240 }}
          transition={sidebarSpring}
          className="glass hidden h-full shrink-0 overflow-hidden rounded-[24px] bg-[linear-gradient(180deg,oklch(0.34_0.045_210_/_0.72),oklch(0.29_0.04_170_/_0.6))] lg:flex lg:flex-col"
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
                  <Image
                    src="/logo-principal-branco.png"
                    alt="RYVANO"
                    width={866}
                    height={288}
                    className="h-9 w-auto max-w-none object-contain"
                    priority
                  />
                </motion.div>
              </div>

              <button
                type="button"
                aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
                onClick={() => setCollapsed((current) => !current)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] border border-white/10 bg-white/6 text-foreground/74 transition hover:bg-white/10 hover:text-foreground"
              >
                {collapsed ? <IconLayoutSidebarLeftExpand size={18} /> : <IconLayoutSidebarLeftCollapse size={18} />}
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
              <div className="space-y-4 px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:min-h-full lg:space-y-3 lg:pb-6">
                <AppHeader
                  tagline="Seus dados esportivos, direto no WhatsApp."
                  navLinks={headerNavigation.map((item) => ({
                    href: item.href,
                    label: item.label,
                    active: isActive(pathname, item.href),
                  }))}
                  action={<UserMenu userName={userName} userImage={userImage} items={userMenuItems} />}
                  showBrand={false}
                  compact
                />

                <motion.main
                  className="space-y-4 lg:space-y-4"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.42, delay: 0.04, ease: [0.22, 1, 0.36, 1] }}
                >
                  {children}
                </motion.main>
              </div>
            </div>
          </div>
        </div>
      </div>

      {mobileDock}
    </div>
  );
}

function NavIcon({ name, active }: { name: NavIconName; active: boolean }) {
  const stroke = active ? "#f8fdff" : "rgba(248,253,255,0.72)";

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {name === "dashboard" ? <path d="M4 13h7V4H4v9Zm9 7h7V11h-7v9Zm0-16v5h7V4h-7ZM4 20h7v-5H4v5Z" fill={stroke} /> : null}
      {name === "activities" ? <path d="M4 14h3l2-4 4 8 2-4h5" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {name === "integrations" ? <path d="M8.5 8.5h-2A2.5 2.5 0 0 0 4 11v2a2.5 2.5 0 0 0 2.5 2.5h2m7-7h2A2.5 2.5 0 0 1 20 11v2a2.5 2.5 0 0 1-2.5 2.5h-2M9 12h6" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {name === "reports" ? <><path d="M6 20V9m6 11V4m6 16v-7" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" /><path d="M4 20h16" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" /></> : null}
      {name === "profile" ? <><circle cx="12" cy="8" r="3.2" stroke={stroke} strokeWidth="1.8" /><path d="M6 19c1.7-2.6 4-3.9 6-3.9s4.3 1.3 6 3.9" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" /></> : null}
      {name === "security" ? <><path d="M12 3 5 6v5c0 5 3.4 8.1 7 10 3.6-1.9 7-5 7-10V6l-7-3Z" stroke={stroke} strokeWidth="1.8" strokeLinejoin="round" /><path d="M9.5 12.2 11.2 14 14.8 10.3" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></> : null}
      {name === "overview" ? <><path d="M4 18h16" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" /><path d="M7 15V9m5 6V6m5 9v-3" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" /></> : null}
      {name === "users" ? <><circle cx="9" cy="9" r="2.6" stroke={stroke} strokeWidth="1.8" /><circle cx="16.5" cy="10.5" r="2.1" stroke={stroke} strokeWidth="1.6" /><path d="M4.8 18c1.5-2.1 3.2-3.1 5.2-3.1 2 0 3.7 1 5.2 3.1" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" /><path d="M14.7 17.4c.7-1.1 1.7-1.8 3.1-2" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" /></> : null}
      {name === "whatsapp" ? <><path d="M12 4a8 8 0 0 0-6.9 12l-1.1 4 4.1-1A8 8 0 1 0 12 4Z" stroke={stroke} strokeWidth="1.8" strokeLinejoin="round" /><path d="M9.3 9.4c.3 1.3 1.9 3.1 3.5 4 .5.2 1 .2 1.3-.2l.8-1" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></> : null}
      {name === "onboarding" ? <><path d="M6 12.5 10.2 17 18 7.5" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M21 12c0 5-4 9-9 9s-9-4-9-9 4-9 9-9" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" /></> : null}
    </svg>
  );
}
