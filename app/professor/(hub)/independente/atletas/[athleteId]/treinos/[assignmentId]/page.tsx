/** SAM-30 — Detalhe de um treino de um atleta independente (visão do professor). */
import { WorkoutDetailScreen } from "@/app/professor/_athlete-hub/workout-detail-screen";
import { INDEPENDENT_SCOPE } from "@/app/professor/_athlete-hub/hub-scope";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ athleteId: string; assignmentId: string }> };

export default async function IndependentAthleteWorkoutDetailPage({ params }: PageProps) {
  const { athleteId, assignmentId } = await params;
  return <WorkoutDetailScreen scope={INDEPENDENT_SCOPE} athleteId={athleteId} assignmentId={assignmentId} />;
}
