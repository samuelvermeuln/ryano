/**
 * SAM-11 — Histórico do atleta (visão do professor), hub de escola.
 * Screen shared with the independent hub (SAM-30): `app/professor/_athlete-hub`.
 */
import { HistoryScreen } from "@/app/professor/_athlete-hub/history-screen";
import { schoolScope } from "@/app/professor/_athlete-hub/hub-scope";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ schoolId: string; athleteId: string }>;
  searchParams: Promise<{ cursor?: string }>;
};

export default async function AthleteHistoryPage({ params, searchParams }: PageProps) {
  const { schoolId, athleteId } = await params;
  const { cursor } = await searchParams;
  return <HistoryScreen scope={schoolScope(schoolId)} athleteId={athleteId} cursor={cursor} />;
}
