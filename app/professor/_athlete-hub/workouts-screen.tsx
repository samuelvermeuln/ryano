/**
 * SAM-11 — Treinos do atleta (visão do professor).
 *
 * The full prescription list, filtered by the same situations the school's
 * administration sheet uses (`athlete-training-scope`). Filters are URL
 * parameters, not client state, so a filtered list is shareable and survives a
 * reload.
 *
 * Each row links to the workout's own route rather than opening a modal: the
 * detail carries the structure, the prescribed-vs-executed table, the compliance
 * breakdown and the change trail, which is a page's worth of content and deserves
 * an address (architecture/rules/ui.md).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { formatDistance, formatDuration } from "@/lib/format";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import {
  ATHLETE_TRAINING_DEFAULT_LIMIT,
  ATHLETE_TRAINING_FILTERS,
  ATHLETE_TRAINING_MAX_LIMIT,
  type AthleteTrainingFilter,
} from "@/modules/school/application/athlete-training-scope";
import { GetCoachAthleteWorkouts } from "@/modules/school/application/get-coach-athlete-workouts";
import { SchoolError } from "@/modules/school/domain/errors";
import { formatScheduledDateTime } from "@/modules/school/presentation/format";
import { ASSIGNMENT_STATUS_LABELS } from "@/modules/school/presentation/workout-labels";
import { resolveSportLabel } from "@/modules/shared/activities/sport-types";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { AthleteHubShell, WithheldNotice } from "./athlete-hub-shell";
import { athleteHubHref, scopeFormValue, type CoachAthleteScope } from "./hub-scope";
import { deleteDraftAction, publishDraftAction } from "./actions";
import { PrescriptionDrafts } from "@/modules/school/application/prescription-revisions";

export type WorkoutsSearchParams = { filtro?: string; limite?: string; modalidade?: string };

const workouts = new GetCoachAthleteWorkouts(prisma);

const FILTER_LABELS: Record<AthleteTrainingFilter, string> = {
  todos: "Todos",
  proximos: "A fazer",
  atrasados: "Atrasados",
  realizados: "Realizados",
  "sem-execucao": "Sem execução",
};

function parseFilter(value: string | undefined): AthleteTrainingFilter {
  return (ATHLETE_TRAINING_FILTERS as readonly string[]).includes(value ?? "")
    ? (value as AthleteTrainingFilter)
    : "todos";
}

/** Anything that is not a sane positive integer falls back to the default page size. */
function parseLimit(value: string | undefined): number | undefined {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return undefined;
  return Math.min(parsed, ATHLETE_TRAINING_MAX_LIMIT);
}

function listHref(
  scope: CoachAthleteScope,
  athleteId: string,
  options: { filter: AthleteTrainingFilter; limit?: number; sportType?: string | null },
): string {
  const query = new URLSearchParams();
  if (options.filter !== "todos") query.set("filtro", options.filter);
  if (options.limit && options.limit !== ATHLETE_TRAINING_DEFAULT_LIMIT) {
    query.set("limite", String(options.limit));
  }
  if (options.sportType) query.set("modalidade", options.sportType);
  const suffix = query.toString();
  return `${athleteHubHref(scope, athleteId, "treinos")}${suffix ? `?${suffix}` : ""}`;
}

function statusTone(row: { overdue: boolean; status: string }) {
  if (row.overdue) return "warning" as const;
  if (row.status === "COMPLETED" || row.status === "PARTIALLY_COMPLETED") return "success" as const;
  if (row.status === "MISSED") return "danger" as const;
  return "neutral" as const;
}

function statusLabel(row: { overdue: boolean; status: string }): string {
  return row.overdue ? "Atrasado" : ASSIGNMENT_STATUS_LABELS[row.status] ?? row.status;
}

export async function WorkoutsScreen({
  scope,
  athleteId,
  query,
}: {
  scope: CoachAthleteScope;
  athleteId: string;
  query: WorkoutsSearchParams;
}) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();

  const filter = parseFilter(query.filtro);
  const limit = parseLimit(query.limite);

  let data: Awaited<ReturnType<typeof workouts.execute>>;
  try {
    data = await workouts.execute(session.user.id, scope, athleteId, {
      filter,
      ...(limit ? { limit } : {}),
      ...(query.modalidade ? { sportType: query.modalidade } : {}),
    });
  } catch (error) {
    if (error instanceof SchoolError) notFound();
    throw error;
  }

  const { context, items, counts } = data;
  const prescribeHref = `${athleteHubHref(scope, athleteId, "treinos")}/novo`;
  // SAM-59 — the coach's drafts for this athlete (never visible to the athlete).
  const drafts = context.isResponsibleCoach
    ? await new PrescriptionDrafts(prisma).list(session.user.id, scope, athleteId).catch(() => [])
    : [];

  return (
    <AthleteHubShell
      scope={scope}
      athlete={context.athlete}
      teams={context.teams}
      currentCoach={context.currentCoach}
      isResponsibleCoach={context.isResponsibleCoach}
      active="treinos"
      actions={
        context.isResponsibleCoach ? (
          <Link
            href={prescribeHref}
            aria-label="Prescrever treino para este atleta"
            className="glass-button-primary rounded-full px-4 py-2 text-sm font-medium"
          >
            Prescrever treino
          </Link>
        ) : null
      }
    >
      {data.heldBack > 0 && (
        <WithheldNotice>
          {scope.kind === "school"
            ? `${data.heldBack} prescrição(ões) de uma passagem anterior deste atleta pela escola não aparecem nesta `
              + "lista: o histórico de um vínculo encerrado depende de autorização do próprio atleta."
            : `${data.heldBack} prescrição(ões) de um acompanhamento anterior com este atleta não aparecem nesta `
              + "lista: o histórico de um vínculo encerrado depende de autorização do próprio atleta."}
        </WithheldNotice>
      )}

      {drafts.length > 0 && (
        <SectionCard title={`Rascunhos (${drafts.length})`} description="Só você vê. O atleta recebe quando você publicar.">
          <ul className="space-y-2" data-testid="prescription-drafts">
            {drafts.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[18px] border border-white/10 bg-white/5 px-3 py-2 text-sm" data-testid="prescription-draft">
                <span className="min-w-0">
                  <span className="block font-medium">{item.title}</span>
                  <span className="block text-xs text-foreground/55">
                    {item.scheduledAtLocal ? `Para ${item.scheduledAtLocal.replace("T", " ")} · ` : ""}salvo em {item.updatedAt.toLocaleString("pt-BR")}
                  </span>
                </span>
                <span className="flex flex-wrap gap-2">
                  <Link href={`${prescribeHref}?rascunho=${item.id}`} className="glass-button rounded-full px-3 py-1.5 text-xs font-medium">Editar</Link>
                  <form action={publishDraftAction}>
                    <input type="hidden" name="schoolId" value={scopeFormValue(scope)} />
                    <input type="hidden" name="athleteId" value={athleteId} />
                    <input type="hidden" name="draftId" value={item.id} />
                    <button type="submit" className="glass-button-primary rounded-full px-3 py-1.5 text-xs font-medium">Publicar</button>
                  </form>
                  <form action={deleteDraftAction}>
                    <input type="hidden" name="schoolId" value={scopeFormValue(scope)} />
                    <input type="hidden" name="athleteId" value={athleteId} />
                    <input type="hidden" name="draftId" value={item.id} />
                    <button type="submit" className="rounded-full px-3 py-1.5 text-xs text-foreground/60 hover:text-destructive">Descartar</button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <SectionCard
        title="Prescrições"
        description="Filtros e paginação ficam na URL, então esta lista pode ser compartilhada."
      >
        <div className="flex flex-col gap-3">
          <nav aria-label="Filtrar treinos por situação" className="overflow-x-auto">
            <ul className="flex min-w-max gap-2">
              {ATHLETE_TRAINING_FILTERS.map((option) => {
                const isActive = option === filter;
                return (
                  <li key={option}>
                    <Link
                      href={listHref(scope, athleteId, {
                        filter: option,
                        limit,
                        sportType: data.sportType,
                      })}
                      aria-current={isActive ? "page" : undefined}
                      className={`block rounded-full border px-3 py-1.5 text-xs transition-colors ${
                        isActive
                          ? "theme-pill-info font-medium"
                          : "border-white/10 bg-white/5 text-foreground/70 hover:bg-white/10 hover:text-foreground"
                      }`}
                    >
                      {`${FILTER_LABELS[option]} (${counts[option]})`}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {data.availableSportTypes.length > 1 && (
            <nav aria-label="Filtrar treinos por modalidade" className="overflow-x-auto">
              <ul className="flex min-w-max gap-2">
                <li>
                  <Link
                    href={listHref(scope, athleteId, { filter, limit, sportType: null })}
                    aria-current={data.sportType === null ? "page" : undefined}
                    className={`block rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      data.sportType === null
                        ? "theme-pill-neutral font-medium"
                        : "border-white/10 bg-white/5 text-foreground/70 hover:bg-white/10"
                    }`}
                  >
                    Todas as modalidades
                  </Link>
                </li>
                {data.availableSportTypes.map((sport) => (
                  <li key={sport}>
                    <Link
                      href={listHref(scope, athleteId, { filter, limit, sportType: sport })}
                      aria-current={data.sportType === sport ? "page" : undefined}
                      className={`block rounded-full border px-3 py-1.5 text-xs transition-colors ${
                        data.sportType === sport
                          ? "theme-pill-neutral font-medium"
                          : "border-white/10 bg-white/5 text-foreground/70 hover:bg-white/10"
                      }`}
                    >
                      {resolveSportLabel(sport)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>

        <div className="mt-5">
          {items.length === 0 ? (
            <EmptyState
              title="Nenhum treino nesta situação"
              description={
                filter === "todos"
                  ? "Este atleta ainda não tem prescrições registradas neste vínculo."
                  : "Troque o filtro para ver as outras situações."
              }
              action={
                context.isResponsibleCoach && filter === "todos" ? (
                  <Link href={prescribeHref} className="glass-button rounded-full px-4 py-2 text-xs font-medium">
                    Prescrever treino
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <ul className="space-y-2">
              {items.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`${athleteHubHref(scope, athleteId, "treinos")}/${row.id}`}
                    aria-label={`Abrir treino ${row.title}`}
                    className="flex flex-col gap-2 rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 transition-colors hover:bg-white/10 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{row.title}</span>
                      <span className="block text-xs text-foreground/55">
                        {[formatScheduledDateTime(row.scheduledAt, context.timeZone), resolveSportLabel(row.sportType), row.team]
                          .filter(Boolean).join(" · ")}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-x-3 text-xs text-foreground/50">
                        {row.targetDurationSeconds != null && (
                          <span>⏱ {formatDuration(row.targetDurationSeconds)}</span>
                        )}
                        {row.targetDistanceMeters != null && (
                          <span>📏 {formatDistance(row.targetDistanceMeters)}</span>
                        )}
                        {row.execution && (
                          <span>
                            {"Realizado: "}
                            {[
                              row.execution.distanceMeters != null
                                ? formatDistance(row.execution.distanceMeters) : null,
                              row.execution.durationSeconds != null
                                ? formatDuration(row.execution.durationSeconds) : null,
                            ].filter(Boolean).join(" · ") || "sim"}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-wrap items-center gap-2">
                      {row.execution?.complianceScore != null && (
                        <span className="text-xs tabular-nums text-foreground/65">
                          {(row.execution.complianceScore / 10).toFixed(1)}/10
                        </span>
                      )}
                      {row.hasOpenChangeRequest && <StatusBadge tone="warning">Alteração pedida</StatusBadge>}
                      <StatusBadge tone={statusTone(row)}>{statusLabel(row)}</StatusBadge>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {data.hasMore && (
            <div className="mt-4">
              <Link
                href={listHref(scope, athleteId, {
                  filter,
                  limit: Math.min(data.limit * 2, ATHLETE_TRAINING_MAX_LIMIT),
                  sportType: data.sportType,
                })}
                className="glass-button inline-block rounded-full px-4 py-2 text-xs font-medium"
              >
                Carregar mais
              </Link>
            </div>
          )}
        </div>
      </SectionCard>
    </AthleteHubShell>
  );
}
