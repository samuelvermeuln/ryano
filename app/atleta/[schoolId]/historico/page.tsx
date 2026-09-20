/**
 * T298 — Tela de compartilhamento de histórico
 * T299 — Seleção de período e escopo
 * T300 — Revogação de compartilhamento
 */
import { notFound } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { HistoryGrantsPanel } from "./history-grants-panel";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string }> };

const SCOPE_LABELS: Record<string, string> = {
  activities: "Atividades",
  metrics: "Métricas",
  prescribedWorkouts: "Treinos prescritos",
  compliance: "Compliance",
  coachScores: "Notas do coach",
  coachComments: "Comentários do coach",
  assessments: "Avaliações",
  athleteFeedback: "Feedback do atleta",
};

export default async function HistoricoPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId } = await params;

  // Current active grants this athlete has given
  const grants = await prisma.historyAccessGrant.findMany({
    where: { athleteId: session.user.id, schoolId },
    include: {
      school: { select: { name: true } },
      coach: { include: { user: { select: { name: true } } } },
    },
    orderBy: { grantedAt: "desc" },
  });

  // Available coaches to grant access to
  const coaches = await prisma.coachSchoolMembership.findMany({
    where: { schoolId, status: "ACTIVE", endedAt: null },
    include: { coach: { include: { user: { select: { id: true, name: true } } } } },
    take: 50,
  });

  return (
    <div className="p-6 md:p-10 space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Compartilhamento de histórico</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Controle quem pode ver seus dados. Você pode revogar o acesso a qualquer momento.
        </p>
      </div>

      <HistoryGrantsPanel
        schoolId={schoolId}
        grants={grants.map((g) => ({
          id: g.id,
          status: g.status,
          granteeType: g.granteeType,
          coachName: g.coach?.user.name ?? null,
          schoolName: g.school?.name ?? null,
          scope: g.scope as Record<string, boolean>,
          fromDate: g.fromDate?.toISOString().slice(0, 10) ?? null,
          toDate: g.toDate?.toISOString().slice(0, 10) ?? null,
          grantedAt: g.grantedAt.toISOString(),
          revokedAt: g.revokedAt?.toISOString() ?? null,
        }))}
        coaches={coaches.map((c) => ({ id: c.coachId, userId: c.coach.user.id, name: c.coach.user.name ?? c.coachId }))}
        scopeLabels={SCOPE_LABELS}
      />
    </div>
  );
}
