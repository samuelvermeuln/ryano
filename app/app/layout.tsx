import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { MobileDock } from "@/components/mobile-dock";
import { buildNoIndexMetadata } from "@/server/seo";
import { requireOnboardedUser } from "@/server/auth-guards";

export const metadata = buildNoIndexMetadata({
  title: "App",
  description: "Área autenticada da ryvano.",
  path: "/app",
});

const navigation = [
  { href: "/app/dashboard", label: "Dashboard", subtitle: "Resumo e alertas", icon: "dashboard" as const },
  { href: "/app/atividades", label: "Atividades", subtitle: "Histórico e detalhe", icon: "activities" as const },
  { href: "/app/integracoes", label: "Integrações", subtitle: "Garmin e WhatsApp", icon: "integrations" as const },
  { href: "/app/relatorios", label: "Relatórios", subtitle: "Preferências", icon: "reports" as const },
  { href: "/app/perfil", label: "Perfil", subtitle: "Dados pessoais", icon: "profile" as const },
  { href: "/app/seguranca", label: "Segurança", subtitle: "Senha e sessão", icon: "security" as const },
] as const;

const mobileDockItems = [
  { href: "/app/dashboard", label: "Home", icon: "home", matchPrefixes: ["/app", "/app/dashboard"] },
  { href: "/app/atividades", label: "Atividades", icon: "activities", matchPrefixes: ["/app/atividades"] },
  { href: "/app/relatorios", label: "Evolução", icon: "evolution", matchPrefixes: ["/app/relatorios"] },
  { href: "/app/perfil", label: "Perfil", icon: "profile", matchPrefixes: ["/app/perfil"] },
] as const;

export default async function ProtectedAppLayout({ children }: { children: ReactNode }) {
  const user = await requireOnboardedUser();

  return (
    <AppShell
      mode="app"
      navigation={navigation}
      userName={user.name ?? user.email}
      userImage={user.image}
      mobileDock={<MobileDock variant="custom" items={mobileDockItems} user={{ name: user.name ?? user.email, image: user.image }} />}
    >
      {children}
    </AppShell>
  );
}
