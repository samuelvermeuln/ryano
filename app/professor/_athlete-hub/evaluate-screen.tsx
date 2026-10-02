/**
 * T279 — Formulário de avaliação do coach.
 * Routes: /professor/[schoolId]/atletas/[athleteId]/avaliar?execId=[id] and, since
 * SAM-30, /professor/independente/atletas/[athleteId]/avaliar?execId=[id].
 *
 * Inside a school the use case (`CreateCoachEvaluation`) checks the coach's
 * membership; outside one it checks that the execution belongs to this coach's
 * own independent prescription. The screen mirrors that second rule so an
 * independent coach never sees a form the API would refuse.
 */
import { notFound } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { EvaluationForm } from "./evaluation-form";
import { hubBasePath, type CoachAthleteScope } from "./hub-scope";

export async function EvaluateScreen({
  scope,
  athleteId,
  execId,
}: {
  scope: CoachAthleteScope;
  athleteId: string;
  execId: string | undefined;
}) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  if (!execId) notFound();

  const coachProfile = await prisma.coachProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!coachProfile) notFound();

  const execution = await prisma.workoutExecution.findUnique({
    where: { id: execId },
    include: {
      assignment: { include: { workout: { select: { title: true } } } },
      evaluations: { where: { coachId: coachProfile.id }, select: { id: true, overallScore: true, note: true, isVisible: true } },
    },
  });
  if (!execution || execution.athleteId !== athleteId) notFound();
  if (
    scope.kind === "independent"
    && (execution.assignment.schoolId !== null || execution.assignment.coachId !== coachProfile.id)
  ) {
    notFound();
  }

  const existing = execution.evaluations[0] ?? null;

  return (
    <div className="p-6 md:p-10 max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Avaliar execução</h1>
        <p className="text-sm text-muted-foreground mt-1">{execution.assignment.workout?.title ?? "Treino"}</p>
        <p className="text-xs text-muted-foreground">
          {new Date(execution.startedAt).toLocaleDateString("pt-BR")} · {execution.sportType}
        </p>
      </div>

      <EvaluationForm
        executionId={execId}
        schoolId={scope.kind === "school" ? scope.schoolId : null}
        returnHref={hubBasePath(scope, athleteId)}
        existing={existing}
      />
    </div>
  );
}
