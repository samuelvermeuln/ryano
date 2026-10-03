/** SAM-67 — "Acompanhamento" do professor (todas as escolas e o independente). */
import { FollowUpOverviewScreen } from "@/app/professor/_acompanhar/follow-up-overview-screen";

export const dynamic = "force-dynamic";

export default async function CoachFollowUpOverviewPage({ searchParams }: { searchParams: Promise<{ lista?: string; dias?: string }> }) {
  const { lista, dias } = await searchParams;
  return <FollowUpOverviewScreen schoolId={null} basePath="/professor/acompanhar" lista={lista} dias={dias} />;
}