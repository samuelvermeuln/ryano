/** SAM-34 — Atividades do atleta (visão do professor), hub de escola. */
import { ActivitiesScreen, type ActivitiesSearchParams } from "@/app/professor/_athlete-hub/activities-screen";
import { schoolScope } from "@/app/professor/_athlete-hub/hub-scope";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ schoolId: string; athleteId: string }>;
  searchParams: Promise<ActivitiesSearchParams>;
};

export default async function AthleteActivitiesPage({ params, searchParams }: PageProps) {
  const { schoolId, athleteId } = await params;
  return <ActivitiesScreen scope={schoolScope(schoolId)} athleteId={athleteId} query={await searchParams} />;
}
