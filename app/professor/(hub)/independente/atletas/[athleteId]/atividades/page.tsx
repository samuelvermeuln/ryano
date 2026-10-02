/** SAM-34 — Atividades de um atleta independente (visão do professor). */
import { ActivitiesScreen, type ActivitiesSearchParams } from "@/app/professor/_athlete-hub/activities-screen";
import { INDEPENDENT_SCOPE } from "@/app/professor/_athlete-hub/hub-scope";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ athleteId: string }>;
  searchParams: Promise<ActivitiesSearchParams>;
};

export default async function IndependentAthleteActivitiesPage({ params, searchParams }: PageProps) {
  const { athleteId } = await params;
  return <ActivitiesScreen scope={INDEPENDENT_SCOPE} athleteId={athleteId} query={await searchParams} />;
}
