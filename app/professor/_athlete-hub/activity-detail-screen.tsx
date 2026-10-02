/**
 * SAM-34 — Detalhe de uma atividade do atleta (visão do professor).
 *
 * The same `ActivityDetailView` the athlete opens in `/app/atividades/[id]`
 * (resumo, zonas, voltas, análise), read-only for the coach: no layout is
 * written anywhere. Above it, the prescribed × executed outcome and the link
 * to the prescription this activity fulfilled, when it is one of this scope.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityDetailView } from "@/components/activities/activity-detail-view";
import { StatusBadge } from "@/components/status-badge";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { GetCoachAthleteActivityDetail } from "@/modules/school/application/get-coach-athlete-activity-detail";
import { SchoolError } from "@/modules/school/domain/errors";
import { PRESCRIPTION_OUTCOME_LABELS } from "@/modules/school/presentation/workout-labels";
import { getActivityVisualDataWithSplitFallback } from "@/modules/strava/application/activities/activity-visual-with-split-fallback";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { outcomeTone } from "./activities-screen";
import { AthleteHubShell } from "./athlete-hub-shell";
import { athleteHubHref, hubBasePath, type CoachAthleteScope } from "./hub-scope";

// The provider enrichers are injected at the app layer, as in the workout detail.
const detail = new GetCoachAthleteActivityDetail(prisma, undefined, getActivityVisualDataWithSplitFallback);

export async function ActivityDetailScreen({
  scope,
  athleteId,
  activityId,
}: {
  scope: CoachAthleteScope;
  athleteId: string;
  activityId: string;
}) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();

  let data: Awaited<ReturnType<typeof detail.execute>>;
  try {
    data = await detail.execute(session.user.id, scope, athleteId, activityId);
  } catch (error) {
    if (error instanceof SchoolError) notFound();
    throw error;
  }
  if (!data.visualData) notFound();

  const { context, activity, prescription, outcome } = data;
  const base = hubBasePath(scope, athleteId);
  const athleteName = context.athlete.name ?? context.athlete.email ?? "Atleta";

  return (
    <AthleteHubShell
      scope={scope}
      athlete={context.athlete}
      teams={context.teams}
      currentCoach={context.currentCoach}
      isResponsibleCoach={context.isResponsibleCoach}
      active="atividades"
    >
      <ActivityDetailView
        activityName={activity.name}
        visualData={data.visualData}
        viewer={{ name: athleteName, image: context.athlete.image }}
        layoutEditable={false}
        before={(
          <div className="flex flex-wrap items-center gap-3 text-xs text-foreground/60" data-testid="activity-outcome">
            <Link href={athleteHubHref(scope, athleteId, "atividades")} className="underline-offset-4 hover:underline">
              ← Todas as atividades
            </Link>
            {outcome
              ? <StatusBadge tone={outcomeTone(outcome)}>{PRESCRIPTION_OUTCOME_LABELS[outcome]}</StatusBadge>
              : <StatusBadge tone="neutral">Prescrição de outro vínculo</StatusBadge>}
            {prescription && (
              <Link href={`${base}/treinos/${prescription.assignmentId}`} className="underline-offset-4 hover:underline">
                {`Prescrição: ${prescription.title}`}
              </Link>
            )}
          </div>
        )}
      />
    </AthleteHubShell>
  );
}
