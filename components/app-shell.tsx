"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";

import { LogoutButton } from "@/components/auth/logout-button";

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

type NavigationItem = {
  href: string;
  label: string;
  subtitle: string;
  icon: NavIconName;
};

type ShellMode = "app" | "admin";

type AppShellProps = {
  navigation: readonly NavigationItem[];
  userName: string;
  mode: ShellMode;
  children: ReactNode;
  mobileDock?: ReactNode;
};

const routeHeaders: Record<string, { title: string; subtitle: string }> = {
  "/app/dashboard": {
    title: "Dashboard",
    subtitle: "Resumo da conta, integrações e últimas atividades.",
  },
  "/app/atividades": {
    title: "Atividades",
    subtitle: "Histórico normalizado por provider, modalidade e período.",
  },
  "/app/integracoes": {
    title: "Integrações",
    subtitle: "Conecte Garmin e acompanhe ativação do WhatsApp.",
  },
  "/app/relatorios": {
    title: "Relatórios",
    subtitle: "Preferências de mensagens e notificações operacionais.",
  },
  "/app/perfil": {
    title: "Perfil",
    subtitle: "Dados pessoais, medidas e endereço do usuário.",
  },
  "/app/seguranca": {
    title: "Segurança",
    subtitle: "Senha, autenticação e estado operacional da conta.",
  },
  "/onboarding": {
    title: "Onboarding",
    subtitle: "Concluir dados obrigatórios para ativar conta na V1.",
  },
  "/admin": {
    title: "Admin overview",
    subtitle: "KPIs operacionais, usuários e estado das integrações.",
  },
  "/admin/usuarios": {
    title: "Admin · Usuários",
    subtitle: "Lista de usuários, onboarding, Garmin e WhatsApp.",
  },
  "/admin/whatsapp": {
    title: "Admin · WhatsApp",
    subtitle: "Status da Evolution, QR Code e mensageria.",
  },
  "/admin/integracoes": {
    title: "Admin · Integrações",
    subtitle: "Saúde de Garmin service, Evolution e backlog operacional.",
  },
};

function resolveHeader(pathname: string) {
  if (pathname.startsWith("/app/atividades/")) {
    return {
      title: "Detalhe da atividade",
      subtitle: "Resumo da atividade sincronizada e métricas disponíveis.",
    };
  }

  if (pathname.startsWith("/admin/usuarios/")) {
    return {
      title: "Admin · Detalhe do usuário",
      subtitle: "Visão operacional individual com onboarding, integrações e mensageria.",
    };
  }

  return routeHeaders[pathname] ?? routeHeaders["/app/dashboard"];
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getMobileNavigation(navigation: readonly NavigationItem[], pathname: string, mode: ShellMode) {
  if (pathname.startsWith("/onboarding")) {
    return navigation;
  }

  if (mode === "admin") {
    return navigation.slice(0, 4);
  }

  const preferred = ["/app/dashboard", "/app/atividades", "/app/integracoes", "/app/perfil"];
  const items = preferred
    .map((href) => navigation.find((item) => item.href === href))
    .filter((item): item is NavigationItem => Boolean(item));

  return items.length > 0 ? items : navigation.slice(0, 4);
}

function NavigationLink({ item }: { item: NavigationItem }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);

  return (
    <Link
      href={item.href}
      className={`relative overflow-hidden rounded-[22px] px-4 py-3 transition ${
        active
          ? "bg-white/[0.08] text-foreground ring-1 ring-white/10"
          : "text-foreground/65 hover:bg-white/[0.04] hover:text-foreground"
      }`}
    >
      {active ? (
        <motion.div
          layoutId="desktop-nav-active"
          className="absolute inset-0 rounded-[22px] bg-[linear-gradient(135deg,oklch(0.83_0.08_215_/_0.2),oklch(0.82_0.12_165_/_0.18))]"
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        />
      ) : null}
      <div className="relative flex items-start gap-3">
        <div className="mt-0.5 rounded-2xl border border-white/10 bg-white/5 p-2">
          <NavIcon name={item.icon} active={active} />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-tight">{item.label}</p>
          <p className="mt-1 text-xs text-foreground/55">{item.subtitle}</p>
        </div>
      </div>
    </Link>
  );
}

function getMobileNavGridClass(length: number) {
  if (length >= 4) {
    return "grid-cols-4";
  }

  if (length === 3) {
    return "grid-cols-3";
  }

  if (length === 2) {
    return "grid-cols-2";
  }

  return "grid-cols-1";
}

function MobileBottomNav({ navigation, mode }: { navigation: readonly NavigationItem[]; mode: ShellMode }) {
  const pathname = usePathname();
  const mobileNavigation = getMobileNavigation(navigation, pathname, mode);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+0.85rem)] lg:hidden">
      <div className="pointer-events-auto w-full max-w-md rounded-[32px] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.22),rgba(255,255,255,0.08))] p-2 shadow-[0_18px_60px_rgba(4,78,95,0.24)] backdrop-blur-[28px] saturate-200">
        <div className="mb-2 flex justify-center">
          <div className="h-1 w-12 rounded-full bg-white/28" />
        </div>
        <div className={`grid gap-1 ${getMobileNavGridClass(mobileNavigation.length)}`}>
          {mobileNavigation.map((item) => {
            const active = isActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className="relative flex min-w-0 flex-col items-center justify-center rounded-[22px] px-2 py-2 text-center"
              >
                <AnimatePresence>
                  {active ? (
                    <motion.div
                      layoutId="mobile-nav-active"
                      className="absolute inset-0 rounded-[22px] bg-[linear-gradient(135deg,rgba(255,255,255,0.26),rgba(255,255,255,0.1))] shadow-[inset_0_1px_0_rgba(255,255,255,0.32)]"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  ) : null}
                </AnimatePresence>
                <motion.div
                  className="relative flex flex-col items-center gap-1"
                  animate={{ scale: active ? 1.02 : 1, y: active ? -1 : 0 }}
                  transition={{ type: "spring", stiffness: 380, damping: 24 }}
                >
                  <div className={`rounded-2xl p-2 ${active ? "bg-white/14" : "bg-transparent"}`}>
                    <NavIcon name={item.icon} active={active} />
                  </div>
                  <span className={`truncate text-[10px] font-medium ${active ? "text-foreground" : "text-foreground/62"}`}>
                    {item.label}
                  </span>
                  <span className={`h-1 rounded-full transition-all ${active ? "mt-0.5 w-5 bg-foreground/90" : "w-1 bg-foreground/28"}`} />
                </motion.div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function AppShell({ navigation, userName, mode, children, mobileDock }: AppShellProps) {
  const pathname = usePathname();
  const { title, subtitle } = resolveHeader(pathname);
  const mobileNavigation = getMobileNavigation(navigation, pathname, mode);

  return (
    <div className="aurora-bg min-h-screen p-3 sm:p-5 lg:p-6">
      <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-7xl gap-4 lg:gap-6">
        <aside className="glass hidden w-72 shrink-0 rounded-[32px] bg-[linear-gradient(180deg,oklch(0.34_0.045_210_/_0.72),oklch(0.29_0.04_170_/_0.6))] p-5 lg:flex lg:flex-col">
          <div className="border-b border-white/10 pb-5">
            <p className="text-sm font-semibold tracking-[0.22em] text-foreground/78">ryvano</p>
            <p className="mt-2 text-sm leading-7 text-foreground/62">
              {mode === "admin"
                ? "Painel administrativo de operações, usuários e integrações."
                : "Plataforma esportiva com integrações, histórico e WhatsApp."}
            </p>
          </div>

          <nav className="mt-5 flex flex-1 flex-col gap-2">
            {navigation.map((item) => (
              <NavigationLink key={item.href} item={item} />
            ))}
          </nav>

          <div className="mt-6 border-t border-white/10 pt-5">
            <p className="text-sm font-semibold text-foreground">{userName}</p>
            <p className="mt-1 text-xs text-foreground/55">Sessão autenticada</p>
            <div className="mt-4">
              <LogoutButton />
            </div>
          </div>
        </aside>

        <div className="flex flex-1 flex-col gap-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:gap-6 lg:pb-0">
          <motion.header
            className="glass sticky top-3 z-30 rounded-[28px] bg-[linear-gradient(135deg,oklch(0.38_0.05_215_/_0.72),oklch(0.32_0.055_175_/_0.66))] px-5 py-4 shadow-[0_18px_44px_rgba(4,78,95,0.18)] sm:px-6"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[18px] bg-[linear-gradient(135deg,rgba(255,255,255,0.28),rgba(255,255,255,0.12))] text-sm font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
                    {mode === "admin" ? "AD" : "RY"}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs uppercase tracking-[0.2em] text-foreground/70">
                      {mode === "admin" ? "Painel administrativo" : "App autenticado"}
                    </p>
                    <p className="truncate text-sm font-semibold text-foreground">{userName}</p>
                  </div>
                </div>
                <div className="lg:hidden">
                  <LogoutButton />
                </div>
              </div>

              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
                  <p className="mt-2 text-sm leading-7 text-foreground/68">{subtitle}</p>
                </div>
                <div className="hidden flex-wrap items-center gap-2 sm:flex lg:hidden">
                  {mobileNavigation.map((item) => {
                    const active = isActive(pathname, item.href);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`rounded-full px-3 py-2 text-xs font-medium ${
                          active ? "bg-white/16 text-foreground" : "bg-white/8 text-foreground/70"
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.header>

          <motion.main
            className="space-y-4 lg:space-y-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.42, delay: 0.04, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.main>
        </div>
      </div>

      {mobileDock ?? <MobileBottomNav navigation={navigation} mode={mode} />}
    </div>
  );
}

function NavIcon({ name, active }: { name: NavIconName; active: boolean }) {
  const stroke = active ? "#f8fdff" : "rgba(248,253,255,0.68)";

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
