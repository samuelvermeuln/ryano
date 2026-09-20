/**
 * T270 — Dashboard do professor
 * Métricas: atletas, prescrições da semana, compliance médio, pendências.
 */
import { notFound } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string }> };

function weekAgoStart(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function ProfessorDashboardPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId } = await params;

  const coachProfile = await prisma.coachProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!coachProfile) notFound();

  const weekAgo = weekAgoStart();

  const [athleteCount, weekAssignments, pendingExecutions, avgCompliance] = await Promise.all([
    prisma.coachAthleteAssignment.count({
      where: { schoolId, coachId: coachProfile.id, endedAt: null },
    }),
    prisma.workoutAssignment.count({
      where: { schoolId, coachId: coachProfile.id, createdAt: { gte: weekAgo } },
    }),
    prisma.workoutExecution.count({
      where: {
        assignment: { schoolId, coachId: coachProfile.id },
        matchStatus: "AUTO_MATCHED",
      },
    }),
    prisma.workoutCompliance.aggregate({
      where: { assignment: { schoolId, coachId: coachProfile.id } },
      _avg: { overallScore: true },
    }),
  ]);

  const avgScore = avgCompliance._avg.overallScore;

  const stats = [
    { label: "Meus atletas",                value: athleteCount },
    { label: "Prescrições (7 dias)",         value: weekAssignments },
    { label: "Confirmações pendentes",       value: pendingExecutions },
    { label: "Compliance médio dos atletas", value: avgScore != null ? `${(avgScore / 10).toFixed(1)}/10` : "—" },
  ];

  return (
    <div className="p-6 md:p-10 space-y-8">
      <h1 className="text-2xl font-semibold">
        Olá, {(session.user.name ?? "Professor")?.split(" ")[0]} 👋
      </h1>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value }) => (
          <li key={label} className="rounded-xl border border-border bg-card p-5">
            <p className="text-3xl font-bold tabular-nums">{value}</p>
            <p className="text-sm text-muted-foreground mt-1">{label}</p>
          </li>
        ))}
      </ul>

      {pendingExecutions > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-4 text-sm text-amber-800 dark:text-amber-300">
          Você tem <strong>{pendingExecutions}</strong> execuções aguardando confirmação.{" "}
          <a href={`/professor/${schoolId}/atletas`} className="underline font-medium">Ver atletas →</a>
        </div>
      )}
    </div>
  );
}
