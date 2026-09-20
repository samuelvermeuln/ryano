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

  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true, status: true } });
  if (!school) notFound();

  // If school is inactive, check for an ENDED membership — show migration notice instead of redirecting
  if (school.status === "INACTIVE") {
    const endedMembership = await prisma.schoolAthleteMembership.findFirst({
      where: { schoolId, athleteId: session.user.id },
      select: { id: true },
    });
    if (!endedMembership) redirect("/app/dashboard");
    // Fall through to render the deactivated-school banner (see children substitution below)
  } else {
    const membership = await prisma.schoolAthleteMembership.findFirst({
      where: { schoolId, athleteId: session.user.id, status: "ACTIVE" },
      select: { id: true },
    });
    if (!membership) redirect("/app/dashboard");
  }

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
      {school.status === "INACTIVE" ? (
        <div className="p-6">
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 space-y-3">
            <div>
              <h2 className="text-base font-semibold text-destructive">Sua escola foi desativada</h2>
              <p className="text-sm text-foreground/70 mt-1.5">
                A escola <strong>{school.name}</strong> foi desativada e sua matrícula foi encerrada.
                Você pode se vincular a uma nova escola ou continuar seus treinos de forma independente.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href="/escola/buscar"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium px-4 py-2 hover:opacity-90 transition-opacity"
              >
                🏫 Encontrar nova escola
              </a>
              <a
                href="/app/dashboard"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border text-sm font-medium px-4 py-2 hover:bg-muted transition-colors"
              >
                Ir para o dashboard
              </a>
            </div>
          </div>
        </div>
      ) : children}
    </AppShell>
  );
}
