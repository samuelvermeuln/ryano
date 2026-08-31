import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { MobileDock } from "@/components/mobile-dock";
import { buildMobileDockItemsFromNavigation } from "@/lib/navigation";
import { buildNoIndexMetadata } from "@/server/seo";
import { requireOnboardedSession } from "@/server/auth-guards";

export const metadata = buildNoIndexMetadata({
  title: "Minha conta",
  description: "Área da sua conta na ryvano.",
  path: "/app",
});

const navigation = [
  { href: "/app/dashboard", label: "Dashboard", subtitle: "Resumo e alertas", icon: "dashboard" as const },
  { href: "/app/atividades", label: "Atividades", subtitle: "Histórico e detalhe", icon: "activities" as const },
  { href: "/app/integracoes", label: "Integrações", subtitle: "Garmin e WhatsApp", icon: "integrations" as const },
  { href: "/app/perfil", label: "Perfil", subtitle: "Dados pessoais", icon: "profile" as const },
  { href: "/app/seguranca", label: "Segurança", subtitle: "Senha e sessão", icon: "security" as const },
] as const;

export default async function ProtectedAppLayout({ children }: { children: ReactNode }) {
  const session = await requireOnboardedSession();

  return (
    <AppShell
      mode="app"
      navigation={navigation}
      userName={session.user.name ?? session.user.email ?? "Usuário"}
      userImage={session.user.image}
      mobileDock={
        <MobileDock
          variant="custom"
          items={buildMobileDockItemsFromNavigation(navigation)}
          user={{ name: session.user.name ?? session.user.email, image: session.user.image }}
        />
      }
    >
      {children}
    </AppShell>
  );
}
