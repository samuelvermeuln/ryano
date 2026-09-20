/**
 * Layout do painel do atleta para uma escola.
 * Requer SchoolAthleteMembership ACTIVE.
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
  title: "Minha escola",
  description: "Acompanhe seus treinos e evolução.",
  path: "/atleta",
});

type LayoutProps = { children: ReactNode; params: Promise<{ schoolId: string }> };

export default async function AtletaLayout({ children, params }: LayoutProps) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId } = await params;

  const membership = await prisma.schoolAthleteMembership.findFirst({
    where: { schoolId, athleteId: session.user.id, status: "ACTIVE" },
    select: { id: true },
  });
  if (!membership) redirect("/app/dashboard");

  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } });
  if (!school) notFound();

  const navigation = [
    { href: `/atleta/${schoolId}`,            label: "Painel",     subtitle: "Resumo",              icon: "overview"  as const },
    { href: `/atleta/${schoolId}/calendario`, label: "Calendário", subtitle: "Meus treinos",        icon: "workout"   as const },
    { href: `/atleta/${schoolId}/historico`,  label: "Histórico",  subtitle: "Compartilhamento",    icon: "reports"   as const },
  ] as const;

  return (
    <AppShell
      mode="app"
      navigation={navigation}
      userName={session.user.name ?? session.user.email ?? "Atleta"}
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
