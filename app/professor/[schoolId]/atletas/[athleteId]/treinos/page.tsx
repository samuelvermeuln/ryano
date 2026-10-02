/**
 * SAM-11 — Treinos do atleta (visão do professor), hub de escola.
 * Screen shared with the independent hub (SAM-30): `app/professor/_athlete-hub`.
 */
import { WorkoutsScreen, type WorkoutsSearchParams } from "@/app/professor/_athlete-hub/workouts-screen";
import { schoolScope } from "@/app/professor/_athlete-hub/hub-scope";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ schoolId: string; athleteId: string }>;
  searchParams: Promise<WorkoutsSearchParams>;
};

export default async function AthleteWorkoutsPage({ params, searchParams }: PageProps) {
  const { schoolId, athleteId } = await params;
  return <WorkoutsScreen scope={schoolScope(schoolId)} athleteId={athleteId} query={await searchParams} />;
}
