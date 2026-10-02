/** SAM-30 — Análise de um atleta independente (visão do professor). */
import { AnalysisScreen, type AnalysisSearchParams } from "@/app/professor/_athlete-hub/analysis-screen";
import { INDEPENDENT_SCOPE } from "@/app/professor/_athlete-hub/hub-scope";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ athleteId: string }>;
  searchParams: Promise<AnalysisSearchParams>;
};

export default async function IndependentAthleteAnalysisPage({ params, searchParams }: PageProps) {
  const { athleteId } = await params;
  return <AnalysisScreen scope={INDEPENDENT_SCOPE} athleteId={athleteId} query={await searchParams} />;
}
