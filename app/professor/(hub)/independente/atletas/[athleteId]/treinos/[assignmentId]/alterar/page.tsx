/** SAM-59 — Alterar uma prescrição publicada (nova versão com diff), hub independente. */
import { PrescribeScreen } from "@/app/professor/_athlete-hub/prescribe-screen";
import { INDEPENDENT_SCOPE } from "@/app/professor/_athlete-hub/hub-scope";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ athleteId: string; assignmentId: string }> };

export default async function IndependentReviseWorkoutPage({ params }: PageProps) {
  const { athleteId, assignmentId } = await params;
  return <PrescribeScreen scope={INDEPENDENT_SCOPE} athleteId={athleteId} reviseAssignmentId={assignmentId} />;
}
