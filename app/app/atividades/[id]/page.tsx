import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime, formatDistance, formatDuration } from "@/lib/format";
import { requireOnboardedUser } from "@/server/auth-guards";
import { prisma } from "@/server/db";

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

  const metricRows = [
    ["Início", formatDateTime(activity.startedAt)],
    ["Duração", formatDuration(activity.durationSeconds)],
    ["Distância", formatDistance(activity.distanceMeters)],
    ["Calorias", activity.calories?.toString() ?? "—"],
    ["FC média", activity.averageHeartRate?.toString() ?? "—"],
    ["FC máxima", activity.maxHeartRate?.toString() ?? "—"],
    ["Ritmo médio", activity.averagePace?.toString() ?? "—"],
    ["Cadência média", activity.averageCadence?.toString() ?? "—"],
    ["Potência média", activity.averagePower?.toString() ?? "—"],
    ["Elevação", activity.elevationGain?.toString() ?? "—"],
  ].filter(([, value]) => value !== "—");

  return (
    <>
      <SectionCard title={activity.name ?? activity.sportType} description="Veja abaixo os principais dados deste treino." action={<StatusBadge>{activity.provider}</StatusBadge>}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {metricRows.map(([label, value]) => (
            <div key={label} className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4">
              <p className="text-sm text-foreground/55">{label}</p>
              <p className="mt-2 text-lg font-semibold tracking-tight text-foreground">{value}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Dados extras" description="Informações adicionais recebidas desta atividade.">
        {activity.metrics ? (
          <pre className="overflow-x-auto rounded-[22px] border border-white/10 bg-black/20 p-4 text-xs leading-6 text-foreground/75">
            {JSON.stringify(activity.metrics, null, 2)}
          </pre>
        ) : (
          <EmptyState title="Sem dados extras" description="Nenhuma informação adicional disponível para esta atividade." />
        )}
      </SectionCard>
    </>
  );
}
