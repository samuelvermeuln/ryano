/** SAM-36 — Calendário do coach independente: prescrito × executado dos seus atletas, no seu horário. */
import { AgendaScreen } from "@/app/professor/_agenda/agenda-screen";
import type { AgendaQuery } from "@/app/professor/_agenda/agenda-paths";
import { INDEPENDENT_SCOPE } from "@/app/professor/_athlete-hub/hub-scope";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<AgendaQuery> };

export default async function IndependentCalendarPage({ searchParams }: PageProps) {
  return <AgendaScreen scope={INDEPENDENT_SCOPE} query={await searchParams} />;
}
