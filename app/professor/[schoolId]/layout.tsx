/**
 * T270 — Layout do painel do professor
 * Requer que o usuário seja coach ativo na escola.
 */
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { MobileDock } from "@/components/mobile-dock";
import { buildMobileDockItemsFromNavigation } from "@/lib/navigation";
import { buildNoIndexMetadata } from "@/server/seo";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";

export const metadata = buildNoIndexMetadata({
  title: "Painel do professor",
  description: "Gerencie seus atletas e prescrições.",
  path: "/professor",
});

type LayoutProps = { children: ReactNode; params: Promise<{ schoolId: string }> };

export default async function ProfessorLayout({ children, params }: LayoutProps) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId } = await params;

  const coachProfile = await prisma.coachProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, status: true },
  });
  if (!coachProfile || coachProfile.status !== "ACTIVE") redirect("/app/dashboard");

  const membership = await prisma.coachSchoolMembership.findFirst({
    where: { schoolId, coachId: coachProfile.id, status: "ACTIVE", endedAt: null },
    select: { id: true },
  });
  if (!membership) redirect("/app/dashboard");

  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } });
  if (!school) notFound();

  const navigation = [
    { href: `/professor/${schoolId}`,          label: "Dashboard",    subtitle: "Visão geral",         icon: "overview" as const },
    { href: `/professor/${schoolId}/atletas`,   label: "Meus atletas", subtitle: "Acompanhamento",     icon: "users"    as const },
    { href: `/professor/${schoolId}/treinos`,   label: "Treinos",      subtitle: "Prescrições",        icon: "workout"  as const },
    { href: `/professor/${schoolId}/turmas`,    label: "Turmas",       subtitle: "Grupos",             icon: "team"     as const },
  ] as const;

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
