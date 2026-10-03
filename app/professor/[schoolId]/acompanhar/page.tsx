/** SAM-67 — "Acompanhamento" do professor dentro de uma escola. */
import { FollowUpOverviewScreen } from "@/app/professor/_acompanhar/follow-up-overview-screen";

export const dynamic = "force-dynamic";

export default async function SchoolCoachFollowUpOverviewPage({ params, searchParams }: { params: Promise<{ schoolId: string }>; searchParams: Promise<{ lista?: string; dias?: string }> }) {
  const { schoolId } = await params;
  const { lista, dias } = await searchParams;
  return <FollowUpOverviewScreen schoolId={schoolId} basePath={`/professor/${schoolId}/acompanhar`} lista={lista} dias={dias} />;
}