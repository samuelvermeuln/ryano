import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { MobileDock } from "@/components/mobile-dock";
import { buildMobileDockItemsFromNavigation } from "@/lib/navigation";
import type { NavigationItem } from "@/lib/navigation";
import { buildNoIndexMetadata } from "@/server/seo";
import { requireOnboardedSession } from "@/server/auth-guards";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { isMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { prisma } from "@/server/db";

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
  { href: "/app/treinos", label: "Treinos", subtitle: "Calendário de treinos", icon: "calendar" },
  { href: "/app/escola", label: "Escolas", subtitle: "Encontrar uma escola", icon: "school" },
  { href: "/app/professor", label: "Professores", subtitle: "Encontrar um professor", icon: "team" },
];

/**
 * Management entries for users who run a school or coach athletes. Without
 * these, an owner lands on the athlete dashboard with no route into
 * `/escola/[schoolId]` — `/app/escola` is athlete-facing school *discovery*.
 */
async function buildManagementNavigation(userId: string): Promise<NavigationItem[]> {
  const [adminMembership, coachMembership] = await Promise.all([
    prisma.schoolMembership.findFirst({
      where: {
        userId,
        status: "ACTIVE",
        school: { status: "ACTIVE" },
        roles: { some: { role: { in: ["OWNER", "ADMIN"] } } },
      },
      select: { schoolId: true },
    }),
    // coachId references CoachProfile.id, not User.id
    prisma.coachSchoolMembership.findFirst({
      where: { coach: { userId }, status: "ACTIVE", school: { status: "ACTIVE" } },
      select: { id: true },
    }),
  ]);

  const items: NavigationItem[] = [];

  if (adminMembership) {
    items.push({
      href: `/escola/${adminMembership.schoolId}`,
      label: "Minha escola",
      subtitle: "Atletas, professores e turmas",
      icon: "school",
    });
  }

  if (coachMembership) {
    items.push({
      href: "/professor",
      label: "Painel do professor",
      subtitle: "Seus atletas e treinos",
      icon: "team",
    });
  }

  return items;
}

export default async function ProtectedAppLayout({ children }: { children: ReactNode }) {
  const session = await requireOnboardedSession();
  const schoolEnabled = isSchoolModuleEnabled();
  const managementNavigation = schoolEnabled
    ? await buildManagementNavigation(session.user.id)
    : [];
  // TM043 — "Meus planos" próximo de "Treinos" (spec §5 navegação). Own flag
  // check: MARKETPLACE_ENABLED can be off while the school module is on.
  const marketplaceNavigation: NavigationItem[] = schoolEnabled && isMarketplaceEnabled()
    ? [{ href: "/app/planos", label: "Meus planos", subtitle: "Planos do marketplace", icon: "calendar" }]
    : [];
  const navigation = schoolEnabled
    ? [...managementNavigation, ...baseNavigation, ...schoolNavigation, ...marketplaceNavigation]
    : baseNavigation;

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
