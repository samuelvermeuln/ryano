import { ActivityDataQuality } from "@/components/activities/activity-data-quality";
import { ActivitySegmentsSection } from "@/components/activities/activity-segments";
import { notFound } from "next/navigation";

import { ActivityDetailView, activityProviderLabel } from "@/components/activities/activity-detail-view";
import { SectionCard } from "@/components/section-card";
import { SessionFeedbackForm } from "@/components/workouts/session-feedback-form";
import { loadActivityDetailModel, loadSavedActivityLayout } from "@/modules/shared/activities/presentation/load-activity-detail-model";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { getActivityVisualDataWithSplitFallback } from "@/modules/strava/application/activities/activity-visual-with-split-fallback";

export const dynamic = "force-dynamic";

export default async function ActivityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireOnboardedSession();
  const { id } = await params;

  const activity = await prisma.activity.findFirst({ where: { id, userId: session.user.id } });
  if (!activity) {
    notFound();
  }

  // SAM-17 — the Garmin → Strava splits fallback is shared with the coach's
  // workout detail; see the helper for the rule. SAM-40 — the screen itself is
  // the shared `ActivityDetailView` fed by the rich detail model.
  const visualData = await getActivityVisualDataWithSplitFallback(activity);
  const [model, savedLayout, linked, feedback] = await Promise.all([
    loadActivityDetailModel(prisma, activity, visualData, activityProviderLabel),
    loadSavedActivityLayout(prisma, session.user.id),
    // SAM-61 — an activity matched to a prescription is reported there; only an unplanned one gets its own report here.
    prisma.workoutExecution.findFirst({ where: { activityId: activity.id, matchStatus: { in: ["AUTO_MATCHED", "CONFIRMED", "OVERRIDDEN"] } }, select: { id: true } }),
    prisma.athleteFeedback.findUnique({ where: { activityId: activity.id } }),
  ]);

  return (
    <>
      <ActivityDetailView
        model={model}
        athlete={{ name: session.user.name ?? session.user.email ?? "Usuário", image: session.user.image }}
        viewerKind="athlete"
        savedLayout={savedLayout}
      />
      {/* SAM-73 — corrections with the original preserved, times and GPS flags. */}
      <div className="mt-5"><ActivityDataQuality activityId={activity.id} canCorrect /></div>
      {/* SAM-75 — the provider's legs with T1/T2, copies counted once, and trechos selected for prescriptions. */}
      <div className="mt-5"><ActivitySegmentsSection activityId={activity.id} canSelect linkableSessions={await sameDaySessions(activity)} /></div>
      {!linked && (
        <div className="mt-5">
          <SectionCard title="Seu relato desta atividade" description="Atividade fora do plano: conte como foi. Seu professor decide se ela substitui algo — nada muda sozinho.">
            <SessionFeedbackForm
              activityId={activity.id}
              existing={feedback ? {
                completion: null, rpe: feedback.rpe, difficulty: feedback.difficulty, adaptationReason: feedback.adaptationReason,
                adaptationNote: feedback.adaptationNote, painReported: feedback.painReported, painNote: feedback.painNote,
                comment: feedback.comment, attachmentUrl: feedback.attachmentUrl,
              } : null}
              rpeRequested={false}
              hasExecution
            />
          </SectionCard>
        </div>
      )}
    </>
  );
}

/** The athlete's prescriptions within a day of the activity: the ones a trecho may answer. */
async function sameDaySessions(activity: { userId: string; startedAt: Date }) {
  const rows = await prisma.workoutAssignment.findMany({
    where: { athleteId: activity.userId, status: { not: "CANCELLED" }, scheduledAt: { gte: new Date(activity.startedAt.getTime() - 86_400_000), lte: new Date(activity.startedAt.getTime() + 86_400_000) } },
    orderBy: { scheduledAt: "asc" }, take: 10, select: { id: true, workout: { select: { title: true } } },
  });
  return rows.map((row) => ({ id: row.id, title: row.workout?.title ?? "Sessão" }));
}
