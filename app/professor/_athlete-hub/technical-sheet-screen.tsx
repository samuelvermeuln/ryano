/**
 * SAM-11 — Ficha técnica do atleta.
 *
 * The training parameters the coach prescribes from: modalities, level, goals,
 * target event, availability, equipment, declared restrictions, and the
 * thresholds (FCmáx, FC de limiar, ritmo de limiar, FTP, CSS) with the heart-rate
 * zones derived from them.
 *
 * Zones are derived, never stored twice: `deriveHeartRateZones` uses the same
 * %FCmáx bands as `modules/shared/activities/heart-rate-zones`, so "Z3" means the
 * same thing here as on an activity detail screen. With no reference maximum heart
 * rate the screen says the zones are not configured rather than drawing five
 * empty bars that read as data.
 */
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { AthleteGoalsPanel } from "@/components/goals/athlete-goals-panel";
import { ListAthleteGoals } from "@/modules/school/application/athlete-goals";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { formatHeartRate, formatPace, formatPower, formatSwimPace } from "@/lib/format";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { GetAthleteTechnicalSheet } from "@/modules/school/application/get-athlete-technical-sheet";
import { SchoolError } from "@/modules/school/domain/errors";
import { SPORT_ENVIRONMENT_LABELS, SPORT_LEVEL_LABELS } from "@/modules/school/domain/athlete-sport-level";
import { HEART_RATE_ZONE_METHOD_LABELS, type HeartRateZoneMethod, type PaceZone } from "@/modules/school/domain/training-zones";
import { formatScheduledDateTime } from "@/modules/school/presentation/format";
import { formatTrackedValue, TRACKED_PARAMETER_LABELS } from "@/modules/school/presentation/prescription-targets";
import { EXPERIENCE_LEVEL_LABELS } from "@/modules/school/presentation/workout-labels";
import { isRyvanoSportType, resolveSportLabel, type RyvanoSportType } from "@/modules/shared/activities/sport-types";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { AthleteHubShell } from "./athlete-hub-shell";
import { scopeFormValue, type CoachAthleteScope } from "./hub-scope";
import { TechnicalSheetForm } from "./technical-sheet-form";

const technicalSheet = new GetAthleteTechnicalSheet(prisma);

const HEART_RATE_ZONE_METHOD_SHORT: Record<HeartRateZoneMethod, string> = {
  MAX_HR: "FCmáx",
  HRR: "reserva",
  LTHR: "LTHR",
};

/** Seconds → "mm:ss", the form's own notation. */
function toPaceInput(seconds: number | null): string | null {
  if (seconds === null) return null;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export async function TechnicalSheetScreen({ scope, athleteId }: { scope: CoachAthleteScope; athleteId: string }) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();

  let data: Awaited<ReturnType<typeof technicalSheet.execute>>;
  try {
    data = await technicalSheet.execute(session.user.id, scope, athleteId);
  } catch (error) {
    if (error instanceof SchoolError) notFound();
    throw error;
  }

  const { context, sheet, zones, revisions } = data;

  // SAM-53 — structured goals next to the legacy free-text `goals`.
  const goalPairs = await new ListAthleteGoals(prisma).execute(session.user.id, athleteId).catch((error: unknown) => {
    if (error instanceof SchoolError) return [];
    throw error;
  });

  // The school's modalities (or the independent coach's) plus anything already
  // on the sheet, so a value set before the offering changed never silently
  // disappears from the form.
  const offeredSports: RyvanoSportType[] = [...new Set(
    [...data.schoolSportTypes, ...(sheet?.sportTypes ?? [])].filter(isRyvanoSportType),
  )];

  const editor = (
    <TechnicalSheetForm
      schoolId={scopeFormValue(scope)}
      athleteId={athleteId}
      hasSheet={sheet !== null}
      sportTypes={offeredSports}
      values={{
        sportTypes: sheet?.sportTypes ?? [],
        experienceLevel: sheet?.experienceLevel ?? null,
        goals: sheet?.goals ?? null,
        targetEvent: sheet?.targetEvent ?? null,
        targetEventDate: sheet?.targetEventDate
          ? sheet.targetEventDate.toISOString().slice(0, 10)
          : null,
        availability: sheet?.availability ?? null,
        equipment: sheet?.equipment ?? null,
        restrictions: sheet?.restrictions ?? null,
        maxHeartRate: sheet?.maxHeartRate ?? null,
        thresholdHeartRate: sheet?.thresholdHeartRate ?? null,
        restingHeartRate: sheet?.restingHeartRate ?? null,
        thresholdPace: toPaceInput(sheet?.thresholdPaceSecPerKm ?? null),
        ftpWatts: sheet?.ftpWatts ?? null,
        cssPace: toPaceInput(sheet?.cssSecPer100m ?? null),
        heartRateZoneMethod: sheet?.heartRateZoneMethod ?? null,
        notes: sheet?.notes ?? null,
        sportLevels: (sheet?.sportLevels ?? []).map((level) => ({
          sportType: level.sportType,
          environment: level.environment,
          level: level.level,
          assessedAt: level.assessedAt ? level.assessedAt.toISOString().slice(0, 10) : "",
          eventExperience: level.eventExperience ?? "",
          recentHistory: level.recentHistory ?? "",
          currentCondition: level.currentCondition ?? "",
          notes: level.notes ?? "",
        })),
      }}
    />
  );

  const paceZoneLabel = (zone: PaceZone, format: (seconds: number) => string) =>
    zone.fromSec !== null && zone.toSec !== null
      ? `${format(zone.fromSec)} – ${format(zone.toSec)}`
      : zone.fromSec !== null ? `mais lento que ${format(zone.fromSec)}` : `mais rápido que ${format(zone.toSec!)}`;

  const parameters: Array<{ label: string; value: string | null }> = [
    { label: "FC máxima", value: sheet?.maxHeartRate != null ? formatHeartRate(sheet.maxHeartRate) : null },
    {
      label: "FC de limiar",
      value: sheet?.thresholdHeartRate != null ? formatHeartRate(sheet.thresholdHeartRate) : null,
    },
    {
      label: "FC de repouso",
      value: sheet?.restingHeartRate != null ? formatHeartRate(sheet.restingHeartRate) : null,
    },
    {
      label: "Ritmo de limiar",
      value: sheet?.thresholdPaceSecPerKm != null ? formatPace(sheet.thresholdPaceSecPerKm) : null,
    },
    { label: "FTP", value: sheet?.ftpWatts != null ? formatPower(sheet.ftpWatts) : null },
    { label: "CSS", value: sheet?.cssSecPer100m != null ? formatSwimPace(sheet.cssSecPer100m) : null },
  ];
  const filledParameters = parameters.filter((entry) => entry.value !== null);

  return (
    <AthleteHubShell
      scope={scope}
      athlete={context.athlete}
      teams={context.teams}
      currentCoach={context.currentCoach}
      isResponsibleCoach={context.isResponsibleCoach}
      active="ficha-tecnica"
      actions={editor}
    >
      {sheet === null ? (
        <SectionCard
          title="Ficha técnica"
          description="Os parâmetros que orientam a prescrição deste atleta."
        >
          <EmptyState
            title="Ficha técnica ainda não preenchida"
            description={
              "Sem zonas e limiares registrados, a prescrição não tem de onde sugerir intensidade. "
              + "Preencha o que já se sabe — todos os campos são opcionais."
            }
            action={editor}
          />
        </SectionCard>
      ) : (
        <>
          <SectionCard
            title="Perfil"
            description={
              sheet.updatedByName
                ? `Última atualização por ${sheet.updatedByName}.`
                : scope.kind === "school"
                  ? "Parâmetros declarados para este atleta nesta escola."
                  : "Parâmetros declarados para este atleta neste acompanhamento."
            }
          >
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {sheet.sportTypes.length > 0
                  ? sheet.sportTypes.map((sport) => (
                    <StatusBadge key={sport} tone="neutral">
                      {resolveSportLabel(sport) ?? sport}
                    </StatusBadge>
                  ))
                  : <span className="text-xs text-foreground/45">Nenhuma modalidade declarada</span>}
                {sheet.experienceLevel && (
                  <StatusBadge tone="success">
                    {EXPERIENCE_LEVEL_LABELS[sheet.experienceLevel] ?? sheet.experienceLevel}
                  </StatusBadge>
                )}
              </div>

              <dl className="grid gap-4 sm:grid-cols-2">
                {sheet.goals && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs uppercase tracking-wide text-foreground/50">Objetivos</dt>
                    <dd className="mt-1 whitespace-pre-line text-sm text-foreground/80">{sheet.goals}</dd>
                  </div>
                )}
                {sheet.targetEvent && (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-foreground/50">Prova-alvo</dt>
                    <dd className="mt-1 text-sm text-foreground/80">
                      {sheet.targetEvent}
                      {sheet.targetEventDate && (
                        <span className="text-foreground/55">
                          {" · "}
                          {sheet.targetEventDate.toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                        </span>
                      )}
                    </dd>
                  </div>
                )}
                {sheet.availability && (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-foreground/50">Disponibilidade</dt>
                    <dd className="mt-1 text-sm text-foreground/80">{sheet.availability}</dd>
                  </div>
                )}
                {sheet.equipment && (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-foreground/50">Equipamento</dt>
                    <dd className="mt-1 whitespace-pre-line text-sm text-foreground/80">{sheet.equipment}</dd>
                  </div>
                )}
                {sheet.notes && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs uppercase tracking-wide text-foreground/50">Observações</dt>
                    <dd className="mt-1 whitespace-pre-line text-sm text-foreground/80">{sheet.notes}</dd>
                  </div>
                )}
              </dl>

              {/* SAM-50 — level per (modality, environment), assessed by a professional. */}
              {sheet.sportLevels.length > 0 && (
                <div data-testid="sport-levels">
                  <p className="text-xs uppercase tracking-wide text-foreground/50">Níveis por modalidade e ambiente</p>
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                    {sheet.sportLevels.map((level) => (
                      <li key={`${level.sportType}:${level.environment}`} className="rounded-[18px] border border-white/10 bg-white/5 px-3 py-2 text-sm" data-testid="sport-level">
                        <p className="font-medium">
                          {resolveSportLabel(level.sportType) ?? level.sportType}
                          {" · "}
                          {SPORT_ENVIRONMENT_LABELS[level.environment as keyof typeof SPORT_ENVIRONMENT_LABELS] ?? level.environment}
                          {": "}
                          {SPORT_LEVEL_LABELS[level.level as keyof typeof SPORT_LEVEL_LABELS] ?? level.level}
                        </p>
                        <p className="text-xs text-foreground/55">
                          {level.assessedAt ? `Avaliado em ${level.assessedAt.toLocaleDateString("pt-BR", { timeZone: "UTC" })}` : "Sem data de avaliação"}
                          {level.assessedByName ? ` por ${level.assessedByName}` : ""}
                        </p>
                        {level.currentCondition && <p className="text-xs text-foreground/70">Condição atual: {level.currentCondition}</p>}
                        {level.eventExperience && <p className="text-xs text-foreground/70">Experiência em eventos: {level.eventExperience}</p>}
                        {level.recentHistory && <p className="text-xs text-foreground/70">Histórico recente: {level.recentHistory}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <AthleteGoalsPanel pairs={goalPairs} onlyActive />

              {sheet.restrictions && (
                <div className="theme-panel-warning rounded-[20px] border px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide">Restrições e cuidados</p>
                  <p className="mt-1 whitespace-pre-line text-sm leading-6">{sheet.restrictions}</p>
                  <p className="mt-2 text-xs opacity-80">
                    Anotação do profissional responsável — não é diagnóstico médico.
                  </p>
                </div>
              )}
            </div>
          </SectionCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Parâmetros" description="Limiares usados para prescrever intensidade.">
              {filledParameters.length === 0 ? (
                <EmptyState
                  title="Nenhum parâmetro registrado"
                  description="Registre FC máxima, limiares, FTP ou CSS para orientar a intensidade das prescrições."
                  action={editor}
                />
              ) : (
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {filledParameters.map((entry) => (
                    <div key={entry.label}>
                      <dt className="text-xs uppercase tracking-wide text-foreground/50">{entry.label}</dt>
                      <dd className="mt-1 text-lg font-semibold tabular-nums">{entry.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </SectionCard>

            <SectionCard
              title="Zonas de FC"
              description={zones.heartRate
                ? `Método: ${HEART_RATE_ZONE_METHOD_LABELS[zones.heartRate.method]}. Z3 aqui é o mesmo Z3 das atividades.`
                : "Derivadas da FC máxima, da reserva ou da FC de limiar, conforme o método escolhido."}
            >
              {!zones.heartRate ? (
                <EmptyState
                  title="Zonas não configuradas"
                  description="Informe a FC máxima (ou a FC de limiar) na ficha técnica para que as cinco zonas sejam calculadas."
                  action={editor}
                />
              ) : (
                <ul className="space-y-2" data-testid="zones-heart-rate" data-method={zones.heartRate.method}>
                  {zones.heartRate.zones.map((zone) => (
                    <li
                      key={zone.zone}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm"
                    >
                      <span className="font-medium">Z{zone.zone}</span>
                      <span className="text-xs text-foreground/55">
                        {zone.toPercent !== null ? `${zone.fromPercent}–${zone.toPercent}%` : `> ${zone.fromPercent}%`}
                        {" "}
                        {HEART_RATE_ZONE_METHOD_SHORT[zones.heartRate!.method]}
                      </span>
                      <span className="tabular-nums text-foreground/80">
                        {zone.fromBpm}–{zone.toBpm} bpm
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>

          {/* SAM-18 — one card per family whose parameter exists; nothing drawn for the others. */}
          {(zones.pace || zones.power || zones.swim) && (
            <div className="grid gap-4 lg:grid-cols-3">
              {zones.pace && (
                <SectionCard title="Zonas de ritmo" description="% da velocidade de limiar (corrida), em min/km.">
                  <ul className="space-y-2" data-testid="zones-pace">
                    {zones.pace.map((zone) => (
                      <li key={zone.zone} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm">
                        <span className="font-medium">Z{zone.zone}</span>
                        <span className="tabular-nums text-foreground/80">{paceZoneLabel(zone, formatPace)}</span>
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              )}
              {zones.power && (
                <SectionCard title="Zonas de potência" description="% do FTP (Coggan), em watts.">
                  <ul className="space-y-2" data-testid="zones-power">
                    {zones.power.map((zone) => (
                      <li key={zone.zone} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm">
                        <span className="font-medium">Z{zone.zone}</span>
                        <span className="tabular-nums text-foreground/80">
                          {zone.toWatts !== null ? `${zone.fromWatts}–${zone.toWatts} W` : `> ${zone.fromWatts} W`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              )}
              {zones.swim && (
                <SectionCard title="Zonas de natação" description="% da velocidade crítica (CSS), em min/100 m.">
                  <ul className="space-y-2" data-testid="zones-swim">
                    {zones.swim.map((zone) => (
                      <li key={zone.zone} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm">
                        <span className="font-medium">Z{zone.zone}</span>
                        <span className="tabular-nums text-foreground/80">{paceZoneLabel(zone, formatSwimPace)}</span>
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              )}
            </div>
          )}

          <SectionCard
            title="Histórico de parâmetros"
            description="Cada alteração de limiar fica registrada: uma prescrição antiga continua interpretável pelo valor vigente à época."
          >
            {revisions.length === 0 ? (
              <p className="text-sm text-foreground/50">Nenhuma alteração de parâmetro registrada ainda.</p>
            ) : (
              <ol className="space-y-2" data-testid="parameter-history">
                {revisions.map((revision) => (
                  <li key={revision.id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm" data-testid="parameter-revision">
                    <p className="text-xs text-foreground/50">
                      {formatScheduledDateTime(revision.changedAt, context.timeZone)}
                      {revision.changedByName ? ` · ${revision.changedByName}` : ""}
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {Object.entries(revision.changes).map(([field, change]) => (
                        <li key={field} className="flex flex-wrap gap-x-2">
                          <span className="font-medium">{TRACKED_PARAMETER_LABELS[field] ?? field}:</span>
                          <span className="tabular-nums text-foreground/60">{formatTrackedValue(field, change.from)}</span>
                          <span aria-hidden="true" className="text-foreground/40">→</span>
                          <span className="tabular-nums">{formatTrackedValue(field, change.to)}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>
        </>
      )}
    </AthleteHubShell>
  );
}
