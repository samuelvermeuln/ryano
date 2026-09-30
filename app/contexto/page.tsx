/**
 * SAM-14 — seletor de contexto.
 *
 * Entra aqui quem tem mais de um contexto e nenhuma preferência válida (após
 * o login, ou quando um contexto salvo deixou de existir). Com um único
 * contexto não há o que escolher: redireciona direto.
 */
import { redirect } from "next/navigation";

import { switchContextAction } from "@/app/actions/user-context";
import { ThemedWordmark } from "@/components/theme-toggle";
import { UserAvatar } from "@/components/user-avatar";
import { contextKindLabel, contextLabel, contextLandingRoute } from "@/lib/user-context";
import { requireOnboardedSession } from "@/server/auth-guards";
import { buildNoIndexMetadata } from "@/server/seo";
import { listUserContexts } from "@/server/user-context";

export const metadata = buildNoIndexMetadata({
  title: "Escolher contexto",
  description: "Escolha como quer entrar na Ryvano.",
  path: "/contexto",
});

export const dynamic = "force-dynamic";

const CONTEXT_HINT: Record<string, string> = {
  ATHLETE: "Seus treinos, atividades e integrações.",
  PROFESSOR: "Seus atletas, prescrições e escolas.",
  SCHOOL: "Membros, professores, turmas e marketplace.",
};

export default async function ContextPickerPage() {
  const session = await requireOnboardedSession();
  const contexts = await listUserContexts(session.user.id);

  if (contexts.length === 1) redirect(contextLandingRoute(contexts[0]));

  const userName = session.user.name ?? session.user.email ?? "Usuário";

  return (
    <main className="aurora-bg flex min-h-screen items-center justify-center px-4 py-10">
      <section className="glass-strong w-full max-w-2xl rounded-[28px] p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <ThemedWordmark />
          <div className="flex items-center gap-3">
            <UserAvatar name={userName} image={session.user.image} size="sm" />
            <span className="max-w-[12rem] truncate text-sm font-semibold text-foreground">{userName}</span>
          </div>
        </div>

        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-foreground">Como você quer entrar?</h1>
        <p className="mt-1 text-sm text-foreground/65">
          Sua conta tem mais de um contexto. Você pode trocar a qualquer momento pelo cabeçalho.
        </p>

        <form action={switchContextAction} className="mt-6 grid gap-3 sm:grid-cols-2">
          {contexts.map((context) => (
            <button
              key={context.key}
              type="submit"
              name="contextKey"
              value={context.key}
              data-testid="context-option"
              data-context-key={context.key}
              className="group rounded-[20px] border border-white/12 bg-white/6 p-5 text-left transition hover:border-white/24 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
                {contextKindLabel(context)}
              </p>
              <p className="mt-1 truncate text-base font-semibold text-foreground">{contextLabel(context)}</p>
              <p className="mt-2 text-xs text-foreground/60">{CONTEXT_HINT[context.type]}</p>
            </button>
          ))}
        </form>
      </section>
    </main>
  );
}
