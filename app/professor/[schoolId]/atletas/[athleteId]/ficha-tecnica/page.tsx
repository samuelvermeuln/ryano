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
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { formatHeartRate, formatPace, formatPower, formatSwimPace } from "@/lib/format";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { GetAthleteTechnicalSheet } from "@/modules/school/application/get-athlete-technical-sheet";
import { SchoolError } from "@/modules/school/domain/errors";
import { EXPERIENCE_LEVEL_LABELS } from "@/modules/school/presentation/workout-labels";
import { isRyvanoSportType, resolveSportLabel, type RyvanoSportType } from "@/modules/shared/activities/sport-types";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { AthleteHubShell } from "../athlete-hub-shell";
import { TechnicalSheetForm } from "./technical-sheet-form";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string; athleteId: string }> };

const technicalSheet = new GetAthleteTechnicalSheet(prisma);

/** Seconds → "mm:ss", the form's own notation. */
function toPaceInput(seconds: number | null): string | null {
  if (seconds === null) return null;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export default async function AthleteTechnicalSheetPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId, athleteId } = await params;

  let data: Awaited<ReturnType<typeof technicalSheet.execute>>;
  try {
    data = await technicalSheet.execute(session.user.id, schoolId, athleteId);
  } catch (error) {
    if (error instanceof SchoolError) notFound();
    throw error;
  }

  const { context, sheet, heartRateZones } = data;

  // The school's modalities plus anything already on the sheet, so a value set
  // before a school changed its offering never silently disappears from the form.
  const offeredSports: RyvanoSportType[] = [...new Set(
    [...data.schoolSportTypes, ...(sheet?.sportTypes ?? [])].filter(isRyvanoSportType),
  )];

  const editor = (
    <TechnicalSheetForm
      schoolId={schoolId}
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
        notes: sheet?.notes ?? null,
      }}
    />
  );

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
      schoolId={schoolId}
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
                : "Parâmetros declarados para este atleta nesta escola."
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
              description="Derivadas da FC máxima, com as mesmas faixas usadas nas atividades."
            >
              {heartRateZones.length === 0 ? (
                <EmptyState
                  title="Zonas não configuradas"
                  description="Informe a FC máxima na ficha técnica para que as cinco zonas sejam calculadas."
                  action={editor}
                />
              ) : (
                <ul className="space-y-2">
                  {heartRateZones.map((zone) => (
                    <li
                      key={zone.zone}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm"
                    >
                      <span className="font-medium">Z{zone.zone}</span>
                      <span className="text-xs text-foreground/55">
                        {zone.fromPercent}–{zone.toPercent}% FCmáx
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
        </>
      )}
    </AthleteHubShell>
  );
}
