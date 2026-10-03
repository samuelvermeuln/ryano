/**
 * SAM-30 — Detalhe de uma prescrição SEM escola (professor independente).
 *
 * `/atleta/[schoolId]/treinos/[id]` only opens assignments of that school, so a
 * prescription written by an independent coach had no detail page at all (the
 * calendar card linked to "#"). This route serves exactly those rows: the
 * viewer's own, `schoolId` NULL, with a workout. Marketplace-licence sessions
 * keep their own home in `/app/planos/<license>`.
 *
 * Change requests are a school feature (`WORKOUT_CHANGE_REQUEST_NO_SCHOOL`);
 * outside one the athlete talks to the coach through the comments, so that
 * lever is not offered here. Comments, absence, review request and feedback
 * already work without a school.
 */
import { notFound, redirect } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { resolveAthleteTimeZone } from "@/modules/school/application/athlete-time-zone";
import { canReceivePlannedWorkouts } from "@/modules/school/application/planned-workout-steps";
import { prescriptionVersionsOf } from "@/modules/school/application/prescription-revisions";
import { sessionExecutionView } from "@/modules/school/application/session-feedback";
import { loadMatchPanel } from "@/modules/school/application/match-audit";
import { reviewOfAssignment } from "@/modules/school/application/coach-reviews";
import { loadOpenWaterView } from "@/modules/school/application/open-water-sessions";
import { loadBlockComparison } from "@/modules/school/application/block-comparison";
import { matchPanelModel } from "@/modules/school/presentation/match-panel-model";
import { ATHLETE_WORKOUT_DETAIL_INCLUDE } from "@/app/atleta/[schoolId]/treinos/[assignmentId]/workout-detail-query";
import { AthleteWorkoutDetailView } from "@/app/atleta/[schoolId]/treinos/[assignmentId]/workout-detail-view";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ assignmentId: string }> };

export default async function IndependentWorkoutDetailPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { assignmentId } = await params;

  const [assignment, hasPlannedWorkoutConnection, timeZone] = await Promise.all([
    prisma.workoutAssignment.findUnique({
      where: { id: assignmentId },
      include: ATHLETE_WORKOUT_DETAIL_INCLUDE,
    }),
    // SAM-49 — by capability, never by the provider's name.
    canReceivePlannedWorkouts(prisma, session.user.id),
    // No school, so no school zone: the athlete's own preference (or the platform default).
    resolveAthleteTimeZone(prisma, session.user.id),
  ]);

  if (!assignment || assignment.athleteId !== session.user.id) notFound();
  // A school prescription has its own route, with the school's guards and zone.
  if (assignment.schoolId !== null) redirect(`/atleta/${assignment.schoolId}/treinos/${assignment.id}`);
  // A marketplace session is read inside its plan.
  if (assignment.trainingLicenseId) redirect(`/app/planos/${assignment.trainingLicenseId}`);
  if (!assignment.workout) notFound();

  const canPushToWatch = hasPlannedWorkoutConnection &&
    ["SCHEDULED", "AVAILABLE"].includes(assignment.status) &&
    assignment.garminPushStatus !== "PUSHED";

  return (
    <AthleteWorkoutDetailView
      assignment={{ ...assignment, workout: assignment.workout }}
      viewerId={session.user.id}
      backHref="/app/treinos"
      backLabel="Meus treinos"
      timeZone={timeZone}
      canRequestChange={false}
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
