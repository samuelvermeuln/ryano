/**
 * SAM-11 — Detalhe de um treino do atleta (visão do professor), hub de escola.
 * Screen shared with the independent hub (SAM-30): `app/professor/_athlete-hub`.
 */
import { WorkoutDetailScreen } from "@/app/professor/_athlete-hub/workout-detail-screen";
import { schoolScope } from "@/app/professor/_athlete-hub/hub-scope";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ schoolId: string; athleteId: string; assignmentId: string }>;
};

export default async function AthleteWorkoutDetailPage({ params }: PageProps) {
  const { schoolId, athleteId, assignmentId } = await params;
  return <WorkoutDetailScreen scope={schoolScope(schoolId)} athleteId={athleteId} assignmentId={assignmentId} />;
}
