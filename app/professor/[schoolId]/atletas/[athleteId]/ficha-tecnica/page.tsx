/**
 * SAM-11 — Ficha técnica do atleta, hub de escola.
 * Screen shared with the independent hub (SAM-30): `app/professor/_athlete-hub`.
 */
import { TechnicalSheetScreen } from "@/app/professor/_athlete-hub/technical-sheet-screen";
import { schoolScope } from "@/app/professor/_athlete-hub/hub-scope";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string; athleteId: string }> };

export default async function AthleteTechnicalSheetPage({ params }: PageProps) {
  const { schoolId, athleteId } = await params;
  return <TechnicalSheetScreen scope={schoolScope(schoolId)} athleteId={athleteId} />;
}
