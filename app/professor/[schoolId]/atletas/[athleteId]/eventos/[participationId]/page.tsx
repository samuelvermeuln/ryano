/** SAM-66 — Um evento do atleta (escola): resultado, parecer pós-evento e encerramento. */
import { EventScreen } from "@/app/professor/_athlete-hub/event-screen";

export const dynamic = "force-dynamic";

export default async function SchoolEventPage({ params }: { params: Promise<{ schoolId: string; athleteId: string; participationId: string }> }) {
  const { schoolId, athleteId, participationId } = await params;
  return <EventScreen scope={{ kind: "school", schoolId }} athleteId={athleteId} participationId={participationId} />;
}