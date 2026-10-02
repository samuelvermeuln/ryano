/**
 * SAM-11 — Prescrever treino para um atleta, hub de escola.
 * Screen shared with the independent hub (SAM-30): `app/professor/_athlete-hub`.
 */
import { PrescribeScreen } from "@/app/professor/_athlete-hub/prescribe-screen";
import { schoolScope } from "@/app/professor/_athlete-hub/hub-scope";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string; athleteId: string }> };

export default async function PrescribeWorkoutPage({ params }: PageProps) {
  const { schoolId, athleteId } = await params;
  return <PrescribeScreen scope={schoolScope(schoolId)} athleteId={athleteId} />;
}
