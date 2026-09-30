import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { ContextShell } from "@/components/context-shell";
import { buildNoIndexMetadata } from "@/server/seo";
import { requireOnboardedSession } from "@/server/auth-guards";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";

export const metadata = buildNoIndexMetadata({
  title: "Painel do professor",
  description: "Suas escolas, produtos e contextos de professor.",
  path: "/professor",
});

/**
 * SAM-10 — grupo `(hub)`: o hub `/professor` e as telas sem escola
 * (estúdio de planos, acompanhamentos, vincular escola, coach independente)
 * passam a viver no shell padrão da Ryvano com a navegação do contexto
 * Professor (`buildContextNavigation`, escopo padrão). O painel de uma
 * escola (`/professor/[schoolId]`) tem layout próprio, fora deste grupo.
 *
 * Sem `CoachProfile` o contexto Professor ainda não existe: o shell mostra o
 * contexto atual da conta e a página exibe o formulário "Tornar-se professor".
 */
export default async function ProfessorHubLayout({ children }: { children: ReactNode }) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession({ next: "/professor" });

  return (
    <ContextShell user={session.user} impliedKey="professor" scope={{ kind: "default" }}>
      {children}
    </ContextShell>
  );
}
