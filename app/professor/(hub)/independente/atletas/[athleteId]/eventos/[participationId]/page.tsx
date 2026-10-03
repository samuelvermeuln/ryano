/** SAM-66 — Um evento do atleta (independente): resultado, parecer pós-evento e encerramento. */
import { EventScreen } from "@/app/professor/_athlete-hub/event-screen";
import { INDEPENDENT_SCOPE } from "@/app/professor/_athlete-hub/hub-scope";
export const dynamic = "force-dynamic";

export default async function IndependentEventPage({ params }: { params: Promise<{ athleteId: string; participationId: string }> }) {
  const { athleteId, participationId } = await params;
  return <EventScreen scope={INDEPENDENT_SCOPE} athleteId={athleteId} participationId={participationId} />;
}