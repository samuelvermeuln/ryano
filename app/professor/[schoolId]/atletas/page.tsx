/**
 * T271 — Lista "Meus atletas" (visão do professor)
 * Cada atleta mostra último treino, compliance médio e pendências.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string }> };

export default async function MeusAtletasPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId } = await params;

  const coachProfile = await prisma.coachProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!coachProfile) notFound();

  const assignments = await prisma.coachAthleteAssignment.findMany({
    where: { schoolId, coachId: coachProfile.id, endedAt: null },
    include: {
      athlete: {
        include: {
          profile: { select: { mainSport: true } },
          schoolAthleteMembers: {
            where: { schoolId },
            select: { status: true },
            take: 1,
          },
        },
      },
    },
    orderBy: { startedAt: "asc" },
  });

  // Batch compliance averages per athlete
  const athleteIds = assignments.map((a) => a.athleteId);
  const complianceData = await prisma.workoutCompliance.groupBy({
    by: ["athleteId"],
    where: { athleteId: { in: athleteIds }, assignment: { schoolId } },
    _avg: { overallScore: true },
    _count: true,
  });
  const complianceMap = Object.fromEntries(
    complianceData.map((c) => [c.athleteId, { avg: c._avg.overallScore, count: c._count }]),
  );

  // Pending executions per athlete
  const pendingData = await prisma.workoutExecution.groupBy({
    by: ["athleteId"],
    where: { athleteId: { in: athleteIds }, matchStatus: "AUTO_MATCHED", assignment: { schoolId } },
    _count: true,
  });
  const pendingMap = Object.fromEntries(pendingData.map((p) => [p.athleteId, p._count]));

  return (
    <div className="p-6 md:p-10 space-y-6">
      <h1 className="text-xl font-semibold">Meus atletas ({assignments.length})</h1>

      {assignments.length === 0 && (
        <p className="text-muted-foreground">Nenhum atleta atribuído a você ainda.</p>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {assignments.map(({ athlete }) => {
          const compliance = complianceMap[athlete.id];
          const pending = pendingMap[athlete.id] ?? 0;
          return (
            <li key={athlete.id}>
              <Link
                href={`/professor/${schoolId}/atletas/${athlete.id}`}
                className="block rounded-xl border border-border bg-card p-5 hover:bg-muted/40 transition-colors space-y-3"
              >
                <div className="flex items-center gap-3">
                  {athlete.image && (
                    <img src={athlete.image} alt="" className="w-9 h-9 rounded-full object-cover" />
                  )}
                  <div>
                    <p className="font-medium leading-tight">{athlete.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{athlete.profile?.mainSport ?? "—"}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-2xl font-bold tabular-nums">
                      {compliance?.avg != null ? (compliance.avg / 10).toFixed(1) : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">Compliance médio</p>
                  </div>
                  {pending > 0 && (
                    <div className="text-right">
                      <p className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">{pending}</p>
                      <p className="text-xs text-muted-foreground">Pendente{pending !== 1 ? "s" : ""}</p>
                    </div>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
