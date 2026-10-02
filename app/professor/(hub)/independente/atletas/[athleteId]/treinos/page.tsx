/** SAM-30 — Treinos de um atleta independente (visão do professor). */
import { WorkoutsScreen, type WorkoutsSearchParams } from "@/app/professor/_athlete-hub/workouts-screen";
import { INDEPENDENT_SCOPE } from "@/app/professor/_athlete-hub/hub-scope";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ athleteId: string }>;
  searchParams: Promise<WorkoutsSearchParams>;
};

export default async function IndependentAthleteWorkoutsPage({ params, searchParams }: PageProps) {
  const { athleteId } = await params;
  return <WorkoutsScreen scope={INDEPENDENT_SCOPE} athleteId={athleteId} query={await searchParams} />;
}
