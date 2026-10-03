/** SAM-76 — Relatório de evolução da preparação (independente). */
import { PreparationReportScreen } from "@/app/professor/_athlete-hub/preparation-report-screen";
import { INDEPENDENT_SCOPE } from "@/app/professor/_athlete-hub/hub-scope";
export const dynamic = "force-dynamic";

export default async function IndependentPreparationReportPage({ params }: { params: Promise<{ athleteId: string; participationId: string }> }) {
  const { athleteId, participationId } = await params;
  return <PreparationReportScreen scope={INDEPENDENT_SCOPE} athleteId={athleteId} participationId={participationId} />;
}