/**
 * T295 — Detalhe do treino (visão do atleta), rota de escola.
 * The body lives in `workout-detail-view.tsx`, shared with the school-less
 * `/app/treinos/[assignmentId]` (SAM-30); this page keeps the school guards.
 */
import { notFound } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { prescriptionVersionsOf } from "@/modules/school/application/prescription-revisions";
import { sessionExecutionView } from "@/modules/school/application/session-feedback";
import { loadMatchPanel } from "@/modules/school/application/match-audit";
import { reviewOfAssignment } from "@/modules/school/application/coach-reviews";
import { loadOpenWaterView } from "@/modules/school/application/open-water-sessions";
import { loadBlockComparison } from "@/modules/school/application/block-comparison";
import { matchPanelModel } from "@/modules/school/presentation/match-panel-model";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { plannedWorkoutProviderFor, sessionExportable } from "@/modules/school/application/planned-workout-steps";
import { ATHLETE_WORKOUT_DETAIL_INCLUDE } from "./workout-detail-query";
import { AthleteWorkoutDetailView } from "./workout-detail-view";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string; assignmentId: string }> };

export default async function WorkoutDetailPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId, assignmentId } = await params;

  const [assignment, hasPlannedWorkoutConnection] = await Promise.all([
    prisma.workoutAssignment.findUnique({
      where: { id: assignmentId },
      include: ATHLETE_WORKOUT_DETAIL_INCLUDE,
    }),
    // SAM-49 — by capability, never by the provider's name.
    plannedWorkoutProviderFor(prisma, session.user.id),
  ]);

  if (!assignment || assignment.athleteId !== session.user.id || assignment.schoolId !== schoolId) notFound();
  if (!assignment.workout) notFound();

  const canPushToWatch = sessionExportable(assignment.workout?.snapshotPayload ?? null, hasPlannedWorkoutConnection) &&
    ["SCHEDULED", "AVAILABLE"].includes(assignment.status) &&
    assignment.garminPushStatus !== "PUSHED";

  return (
    <AthleteWorkoutDetailView
      assignment={{ ...assignment, workout: assignment.workout }}
      viewerId={session.user.id}
      backHref={`/atleta/${schoolId}/calendario`}
      backLabel="Calendário"
      // SAM-16 — the scheduled time reads in the school's zone, the same clock the coach typed it in.
      timeZone={assignment.school?.timezone ?? "America/Sao_Paulo"}
      canRequestChange={assignment.coachId !== null}
      canPushToWatch={canPushToWatch}
      versions={await prescriptionVersionsOf(prisma, assignment)}
      executionView={await sessionExecutionView(prisma, {
        id: assignment.id, status: assignment.status, scheduledAt: assignment.scheduledAt, schoolId: assignment.schoolId, coachId: assignment.coachId,
        hasMatchedExecution: assignment.executions.length > 0, blocks: assignment.workout?.blocks ?? [],
      })}
      matchPanel={matchPanelModel(await loadMatchPanel(prisma, assignment.id))}
      review={await reviewOfAssignment(prisma, assignment.id, { visibleOnly: true })}
      openWater={await loadOpenWaterView(prisma, assignment.id)}
      blockComparison={await loadBlockComparison(prisma, assignment.id).catch(() => null)}
    />
  );
}
