import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { MobileDock } from "@/components/mobile-dock";
import { buildMobileDockItemsFromNavigation } from "@/lib/navigation";
import type { NavigationItem } from "@/lib/navigation";
import { buildNoIndexMetadata } from "@/server/seo";
import { requireOnboardedSession } from "@/server/auth-guards";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";

export const metadata = buildNoIndexMetadata({
  title: "Minha conta",
  description: "Área da sua conta na ryvano.",
  path: "/app",
});

const baseNavigation: NavigationItem[] = [
  { href: "/app/dashboard", label: "Dashboard", subtitle: "Resumo e alertas", icon: "dashboard" },
  { href: "/app/atividades", label: "Atividades", subtitle: "Histórico e detalhe", icon: "activities" },
  { href: "/app/integracoes", label: "Integrações", subtitle: "Garmin e WhatsApp", icon: "integrations" },
  { href: "/app/perfil", label: "Perfil", subtitle: "Dados pessoais", icon: "profile" },
  { href: "/app/seguranca", label: "Segurança", subtitle: "Senha e sessão", icon: "security" },
];

const schoolNavigation: NavigationItem[] = [
  { href: "/app/treinos", label: "Treinos", subtitle: "Calendário semanal", icon: "calendar" },
  { href: "/app/escola", label: "Escolas", subtitle: "Encontrar uma escola", icon: "school" },
  { href: "/app/professor", label: "Professores", subtitle: "Encontrar um professor", icon: "team" },
];

export default async function ProtectedAppLayout({ children }: { children: ReactNode }) {
  const session = await requireOnboardedSession();
  const schoolEnabled = isSchoolModuleEnabled();
  const navigation = schoolEnabled ? [...baseNavigation, ...schoolNavigation] : baseNavigation;

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
