/** SAM-76 — Relatório de evolução da preparação (escola). */
import { PreparationReportScreen } from "@/app/professor/_athlete-hub/preparation-report-screen";

export const dynamic = "force-dynamic";

export default async function SchoolPreparationReportPage({ params }: { params: Promise<{ schoolId: string; athleteId: string; participationId: string }> }) {
  const { schoolId, athleteId, participationId } = await params;
  return <PreparationReportScreen scope={{ kind: "school", schoolId }} athleteId={athleteId} participationId={participationId} />;
}