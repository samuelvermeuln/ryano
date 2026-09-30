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
 * SAM-14 — grupo `(conta)`: perfil, segurança e integrações são funções da
 * identidade (pendem de `User`), compartilhadas por todo contexto. Uma única
 * implementação de conteúdo, renderizada dentro do shell do contexto ATIVO —
 * entrar em Perfil não transforma um professor em atleta.
 */
export default async function AccountAreaLayout({ children }: { children: ReactNode }) {
  const session = await requireOnboardedSession();

  return <ContextShell user={session.user}>{children}</ContextShell>;
}
