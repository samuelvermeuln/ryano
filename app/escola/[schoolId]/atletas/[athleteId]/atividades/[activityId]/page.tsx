/**
 * SAM-37 — Detalhe de uma atividade do atleta na administração da escola:
 * the same `ActivityDetailView` the athlete and the coach see, read-only,
 * with the prescribed × executed outcome above it.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityDetailView, activityProviderLabel } from "@/components/activities/activity-detail-view";
import { outcomeTone } from "@/components/activities/athlete-activities-list";
import { loadActivityDetailModel, loadSavedActivityLayout } from "@/modules/shared/activities/presentation/load-activity-detail-model";
import { StatusBadge } from "@/components/status-badge";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { GetCoachAthleteActivityDetail } from "@/modules/school/application/get-coach-athlete-activity-detail";
import { SchoolError } from "@/modules/school/domain/errors";
import { PRESCRIPTION_OUTCOME_LABELS } from "@/modules/school/presentation/workout-labels";
import { getActivityVisualDataWithSplitFallback } from "@/modules/strava/application/activities/activity-visual-with-split-fallback";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string; athleteId: string; activityId: string }> };

const detail = new GetCoachAthleteActivityDetail(prisma, undefined, getActivityVisualDataWithSplitFallback);

export default async function SchoolAthleteActivityDetailPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId, athleteId, activityId } = await params;

  let data: Awaited<ReturnType<typeof detail.execute>>;
  try {
    data = await detail.execute(session.user.id, { kind: "school-admin", schoolId }, athleteId, activityId);
  } catch (error) {
    if (error instanceof SchoolError) notFound();
    throw error;
  }
  if (!data.visualData) notFound();

  const { context, prescription, outcome } = data;
  const base = `/escola/${schoolId}/atletas/${athleteId}`;
  const athleteName = context.athlete.name ?? context.athlete.email ?? "Atleta";
  const [model, savedLayout] = await Promise.all([
    loadActivityDetailModel(prisma, data.activityRow, data.visualData, activityProviderLabel),
    loadSavedActivityLayout(prisma, session.user.id),
  ]);

  return (
    <div className="space-y-6">
      <ActivityDetailView
        model={model}
        athlete={{ name: athleteName, image: context.athlete.image }}
        viewerKind="school"
        savedLayout={savedLayout}
        before={(
          <div className="flex flex-wrap items-center gap-3 text-xs text-foreground/60" data-testid="activity-outcome">
            <Link href={`${base}/atividades`} className="underline-offset-4 hover:underline">
              ← Atividades de {athleteName}
            </Link>
            {outcome
              ? <StatusBadge tone={outcomeTone(outcome)}>{PRESCRIPTION_OUTCOME_LABELS[outcome]}</StatusBadge>
              : <StatusBadge tone="neutral">Prescrição de outro vínculo</StatusBadge>}
            {prescription && <span>{`Prescrição: ${prescription.title}`}</span>}
          </div>
        )}
      />
    </div>
  );
}
