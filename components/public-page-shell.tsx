import type { ReactNode } from "react";
import Link from "next/link";
import { IconActivityHeartbeat, IconMessageCircle2, IconTrendingUp } from "@tabler/icons-react";

import { AuroraBackground } from "@/components/aurora-background";
import { MobileDock } from "@/components/mobile-dock";
import type { MobileDockItem } from "@/components/mobile-dock-client";
import { getPublicAuthenticatedAppHref } from "@/server/auth-guards";

type PublicPageShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "default" | "auth";
};

const authHighlights = [
  {
    title: "Treinos organizados",
    description: "Acesse suas atividades, progresso e contexto em um só lugar.",
    icon: IconActivityHeartbeat,
  },
  {
    title: "Leitura rápida",
    description: "Entenda o que mudou no treino sem precisar abrir vários apps.",
    icon: IconTrendingUp,
  },
  {
    title: "Resumo no WhatsApp",
    description: "Receba os destaques do pós-treino com linguagem simples e direta.",
    icon: IconMessageCircle2,
  },
] as const;

export async function PublicPageShell({
  eyebrow,
  title,
  description,
  children,
  footer,
  variant = "default",
}: PublicPageShellProps) {
  if (variant === "auth") {
    return (
      <AuroraBackground className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col gap-8">
          <header className="flex items-center justify-between gap-4">
            <Link href="/" className="text-sm font-semibold tracking-[0.24em] text-foreground/84">
              ryvano
            </Link>
            <Link href="/" className="text-sm text-foreground/64 transition hover:text-foreground">
              Voltar ao início
            </Link>
          </header>

          <main className="grid flex-1 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:gap-12">
            <section className="hidden max-w-xl space-y-6 lg:block">
              <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-accent">
                {eyebrow}
              </span>
              <div className="space-y-4">
                <h1 className="text-5xl font-semibold tracking-tight text-foreground">{title}</h1>
                <p className="max-w-lg text-lg leading-8 text-foreground/68">{description}</p>
              </div>

              <div className="grid gap-3 pt-2">
                {authHighlights.map((item) => {
                  const Icon = item.icon;

                  return (
                    <article key={item.title} className="glass rounded-[24px] p-5">
                      <div className="flex items-start gap-4">
                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/8 text-accent">
                          <Icon size={20} stroke={1.9} aria-hidden="true" />
                        </div>
                        <div className="space-y-1.5">
                          <h2 className="text-base font-semibold text-foreground">{item.title}</h2>
                          <p className="text-sm leading-7 text-foreground/68">{item.description}</p>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="glass w-full max-w-[460px] justify-self-center rounded-[28px] p-6 sm:p-8 lg:justify-self-end">
              <div className="space-y-3 lg:hidden">
                <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-accent">
                  {eyebrow}
                </span>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{title}</h1>
                <p className="text-sm leading-7 text-foreground/68 sm:text-base">{description}</p>
              </div>

              <div className="mt-6 lg:mt-0">{children}</div>
              {footer ? <div className="mt-6 border-t border-white/10 pt-6">{footer}</div> : null}
            </section>
          </main>
        </div>
      </AuroraBackground>
    );
  }

  const appHref = await getPublicAuthenticatedAppHref();
  const signedIn = Boolean(appHref);
  const mobileDockItems: readonly MobileDockItem[] = signedIn
    ? [
        { href: "/", label: "Home", icon: "home", matchPrefixes: ["/"] },
        { href: appHref!, label: "App", icon: "overview", matchPrefixes: ["/app", "/admin", "/onboarding"] },
        { href: "/app/atividades", label: "Atividades", icon: "activities", matchPrefixes: ["/app/atividades"] },
        { href: "/app/perfil", label: "Perfil", icon: "profile", matchPrefixes: ["/app/perfil"] },
      ]
    : [
        { href: "/", label: "Home", icon: "home", matchPrefixes: ["/"] },
        { href: "/entrar", label: "Entrar", icon: "profile", matchPrefixes: ["/entrar", "/recuperar-senha", "/redefinir-senha"] },
        { href: "/entrar?modo=cadastro", label: "Cadastro", icon: "onboarding", matchPrefixes: ["/cadastro"] },
        { href: "/termos", label: "Políticas", icon: "reports", matchPrefixes: ["/termos", "/privacidade"] },
      ];

  return (
    <AuroraBackground className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col gap-10 pb-28 sm:pb-10">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="text-sm font-semibold tracking-[0.24em] text-foreground/80">
            ryvano
          </Link>
          <div className="hidden items-center gap-3 text-sm text-foreground/70 sm:flex">
            {signedIn ? (
              <>
                <Link href={appHref!} className="hover:text-foreground">
                  Abrir app
                </Link>
                <Link href="/app/atividades" className="hover:text-foreground">
                  Atividades
                </Link>
                <Link href="/app/perfil" className="hover:text-foreground">
                  Perfil
                </Link>
              </>
            ) : (
              <>
                <Link href="/entrar" className="hover:text-foreground">
                  Entrar
                </Link>
                <Link href="/entrar?modo=cadastro" className="hover:text-foreground">
                  Criar conta
                </Link>
              </>
            )}
          </div>
        </header>

        <main className="grid flex-1 items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="max-w-xl space-y-5">
            <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium tracking-[0.18em] text-accent uppercase">
              {eyebrow}
            </span>
            <div className="space-y-4">
              <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">{title}</h1>
              <p className="max-w-lg text-base leading-8 text-foreground/70 sm:text-lg">{description}</p>
            </div>
          </section>

          <section className="glass rounded-[28px] p-6 sm:p-8">
            {children}
            {footer ? <div className="mt-6 border-t border-white/10 pt-6">{footer}</div> : null}
          </section>
        </main>
      </div>

      <MobileDock variant="custom" items={mobileDockItems} />
    </AuroraBackground>
  );
}
