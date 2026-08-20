import type { ReactNode } from "react";
import Link from "next/link";

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
};

export async function PublicPageShell({
  eyebrow,
  title,
  description,
  children,
  footer,
}: PublicPageShellProps) {
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
        { href: "/cadastro", label: "Cadastro", icon: "onboarding", matchPrefixes: ["/cadastro"] },
        { href: "/termos", label: "Políticas", icon: "reports", matchPrefixes: ["/termos", "/privacidade"] },
      ];

  return (
    <AuroraBackground className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col gap-10 pb-28 sm:pb-10">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="text-sm font-semibold tracking-[0.24em] text-foreground/80">
            RYANO
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
                <Link href="/cadastro" className="hover:text-foreground">
                  Cadastro
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
              <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                {title}
              </h1>
              <p className="max-w-lg text-base leading-8 text-foreground/70 sm:text-lg">
                {description}
              </p>
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
