import { notFound } from "next/navigation";

import { ActivityVisualDashboard } from "@/components/activities/activity-visual-dashboard";
import { EmptyState } from "@/components/empty-state";
import { SectionCard } from "@/components/section-card";
import { requireOnboardedUser } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { getGarminActivityVisualData } from "@/server/services/garmin-activity-details";

export const dynamic = "force-dynamic";

export default async function ActivityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOnboardedUser();
  const { id } = await params;

  const activity = await prisma.activity.findFirst({
    where: {
      id,
      userId: user.id,
    },
  });

  if (!activity) {
    notFound();
  }

  const visualData = await getGarminActivityVisualData(activity);

  return (
    <>
      {visualData ? (
        <ActivityVisualDashboard
          title={activity.name ?? visualData.sportLabel}
          sportLabel={visualData.sportLabel}
          provider={visualData.provider}
          startedAtLabel={visualData.startedAtLabel}
          heroStats={visualData.heroStats}
          overviewMetrics={visualData.overviewMetrics}
          barSections={visualData.barSections}
          metricSections={visualData.metricSections}
        />
      ) : null}

      <SectionCard title="Dados técnicos Garmin" description="Blocos reais retornados pela API Garmin para esta atividade.">
        {visualData?.technicalData ? (
          <details className="rounded-[22px] border border-white/10 bg-black/20 p-4 text-sm text-foreground/75">
            <summary className="cursor-pointer list-none font-semibold text-foreground">Abrir JSON técnico completo</summary>
            <pre className="mt-4 overflow-x-auto text-xs leading-6 text-foreground/75">
              {JSON.stringify(visualData.technicalData, null, 2)}
            </pre>
          </details>
        ) : activity.metrics ? (
          <details className="rounded-[22px] border border-white/10 bg-black/20 p-4 text-sm text-foreground/75">
            <summary className="cursor-pointer list-none font-semibold text-foreground">Abrir JSON salvo na atividade</summary>
            <pre className="mt-4 overflow-x-auto text-xs leading-6 text-foreground/75">
              {JSON.stringify(activity.metrics, null, 2)}
            </pre>
          </details>
        ) : (
          <EmptyState title="Sem dados técnicos" description="Nenhuma informação adicional disponível para esta atividade." />
        )}
      </SectionCard>
    </>
  );
}
