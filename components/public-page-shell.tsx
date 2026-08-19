import type { ReactNode } from "react";
import Link from "next/link";

import { AuroraBackground } from "@/components/aurora-background";

type PublicPageShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function PublicPageShell({
  eyebrow,
  title,
  description,
  children,
  footer,
}: PublicPageShellProps) {
  return (
    <AuroraBackground className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col gap-10">
        <header className="flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold tracking-[0.24em] text-foreground/80">
            RYANO
          </Link>
          <div className="flex items-center gap-3 text-sm text-foreground/70">
            <Link href="/entrar" className="hover:text-foreground">
              Entrar
            </Link>
            <Link href="/cadastro" className="hover:text-foreground">
              Cadastro
            </Link>
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
    </AuroraBackground>
  );
}
