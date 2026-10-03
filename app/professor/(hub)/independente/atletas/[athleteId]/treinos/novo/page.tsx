/** SAM-30 — Prescrever treino para um atleta independente. */
import { PrescribeScreen } from "@/app/professor/_athlete-hub/prescribe-screen";
import { INDEPENDENT_SCOPE } from "@/app/professor/_athlete-hub/hub-scope";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ athleteId: string }>; searchParams: Promise<{ modelo?: string; rascunho?: string; erro?: string }> };

export default async function IndependentPrescribeWorkoutPage({ params, searchParams }: PageProps) {
  const { athleteId } = await params;
  const search = await searchParams;
  return <PrescribeScreen scope={INDEPENDENT_SCOPE} athleteId={athleteId} templateId={search.modelo ?? null} draftId={search.rascunho ?? null} publishError={search.erro ?? null} />;
}
