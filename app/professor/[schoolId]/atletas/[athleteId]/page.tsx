/**
 * T272 — Detalhe do atleta (visão do professor)
 * T277 — Visual Prescrito × Realizado
 * T278 — Compliance detalhado
 * T280 — Exibir feedback do atleta
 */
import { notFound } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { displayScore } from "@/modules/school/domain/coach-evaluation";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string; athleteId: string }> };

export default async function AthleteDetailPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId, athleteId } = await params;

  const coachProfile = await prisma.coachProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!coachProfile) notFound();

  // Verify coach is assigned to this athlete
  const coachAssignment = await prisma.coachAthleteAssignment.findFirst({
    where: { schoolId, coachId: coachProfile.id, athleteId, endedAt: null },
    select: { id: true },
  });
  if (!coachAssignment) notFound();

  const [athlete, recentAssignments] = await Promise.all([
    prisma.user.findUnique({
      where: { id: athleteId },
      select: { id: true, name: true, email: true, image: true, profile: { select: { mainSport: true } } },
    }),
    prisma.workoutAssignment.findMany({
      where: { schoolId, athleteId, status: { not: "CANCELLED" } },
      include: {
        workout: { select: { title: true, sportType: true } },
        executions: {
          where: { matchStatus: { in: ["CONFIRMED", "OVERRIDDEN", "AUTO_MATCHED"] } },
          include: {
            compliance: true,
            feedback: { select: { rpe: true, mood: true, energy: true, comment: true } },
            evaluations: { where: { coachId: coachProfile.id }, select: { overallScore: true, note: true } },
          },
          take: 1,
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { scheduledDate: "desc" },
      take: 20,
    }),
  ]);

  if (!athlete) notFound();

  return (
    <div className="p-6 md:p-10 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        {athlete.image && (
          <img src={athlete.image} alt="" className="w-14 h-14 rounded-full object-cover" />
        )}
        <div>
          <h1 className="text-xl font-semibold">{athlete.name ?? "Atleta"}</h1>
          <p className="text-sm text-muted-foreground">{athlete.email}</p>
          {athlete.profile?.mainSport && (
            <p className="text-xs text-muted-foreground mt-0.5">{athlete.profile.mainSport}</p>
          )}
        </div>
      </div>

      {/* T277 — Prescrito × Realizado */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Treinos recentes</h2>
        {recentAssignments.length === 0 && (
          <p className="text-muted-foreground text-sm">Nenhuma prescrição encontrada.</p>
        )}
        <ul className="space-y-3">
          {recentAssignments.map((asgn) => {
            const exec = asgn.executions[0];
            const compliance = exec?.compliance;
            const feedback = exec?.feedback;
            const myEval = exec?.evaluations[0];
            return (
              <li key={asgn.id} className="rounded-xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{asgn.workout.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(asgn.scheduledDate).toLocaleDateString("pt-BR")} · {asgn.workout.sportType}
                    </p>
                  </div>
                  <span className={`text-xs rounded px-2 py-0.5 ${
                    asgn.status === "COMPLETED" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                    : asgn.status === "SCHEDULED" ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                    : "bg-muted text-muted-foreground"
                  }`}>{asgn.status}</span>
                </div>

                {/* T277 — Prescrito × Realizado */}
                {exec && (
                  <div className="grid grid-cols-2 gap-4 text-sm border-t border-border pt-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Prescrito</p>
                      <p className="font-medium">{asgn.workout.sportType}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Realizado</p>
                      <p className="font-medium">{exec.sportType}</p>
                      {exec.distanceMeters && (
                        <p className="text-xs text-muted-foreground">{(exec.distanceMeters / 1000).toFixed(2)} km</p>
                      )}
                      {exec.durationSeconds && (
                        <p className="text-xs text-muted-foreground">{Math.round(exec.durationSeconds / 60)} min</p>
                      )}
                    </div>
                  </div>
                )}

                {/* T278 — Compliance detalhado */}
                {compliance && (
                  <div className="border-t border-border pt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground">Compliance Ryvano</p>
                      <p className="font-bold tabular-nums">{(compliance.overallScore / 10).toFixed(1)}<span className="text-muted-foreground text-xs font-normal">/10</span></p>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {Object.entries(compliance.breakdown as Record<string, number>).map(([dim, score]) => (
                        <div key={dim} className="text-center">
                          <p className="text-sm font-semibold tabular-nums">{(score / 10).toFixed(1)}</p>
                          <p className="text-xs text-muted-foreground capitalize">{dim}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* T280 — Feedback do atleta */}
                {feedback && (
                  <div className="border-t border-border pt-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Feedback do atleta</p>
                    <div className="flex gap-4 text-sm">
                      <span>RPE <strong>{feedback.rpe}</strong>/10</span>
                      {feedback.mood && <span>Humor <strong>{feedback.mood}</strong>/5</span>}
                      {feedback.energy && <span>Energia <strong>{feedback.energy}</strong>/5</span>}
                    </div>
                    {feedback.comment && (
                      <p className="text-xs text-muted-foreground mt-1 italic">"{feedback.comment}"</p>
                    )}
                  </div>
                )}

                {/* My evaluation */}
                {myEval && (
                  <div className="border-t border-border pt-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Sua avaliação</p>
                    <p className="font-bold tabular-nums">{displayScore(myEval.overallScore).toFixed(1)}<span className="text-muted-foreground text-xs font-normal">/10</span></p>
                    {myEval.note && <p className="text-xs text-muted-foreground mt-0.5 italic">"{myEval.note}"</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
