/**
 * SAM-16 — Agenda semanal do professor, hub de escola.
 * SAM-36 — screen shared with the independent calendar: `app/professor/_agenda/agenda-screen.tsx`.
 */
import { AgendaScreen } from "@/app/professor/_agenda/agenda-screen";
import type { AgendaQuery } from "@/app/professor/_agenda/agenda-paths";
import { schoolScope } from "@/app/professor/_athlete-hub/hub-scope";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string }>; searchParams: Promise<AgendaQuery> };

export default async function AgendaPage({ params, searchParams }: PageProps) {
  const { schoolId } = await params;
  return <AgendaScreen scope={schoolScope(schoolId)} query={await searchParams} />;
}
