/** SAM-30 — Histórico de um atleta independente (visão do professor). */
import { HistoryScreen } from "@/app/professor/_athlete-hub/history-screen";
import { INDEPENDENT_SCOPE } from "@/app/professor/_athlete-hub/hub-scope";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ athleteId: string }>;
  searchParams: Promise<{ cursor?: string }>;
};

export default async function IndependentAthleteHistoryPage({ params, searchParams }: PageProps) {
  const { athleteId } = await params;
  const { cursor } = await searchParams;
  return <HistoryScreen scope={INDEPENDENT_SCOPE} athleteId={athleteId} cursor={cursor} />;
}
