/**
 * SAM-30 — Resumo de um atleta independente (sem escola).
 * Same screen as `/professor/[schoolId]/atletas/[athleteId]`, resolved through
 * the coach's own ACTIVE independent link instead of a school membership.
 */
import { OverviewScreen } from "@/app/professor/_athlete-hub/overview-screen";
import { INDEPENDENT_SCOPE } from "@/app/professor/_athlete-hub/hub-scope";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ athleteId: string }> };

export default async function IndependentAthleteOverviewPage({ params }: PageProps) {
  const { athleteId } = await params;
  return <OverviewScreen scope={INDEPENDENT_SCOPE} athleteId={athleteId} />;
}
