/**
 * T271 — Lista "Meus atletas" (visão do professor), hub de escola.
 * SAM-35 — screen shared with the independent roster: `app/professor/_athlete-hub/roster-screen.tsx`.
 */
import { RosterScreen } from "@/app/professor/_athlete-hub/roster-screen";
import { schoolScope } from "@/app/professor/_athlete-hub/hub-scope";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string }> };

export default async function MeusAtletasPage({ params }: PageProps) {
  const { schoolId } = await params;
  return <RosterScreen scope={schoolScope(schoolId)} />;
}
