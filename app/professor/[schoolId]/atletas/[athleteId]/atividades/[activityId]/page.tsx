/** SAM-34 — Detalhe de uma atividade do atleta (visão do professor), hub de escola. */
import { ActivityDetailScreen } from "@/app/professor/_athlete-hub/activity-detail-screen";
import { schoolScope } from "@/app/professor/_athlete-hub/hub-scope";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string; athleteId: string; activityId: string }> };

export default async function AthleteActivityDetailPage({ params }: PageProps) {
  const { schoolId, athleteId, activityId } = await params;
  return <ActivityDetailScreen scope={schoolScope(schoolId)} athleteId={athleteId} activityId={activityId} />;
}
