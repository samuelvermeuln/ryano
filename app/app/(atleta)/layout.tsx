import type { ReactNode } from "react";

import { ContextShell } from "@/components/context-shell";
import { buildNoIndexMetadata } from "@/server/seo";
import { requireOnboardedSession } from "@/server/auth-guards";

export const metadata = buildNoIndexMetadata({
  title: "Minha conta",
  description: "Área da sua conta na ryvano.",
  path: "/app",
});

/**
 * SAM-14 — grupo `(atleta)`: dashboard, atividades, treinos, planos e
 * descoberta de escolas/professores são recursos do atleta, então a rota
 * implica o contexto Atleta. As páginas compartilhadas (perfil, segurança,
 * integrações) vivem no grupo `(conta)` e herdam o contexto ativo.
 */
export default async function AthleteAreaLayout({ children }: { children: ReactNode }) {
  const session = await requireOnboardedSession();

  return (
    <ContextShell user={session.user} impliedKey="athlete">
      {children}
    </ContextShell>
  );
}
