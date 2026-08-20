import type { ReactNode } from "react";
import Link from "next/link";

import { AuroraBackground } from "@/components/aurora-background";
import { getAuthenticatedAppHref } from "@/server/auth-guards";

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
  const appHref = await getAuthenticatedAppHref();
  const signedIn = Boolean(appHref);

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

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+0.8rem)] sm:hidden">
        <div className="pointer-events-auto flex w-full max-w-md items-center justify-between gap-2 rounded-[28px] border border-white/14 bg-[linear-gradient(135deg,oklch(0.28_0.06_220_/_0.84),oklch(0.23_0.055_170_/_0.76))] px-2 py-2 shadow-[0_18px_60px_rgba(4,10,26,0.45)] backdrop-blur-[28px] saturate-200">
          {signedIn ? (
            <>
              <MobileDockLink href={appHref!} label="App" active />
              <MobileDockLink href="/app/atividades" label="Atividades" />
              <MobileDockLink href="/app/perfil" label="Perfil" />
            </>
          ) : (
            <>
              <MobileDockLink href="/" label="Home" active />
              <MobileDockLink href="/entrar" label="Entrar" />
              <MobileDockLink href="/cadastro" label="Cadastro" />
            </>
          )}
        </div>
      </div>
    </AuroraBackground>
  );
}

function MobileDockLink({ href, label, active = false }: { href: string; label: string; active?: boolean }) {
  return (
    <Link
      href={href}
      className={`flex min-w-0 flex-1 justify-center rounded-[22px] px-3 py-3 text-center text-xs font-medium ${
        active ? "bg-white/10 text-foreground" : "text-foreground/66"
      }`}
    >
      <span className="truncate">{label}</span>
    </Link>
  );
}
