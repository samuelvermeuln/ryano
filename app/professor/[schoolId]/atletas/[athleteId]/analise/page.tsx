/**
 * SAM-11 — Análise do atleta (visão do professor), hub de escola.
 * Screen shared with the independent hub (SAM-30): `app/professor/_athlete-hub`.
 */
import { AnalysisScreen, type AnalysisSearchParams } from "@/app/professor/_athlete-hub/analysis-screen";
import { schoolScope } from "@/app/professor/_athlete-hub/hub-scope";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ schoolId: string; athleteId: string }>;
  searchParams: Promise<AnalysisSearchParams>;
};

export default async function AthleteAnalysisPage({ params, searchParams }: PageProps) {
  const { schoolId, athleteId } = await params;
  return <AnalysisScreen scope={schoolScope(schoolId)} athleteId={athleteId} query={await searchParams} />;
}
