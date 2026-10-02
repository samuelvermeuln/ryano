/**
 * SAM-11 — Resumo do atleta (central do professor), hub de escola.
 * The screen itself lives in `app/professor/_athlete-hub` and is shared with the
 * independent hub (SAM-30); this route only names the scope.
 */
import { OverviewScreen } from "@/app/professor/_athlete-hub/overview-screen";
import { schoolScope } from "@/app/professor/_athlete-hub/hub-scope";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string; athleteId: string }> };

export default async function AthleteOverviewPage({ params }: PageProps) {
  const { schoolId, athleteId } = await params;
  return <OverviewScreen scope={schoolScope(schoolId)} athleteId={athleteId} />;
}
