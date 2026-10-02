/** SAM-30 — Avaliar uma execução de um atleta independente (?execId=). */
import { EvaluateScreen } from "@/app/professor/_athlete-hub/evaluate-screen";
import { INDEPENDENT_SCOPE } from "@/app/professor/_athlete-hub/hub-scope";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ athleteId: string }>;
  searchParams: Promise<{ execId?: string }>;
};

export default async function IndependentAvaliarPage({ params, searchParams }: PageProps) {
  const { athleteId } = await params;
  const { execId } = await searchParams;
  return <EvaluateScreen scope={INDEPENDENT_SCOPE} athleteId={athleteId} execId={execId} />;
}
