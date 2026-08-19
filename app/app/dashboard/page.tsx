import type { Activity } from "@prisma/client";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime, formatDistance, formatDuration } from "@/lib/format";
import { requireOnboardedUser } from "@/server/auth-guards";
import { getDashboardData } from "@/server/queries";

export const dynamic = "force-dynamic";

const PERIOD_OPTIONS = [7, 30, 90, 365] as const;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const params = await searchParams;
  const selectedDays = PERIOD_OPTIONS.includes(Number(params.days) as (typeof PERIOD_OPTIONS)[number])
    ? Number(params.days)
    : 30;

  const user = await requireOnboardedUser();
  const { activities, summary, trend } = await getDashboardData(user.id, selectedDays);
  const maxTrendCount = Math.max(...trend.map((bucket) => bucket.activityCount), 0);

  const alerts = [
    !summary.garminConnection ? "Garmin ainda não foi conectada." : null,
    summary.garminConnection?.status === "RECONNECT_REQUIRED" ? "Garmin precisa ser reconectada." : null,
    !summary.whatsappIdentity?.verifiedAt ? "WhatsApp ainda não foi ativado." : null,
    summary.daysSinceLatestActivity !== null && summary.daysSinceLatestActivity > 14
      ? `Não recebemos novas atividades há ${summary.daysSinceLatestActivity} dias.`
      : null,
  ].filter(Boolean) as string[];

  return (
    <>
      <section className="glass rounded-[28px] p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-foreground/42">Dashboard</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
              Olá, {(user.name ?? user.email).split(" ")[0]}
            </h1>
            <p className="mt-2 text-sm leading-7 text-foreground/65">
              Período selecionado: últimos {selectedDays} dias. Status compacto das integrações e resumo real do período.
            </p>
          </div>

          <form className="flex flex-wrap items-center gap-3">
            <div className="glass-input rounded-[20px] px-4 py-3">
              <select name="days" defaultValue={String(selectedDays)} className="bg-transparent text-sm text-foreground outline-none">
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option} value={option} className="bg-black text-white">
                    Últimos {option} dias
                  </option>
                ))}
              </select>
            </div>
            <button className="glass-button rounded-[20px] px-5 py-3 text-sm font-semibold text-foreground">
              Atualizar período
            </button>
          </form>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Garmin"
          value={summary.garminConnection?.status ?? "Pendente"}
          detail={summary.garminConnection?.lastSyncStatus ?? "Sem conexão ativa"}
          tone={summary.garminConnection?.status === "CONNECTED" ? "success" : "warning"}
        />
        <MetricCard
          label="WhatsApp"
          value={summary.whatsappIdentity?.verifiedAt ? "Verificado" : "Pendente"}
          detail={summary.whatsappIdentity?.phoneE164 ?? "Sem ativação"}
          tone={summary.whatsappIdentity?.verifiedAt ? "success" : "warning"}
        />
        <MetricCard
          label="Última sincronização"
          value={formatDateTime(summary.garminConnection?.lastSyncAt)}
          detail={summary.garminConnection?.lastSyncStatus ?? "Ainda não sincronizada"}
        />
        <MetricCard
          label="Última atividade"
          value={summary.latestActivity ? formatDateTime(summary.latestActivity.startedAt) : "—"}
          detail={summary.latestActivity ? summary.latestActivity.name ?? summary.latestActivity.sportType : "Nenhuma atividade sincronizada"}
        />
      </section>

      <SectionCard title="Resumo do período" description="Somente métricas realmente disponíveis são exibidas para os últimos dias selecionados.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <InfoRow label="Atividades" value={String(summary.activityCount)} />
          <InfoRow label="Duração total" value={formatDuration(summary.totalDurationSeconds)} />
          <InfoRow label="Distância total" value={formatDistance(summary.totalDistanceMeters)} />
          <InfoRow label="Modalidades" value={String(summary.sportTypesCount)} />
          <InfoRow label="Frequência" value={`${summary.trainingDays} dias ativos`} />
        </div>
      </SectionCard>

      <SectionCard title="Evolução" description="Volume e frequência agregados por blocos do período selecionado.">
        {summary.activityCount ? (
          <div className="grid gap-3">
            {trend.map((bucket) => (
              <div key={bucket.label} className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{bucket.label}</p>
                    <p className="mt-1 text-xs text-foreground/55">
                      {bucket.activityCount} atividade(s) · {formatDuration(bucket.durationSeconds)} · {formatDistance(bucket.distanceMeters)}
                    </p>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-white/8 sm:max-w-72">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,rgba(120,119,255,0.9),rgba(60,214,255,0.9))]"
                      style={{
                        width: `${maxTrendCount ? Math.max((bucket.activityCount / maxTrendCount) * 100, bucket.activityCount ? 12 : 0) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Sem evolução para exibir" description="Conecte Garmin e sincronize atividades dentro do período filtrado." />
        )}
      </SectionCard>

      <SectionCard
        title="Últimas atividades"
        description="Lista resumida com acesso ao detalhe individual."
        action={
          <Link href="/app/atividades" className="text-sm text-accent hover:text-foreground">
            Ver todas
          </Link>
        }
      >
        {activities.length ? (
          <div className="grid gap-3">
            {activities.map((activity: Activity) => (
              <Link
                key={activity.id}
                href={`/app/atividades/${activity.id}`}
                className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4 transition hover:bg-white/8"
              >
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
