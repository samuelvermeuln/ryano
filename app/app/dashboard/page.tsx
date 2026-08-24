import type { Activity } from "@prisma/client";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { formatCalories, formatDateTime, formatDistance, formatDuration, formatHeartRate } from "@/lib/format";
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
    !summary.garminConnection ? "Conecte seu Garmin para importar seus treinos automaticamente." : null,
    summary.garminConnection?.status === "RECONNECT_REQUIRED" ? "Sua conexão com o Garmin precisa ser refeita." : null,
    summary.garminConnection?.status === "CONNECTED" && !summary.garminToday
      ? "Conexão Garmin ativa, mas a leitura diária ainda não ficou disponível." 
      : null,
    !summary.whatsappIdentity?.verifiedAt ? "Ative seu WhatsApp para receber seus resumos por lá." : null,
    summary.daysSinceLatestActivity !== null && summary.daysSinceLatestActivity > 14
      ? `Faz ${summary.daysSinceLatestActivity} dias que não recebemos novas atividades.`
      : null,
  ].filter(Boolean) as string[];

  return (
    <>
      <section className="glass rounded-[24px] p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-foreground/42">Dashboard</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
              Olá, {(user.name ?? user.email).split(" ")[0]}
            </h1>
            <p className="mt-2 text-sm leading-7 text-foreground/65">
              Veja como seus treinos evoluíram nos últimos {selectedDays} dias.
            </p>
          </div>

          <form className="flex flex-wrap items-center gap-3">
            <div className="glass-input rounded-[18px] px-4 py-3">
              <select name="days" defaultValue={String(selectedDays)} className="bg-transparent text-sm text-foreground outline-none">
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option} value={option} className="bg-black text-white">
                    Últimos {option} dias
                  </option>
                ))}
              </select>
            </div>
            <button className="glass-button rounded-[18px] px-5 py-3 text-sm font-semibold text-foreground">
              Atualizar
            </button>
          </form>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Garmin"
          value={getGarminStatusLabel(summary.garminConnection?.status)}
          detail={summary.garminConnection?.lastSyncStatus ?? "Sem conexão ativa"}
          tone={summary.garminConnection?.status === "CONNECTED" ? "success" : "warning"}
        />
        <MetricCard
          label="WhatsApp"
          value={summary.whatsappIdentity?.verifiedAt ? "Conectado" : "Pendente"}
          detail={summary.whatsappIdentity?.phoneE164 ?? "Sem número confirmado"}
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

      <SectionCard title="Garmin hoje" description="Leitura diária de recuperação e saúde consumida da API Garmin em uma chamada agregada.">
        {summary.garminToday ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <InfoRow label="Prontidão" value={formatScore(summary.garminToday.readiness.score)} detail={summary.garminToday.readiness.level ?? summary.garminToday.readiness.feedback ?? "Sem leitura de prontidão"} />
              <InfoRow label="Sono" value={formatDuration(summary.garminToday.sleep.durationSeconds)} detail={summary.garminToday.sleep.score !== null ? `Score ${formatScore(summary.garminToday.sleep.score)}` : "Sem score de sono"} />
              <InfoRow label="Body Battery" value={formatBodyBatteryRange(summary.garminToday.summary.bodyBatteryLowest, summary.garminToday.summary.bodyBatteryHighest)} detail={summary.garminToday.summary.bodyBatteryHighest !== null ? "Faixa diária registrada" : "Sem leitura de body battery"} />
              <InfoRow label="HRV" value={formatHrv(summary.garminToday.hrv.lastNightAvg)} detail={summary.garminToday.hrv.status ?? "Sem status de HRV"} />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <InfoRow label="Passos" value={formatCount(summary.garminToday.summary.steps)} detail="Total do dia" />
              <InfoRow label="Distância" value={formatDistance(summary.garminToday.summary.distanceMeters)} detail="Movimento acumulado" />
              <InfoRow label="Calorias" value={formatCalories(summary.garminToday.summary.activeKilocalories ?? summary.garminToday.summary.totalKilocalories)} detail={summary.garminToday.summary.activeKilocalories !== null ? "Calorias ativas" : "Calorias totais"} />
              <InfoRow label="FC em repouso" value={formatHeartRate(summary.garminToday.summary.restingHeartRate)} detail={summary.garminToday.sleep.avgSleepHrv !== null ? `HRV médio no sono: ${formatHrv(summary.garminToday.sleep.avgSleepHrv)}` : "Sem HRV médio no sono"} />
            </div>

            {summary.garminToday.warnings.length ? (
              <div className="grid gap-3">
                {summary.garminToday.warnings.map((warning) => (
                  <div key={warning} className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4 text-sm text-foreground/72">
                    {warning}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <EmptyState title="Sem leitura Garmin hoje" description="Quando a API Garmin responder com o snapshot diário, sono, prontidão e recuperação aparecem aqui." />
        )}
      </SectionCard>

      <SectionCard title="Resumo do período" description="Os números abaixo consideram somente as atividades recebidas neste intervalo.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <InfoRow label="Atividades" value={String(summary.activityCount)} />
          <InfoRow label="Duração total" value={formatDuration(summary.totalDurationSeconds)} />
          <InfoRow label="Distância total" value={formatDistance(summary.totalDistanceMeters)} />
          <InfoRow label="Modalidades" value={String(summary.sportTypesCount)} />
          <InfoRow label="Frequência" value={`${summary.trainingDays} dias ativos`} />
        </div>
      </SectionCard>

      <SectionCard title="Evolução" description="Acompanhe volume e frequência ao longo do período selecionado.">
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
          <EmptyState title="Sem evolução para exibir" description="Conecte seu Garmin e sincronize suas atividades para começar a acompanhar seus treinos." />
        )}
      </SectionCard>

      <SectionCard
        title="Últimas atividades"
        description="Acesse rapidamente seus treinos mais recentes."
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
          <EmptyState title="Sem atividades" description="Conecte seu Garmin para começar a preencher seu dashboard." />
        )}
      </SectionCard>

      <SectionCard title="Alertas úteis" description="Ajustes que podem melhorar sua experiência.">
        {alerts.length ? (
          <div className="grid gap-3">
            {alerts.map((alert) => (
              <div key={alert} className="rounded-[22px] border border-amber-300/18 bg-amber-300/8 px-4 py-4 text-sm text-amber-100">
                {alert}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Tudo certo por aqui" description="Sua conta está pronta para acompanhar seus treinos." />
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
    <article className="glass rounded-[24px] p-5 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-foreground/60">{label}</p>
        <StatusBadge tone={tone}>{value}</StatusBadge>
      </div>
      <p className="mt-5 text-lg font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-2 text-sm leading-7 text-foreground/60">{detail}</p>
    </article>
  );
}

function InfoRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4">
      <p className="text-sm text-foreground/55">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-tight text-foreground">{value}</p>
      {detail ? <p className="mt-2 text-sm leading-6 text-foreground/60">{detail}</p> : null}
    </div>
  );
}

function formatScore(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${Math.round(value)}/100`;
}

function formatBodyBatteryRange(low: number | null | undefined, high: number | null | undefined) {
  if (low === null || low === undefined || high === null || high === undefined) {
    return "—";
  }

  return `${Math.round(low)}–${Math.round(high)}`;
}

function formatHrv(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${Math.round(value)} ms`;
}

function formatCount(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "—";
  }

  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
}

function getGarminStatusLabel(status: string | null | undefined) {
  if (status === "CONNECTED") {
    return "Conectado";
  }

  if (status === "RECONNECT_REQUIRED") {
    return "Reconectar";
  }

  return "Pendente";
}
