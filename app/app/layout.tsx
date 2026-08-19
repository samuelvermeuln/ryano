import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { requireOnboardedUser } from "@/server/auth-guards";

const navigation = [
  { href: "/app/dashboard", label: "Dashboard", subtitle: "Resumo e alertas" },
  { href: "/app/atividades", label: "Atividades", subtitle: "Histórico e detalhe" },
  { href: "/app/integracoes", label: "Integrações", subtitle: "Garmin e WhatsApp" },
  { href: "/app/relatorios", label: "Relatórios", subtitle: "Preferências" },
  { href: "/app/perfil", label: "Perfil", subtitle: "Dados pessoais" },
  { href: "/app/seguranca", label: "Segurança", subtitle: "Senha e sessão" },
];

export default async function ProtectedAppLayout({ children }: { children: ReactNode }) {
  const user = await requireOnboardedUser();

  return (
    <AppShell
      mode="app"
      navigation={navigation}
      userName={user.name ?? user.email}
    >
      {children}
    </AppShell>
  );
}
