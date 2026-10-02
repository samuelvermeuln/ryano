/** SAM-34 — Detalhe de uma atividade de um atleta independente (visão do professor). */
import { ActivityDetailScreen } from "@/app/professor/_athlete-hub/activity-detail-screen";
import { INDEPENDENT_SCOPE } from "@/app/professor/_athlete-hub/hub-scope";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ athleteId: string; activityId: string }> };

export default async function IndependentAthleteActivityDetailPage({ params }: PageProps) {
  const { athleteId, activityId } = await params;
  return <ActivityDetailScreen scope={INDEPENDENT_SCOPE} athleteId={athleteId} activityId={activityId} />;
}
