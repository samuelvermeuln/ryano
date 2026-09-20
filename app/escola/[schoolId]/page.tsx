/**
 * T253 — Tela dashboard administrativo
 * Exibe métricas gerais: total de atletas, professores, turmas,
 * treinos prescritos e compliance médio.
 */
import { notFound } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string }> };

async function getSchoolDashboardData(schoolId: string) {
  const [school, athleteCount, coachCount, teamCount, assignmentStats, avgCompliance] = await Promise.all([
    prisma.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, isActive: true } }),
    prisma.schoolAthleteMembership.count({ where: { schoolId, status: "ACTIVE" } }),
    prisma.coachSchoolMembership.count({ where: { schoolId, status: "ACTIVE", endedAt: null } }),
    prisma.team.count({ where: { schoolId, archivedAt: null } }),
    prisma.workoutAssignment.groupBy({
      by: ["status"],
      where: { schoolId },
      _count: true,
    }),
    prisma.workoutCompliance.aggregate({
      where: { assignment: { schoolId } },
      _avg: { overallScore: true },
    }),
  ]);
  return { school, athleteCount, coachCount, teamCount, assignmentStats, avgCompliance };
}

export default async function EscolaDashboardPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  await requireOnboardedSession();
  const { schoolId } = await params;
  const data = await getSchoolDashboardData(schoolId);
  if (!data.school) notFound();

  const totalAssignments = data.assignmentStats.reduce((s, g) => s + g._count, 0);
  const completedAssignments = data.assignmentStats.find((g) => g.status === "COMPLETED")?._count ?? 0;
  const avgScore = data.avgCompliance._avg.overallScore;

  const stats = [
    { label: "Atletas ativos",      value: data.athleteCount },
    { label: "Professores ativos",  value: data.coachCount },
    { label: "Turmas ativas",        value: data.teamCount },
    { label: "Treinos prescritos",   value: totalAssignments },
    { label: "Treinos concluídos",   value: completedAssignments },
    { label: "Compliance médio",     value: avgScore != null ? `${(avgScore / 10).toFixed(1)}/10` : "—" },
  ];

  return (
    <div className="p-6 md:p-10 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{data.school.name}</h1>
        {!data.school.isActive && (
          <span className="text-sm text-destructive font-medium">Escola desativada</span>
        )}
      </div>

      {/* Stats grid */}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map(({ label, value }) => (
          <li key={label} className="rounded-xl border border-border bg-card p-5">
            <p className="text-3xl font-bold tabular-nums">{value}</p>
            <p className="text-sm text-muted-foreground mt-1">{label}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
