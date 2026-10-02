/** SAM-30 — Ficha técnica de um atleta independente, chaveada por (professor, atleta). */
import { TechnicalSheetScreen } from "@/app/professor/_athlete-hub/technical-sheet-screen";
import { INDEPENDENT_SCOPE } from "@/app/professor/_athlete-hub/hub-scope";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ athleteId: string }> };

export default async function IndependentAthleteTechnicalSheetPage({ params }: PageProps) {
  const { athleteId } = await params;
  return <TechnicalSheetScreen scope={INDEPENDENT_SCOPE} athleteId={athleteId} />;
}
