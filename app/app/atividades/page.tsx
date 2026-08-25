import { WearableProvider } from "@prisma/client";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { humanizeActivityLabel } from "@/lib/activity-text";
import { formatDateTime, formatDistance, formatDuration } from "@/lib/format";
import { requireOnboardedUser } from "@/server/auth-guards";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ provider?: string; sportType?: string; days?: string; page?: string }>;
}) {
  const user = await requireOnboardedUser();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const days = Number(params.days ?? "30") || 30;
  const startedAfter = new Date();
  startedAfter.setDate(startedAfter.getDate() - days);

  const providerFilter = Object.values(WearableProvider).includes(params.provider as WearableProvider)
    ? (params.provider as WearableProvider)
    : undefined;

  const where = {
    userId: user.id,
    provider: providerFilter,
    sportType: params.sportType ? params.sportType : undefined,
    startedAt: {
      gte: startedAfter,
    },
  };

  const [activities, total, sportTypes] = await Promise.all([
    prisma.activity.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.activity.count({ where }),
    prisma.activity.findMany({
      where: { userId: user.id },
      distinct: ["sportType"],
      select: { sportType: true },
      orderBy: { sportType: "asc" },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <SectionCard title="Histórico de atividades" description="Filtre por período, origem e modalidade para encontrar seus treinos mais rápido.">
      <form className="mb-5 grid gap-3 lg:grid-cols-4">
        <FilterSelect name="days" defaultValue={String(days)} options={["7", "30", "90", "365"]} label="Período" />
        <FilterSelect name="provider" defaultValue={params.provider ?? ""} options={["", "GARMIN"]} label="Origem" />
        <FilterSelect name="sportType" defaultValue={params.sportType ?? ""} options={["", ...sportTypes.map((item) => item.sportType)]} label="Modalidade" />
        <button className="glass-button rounded-[20px] px-5 py-3 text-sm font-semibold text-foreground">Filtrar</button>
      </form>

      {activities.length ? (
        <>
          <div className="grid gap-3">
            {activities.map((activity) => (
              <Link key={activity.id} href={`/app/atividades/${activity.id}`} className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4 transition hover:bg-white/8">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-sm font-semibold text-foreground">{humanizeActivityLabel(activity.name) ?? humanizeActivityLabel(activity.sportType) ?? "Atividade"}</p>
                      <StatusBadge>{activity.provider}</StatusBadge>
                    </div>
                    <p className="mt-2 text-sm text-foreground/60">{formatDateTime(activity.startedAt)}</p>
                  </div>
                  <div className="grid gap-2 text-sm text-foreground/70 sm:grid-cols-4 sm:gap-4">
                    <span>Duração: {formatDuration(activity.durationSeconds)}</span>
                    <span>Distância: {formatDistance(activity.distanceMeters)}</span>
                    <span>FC média: {activity.averageHeartRate ?? "—"}</span>
                    <span>Modalidade: {humanizeActivityLabel(activity.sportType) ?? activity.sportType}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-foreground/70">
            <p>Página {page} de {totalPages}</p>
            <div className="flex gap-3">
              {page > 1 ? (
                <Link href={buildPageHref(params, page - 1)} className="glass-button rounded-[18px] px-4 py-2 text-foreground">Anterior</Link>
              ) : null}
              {page < totalPages ? (
                <Link href={buildPageHref(params, page + 1)} className="glass-button rounded-[18px] px-4 py-2 text-foreground">Próxima</Link>
              ) : null}
            </div>
          </div>
        </>
      ) : (
        <EmptyState title="Sem atividades para listar" description="Conecte seu Garmin, sincronize seus dados ou ajuste os filtros para encontrar seus treinos." />
      )}
    </SectionCard>
  );
}

function FilterSelect({
  name,
  defaultValue,
  options,
  label,
}: {
  name: string;
  defaultValue: string;
  options: string[];
  label: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-foreground/76">{label}</span>
      <div className="glass-input rounded-[20px] px-4 py-3">
        <select name={name} defaultValue={defaultValue} className="w-full bg-transparent text-sm text-foreground outline-none">
          {options.map((option) => (
            <option key={option || "all"} value={option} className="bg-black text-white">
              {option ? (humanizeActivityLabel(option) ?? option) : "Todos"}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}

function buildPageHref(
  params: { provider?: string; sportType?: string; days?: string },
  page: number,
) {
  const search = new URLSearchParams();

  if (params.provider) {
    search.set("provider", params.provider);
  }

  if (params.sportType) {
    search.set("sportType", params.sportType);
  }

  if (params.days) {
    search.set("days", params.days);
  }

  search.set("page", String(page));

  return `/app/atividades?${search.toString()}`;
}
