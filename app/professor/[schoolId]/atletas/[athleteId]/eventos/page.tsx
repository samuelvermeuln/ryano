/** SAM-66 — Eventos de um atleta (escola). */
import { EventsScreen } from "@/app/professor/_athlete-hub/events-screen";

export const dynamic = "force-dynamic";

export default async function SchoolEventsPage({ params }: { params: Promise<{ schoolId: string; athleteId: string }> }) {
  const { schoolId, athleteId } = await params;
  return <EventsScreen scope={{ kind: "school", schoolId }} athleteId={athleteId} />;
}