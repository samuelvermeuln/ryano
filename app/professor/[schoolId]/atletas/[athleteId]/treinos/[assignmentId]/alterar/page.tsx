/** SAM-59 — Alterar uma prescrição publicada (nova versão com diff), hub de escola. */
import { PrescribeScreen } from "@/app/professor/_athlete-hub/prescribe-screen";
import { schoolScope } from "@/app/professor/_athlete-hub/hub-scope";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string; athleteId: string; assignmentId: string }> };

export default async function ReviseWorkoutPage({ params }: PageProps) {
  const { schoolId, athleteId, assignmentId } = await params;
  return <PrescribeScreen scope={schoolScope(schoolId)} athleteId={athleteId} reviseAssignmentId={assignmentId} />;
}
