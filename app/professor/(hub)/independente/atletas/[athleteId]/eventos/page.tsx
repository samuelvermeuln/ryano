/** SAM-66 — Eventos de um atleta (independente). */
import { EventsScreen } from "@/app/professor/_athlete-hub/events-screen";
import { INDEPENDENT_SCOPE } from "@/app/professor/_athlete-hub/hub-scope";
export const dynamic = "force-dynamic";

export default async function IndependentEventsPage({ params }: { params: Promise<{ athleteId: string }> }) {
  const { athleteId } = await params;
  return <EventsScreen scope={INDEPENDENT_SCOPE} athleteId={athleteId} />;
}