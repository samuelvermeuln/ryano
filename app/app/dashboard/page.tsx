import type { Activity } from "@prisma/client";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime, formatDistance, formatDuration } from "@/lib/format";
import { requireOnboardedUser } from "@/server/auth-guards";
import { getDashboardData } from "@/server/queries";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireOnboardedUser();
  const { activities, summary } = await getDashboardData(user.id);

  const alerts = [
    !summary.garminConnection ? "Garmin ainda não foi conectada." : null,
    !summary.whatsappIdentity?.verifiedAt ? "WhatsApp ainda não foi ativado." : null,
    !summary.latestActivity ? "Nenhuma atividade sincronizada até agora." : null,
  ].filter(Boolean) as string[];

  return (
    <>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Garmin" value={summary.garminConnection ? "Conectada" : "Pendente"} detail={summary.garminConnection?.lastSyncStatus ?? "Sem conexão"} tone={summary.garminConnection ? "success" : "warning"} />
        <MetricCard label="WhatsApp" value={summary.whatsappIdentity?.verifiedAt ? "Verificado" : "Pendente"} detail={summary.whatsappIdentity?.phoneE164 ?? "Sem ativação"} tone={summary.whatsappIdentity?.verifiedAt ? "success" : "warning"} />
        <MetricCard label="Atividades no período" value={String(summary.activityCount)} detail={`Distância total: ${formatDistance(summary.totalDistanceMeters)}`} />
        <MetricCard label="Última sincronização" value={formatDateTime(summary.garminConnection?.lastSyncAt)} detail={summary.garminConnection?.lastSyncStatus ?? "Ainda não sincronizada"} />
      </section>

      <SectionCard title="Resumo do período" description="Somente métricas realmente disponíveis são exibidas nesta visão inicial.">
        <div className="grid gap-4 md:grid-cols-3">
          <InfoRow label="Frequência" value={`${summary.activityCount} atividades`} />
          <InfoRow label="Duração total" value={formatDuration(summary.totalDurationSeconds)} />
          <InfoRow label="Distância total" value={formatDistance(summary.totalDistanceMeters)} />
        </div>
      </SectionCard>

      <SectionCard title="Últimas atividades" description="Lista resumida com acesso ao detalhe individual." action={<Link href="/app/atividades" className="text-sm text-accent hover:text-foreground">Ver todas</Link>}>
        {activities.length ? (
          <div className="grid gap-3">
            {activities.map((activity: Activity) => (
              <Link key={activity.id} href={`/app/atividades/${activity.id}`} className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4 transition hover:bg-white/8">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{activity.name ?? activity.sportType}</p>
                    <p className="mt-1 text-sm text-foreground/60">{formatDateTime(activity.startedAt)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-foreground/70">
                    <span>{formatDuration(activity.durationSeconds)}</span>
                    <span>{formatDistance(activity.distanceMeters)}</span>
                    <StatusBadge>{activity.provider}</StatusBadge>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState title="Sem atividades" description="Conecte Garmin e execute sincronização para começar a preencher dashboard." />
        )}
      </SectionCard>

      <SectionCard title="Alertas úteis" description="Estados que precisam de ação do usuário para completar fluxo V1.">
        {alerts.length ? (
          <div className="grid gap-3">
            {alerts.map((alert) => (
              <div key={alert} className="rounded-[22px] border border-amber-300/18 bg-amber-300/8 px-4 py-4 text-sm text-amber-100">
                {alert}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Conta em bom estado" description="Sem alertas críticos neste momento." />
        )}
      </SectionCard>
    </>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "success" | "warning";
}) {
  return (
    <article className="glass rounded-[28px] p-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-foreground/60">{label}</p>
        <StatusBadge tone={tone}>{value}</StatusBadge>
      </div>
      <p className="mt-5 text-lg font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-2 text-sm leading-7 text-foreground/60">{detail}</p>
    </article>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4">
      <p className="text-sm text-foreground/55">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-tight text-foreground">{value}</p>
    </div>
  );
}
