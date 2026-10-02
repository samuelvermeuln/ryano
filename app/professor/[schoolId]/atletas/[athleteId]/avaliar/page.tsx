/**
 * T279 — Formulário de avaliação do coach, hub de escola.
 * Route: /professor/[schoolId]/atletas/[athleteId]/avaliar?execId=[id]
 * Screen shared with the independent hub (SAM-30): `app/professor/_athlete-hub`.
 */
import { EvaluateScreen } from "@/app/professor/_athlete-hub/evaluate-screen";
import { schoolScope } from "@/app/professor/_athlete-hub/hub-scope";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ schoolId: string; athleteId: string }>;
  searchParams: Promise<{ execId?: string }>;
};

export default async function AvaliarPage({ params, searchParams }: PageProps) {
  const { schoolId, athleteId } = await params;
  const { execId } = await searchParams;
  return <EvaluateScreen scope={schoolScope(schoolId)} athleteId={athleteId} execId={execId} />;
}
