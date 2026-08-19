"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoutButton } from "@/components/auth/logout-button";

type NavigationItem = {
  href: string;
  label: string;
  subtitle: string;
};

type ShellMode = "app" | "admin";

type AppShellProps = {
  navigation: NavigationItem[];
  userName: string;
  mode: ShellMode;
  children: ReactNode;
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

function NavigationLink({ item }: { item: NavigationItem }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <Link
      href={item.href}
      className={`rounded-[22px] px-4 py-3 transition ${
        active
          ? "bg-white/[0.08] text-foreground ring-1 ring-white/10"
          : "text-foreground/65 hover:bg-white/[0.04] hover:text-foreground"
      }`}
    >
      <p className="text-sm font-semibold tracking-tight">{item.label}</p>
      <p className="mt-1 text-xs text-foreground/55">{item.subtitle}</p>
    </Link>
  );
}

export function AppShell({ navigation, userName, mode, children }: AppShellProps) {
  const pathname = usePathname();
  const { title, subtitle } = resolveHeader(pathname);

  return (
    <div className="aurora-bg min-h-screen p-4 sm:p-6">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-7xl gap-4 lg:gap-6">
        <aside className="glass hidden w-72 shrink-0 rounded-[32px] p-5 lg:flex lg:flex-col">
          <div className="border-b border-white/10 pb-5">
            <p className="text-sm font-semibold tracking-[0.22em] text-foreground/78">RYANO</p>
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

        <div className="flex flex-1 flex-col gap-4 lg:gap-6">
          <header className="glass rounded-[28px] px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-accent">
                  {mode === "admin" ? "Área administrativa" : "Área autenticada"}
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
                <p className="mt-2 text-sm leading-7 text-foreground/65">{subtitle}</p>
              </div>
              <div className="lg:hidden">
                <LogoutButton />
              </div>
            </div>
          </header>

          <main className="space-y-4 lg:space-y-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
