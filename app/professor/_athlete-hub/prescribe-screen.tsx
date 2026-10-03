/**
 * SAM-11 — Prescrever treino para um atleta.
 *
 * Only the athlete's assigned coach gets here: `GetAthleteTechnicalSheet` runs the
 * same authorization gate as every other hub screen, and prescribing additionally
 * requires being the responsible coach (checked again in
 * `PrescribeWorkoutToAthlete` — hiding the form is not authorization).
 *
 * The technical sheet feeds the form: the modalities it declares are offered
 * first, and its maximum heart rate becomes the suggested intensity range. That is
 * the whole reason for keeping a sheet.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionCard } from "@/components/section-card";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { GetAthleteTechnicalSheet } from "@/modules/school/application/get-athlete-technical-sheet";
import { WorkoutCatalog } from "@/modules/school/application/workout-catalog";
import { SchoolError } from "@/modules/school/domain/errors";
import { addCalendarDays, todayLocalDate } from "@/modules/school/domain/local-date";
import { buildZoneOptions } from "@/modules/school/presentation/prescription-targets";
import { isRyvanoSportType, RYVANO_SPORT_TYPES, type RyvanoSportType } from "@/modules/shared/activities/sport-types";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { AthleteHubShell } from "./athlete-hub-shell";
import { athleteHubHref, hubBasePath, scopeFormValue, type CoachAthleteScope } from "./hub-scope";
import { PrescriptionBuilder } from "./prescription-builder";

const technicalSheet = new GetAthleteTechnicalSheet(prisma);

/**
 * The athlete's own modalities first, then the school's (or the independent
 * coach's), then the full canonical catalogue — a coach must never be blocked
 * from prescribing a modality just because nobody declared it yet.
 */
function orderedSportTypes(sheetSports: string[], offeredSports: string[]): RyvanoSportType[] {
  const preferred = [...sheetSports, ...offeredSports].filter(isRyvanoSportType);
  return [...new Set([...preferred, ...RYVANO_SPORT_TYPES])];
}

/** `datetime-local` needs `YYYY-MM-DDTHH:mm`; defaults to tomorrow at 06:00 in the calendar's zone (SAM-16). */
function defaultScheduledAt(timeZone: string): string {
  return `${addCalendarDays(todayLocalDate(new Date(), timeZone), 1)}T06:00`;
}

export async function PrescribeScreen({ scope, athleteId, templateId = null }: { scope: CoachAthleteScope; athleteId: string; /** SAM-58 — "Usar este modelo". */ templateId?: string | null }) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();

  let data: Awaited<ReturnType<typeof technicalSheet.execute>>;
  try {
    data = await technicalSheet.execute(session.user.id, scope, athleteId);
  } catch (error) {
    if (error instanceof SchoolError) notFound();
    throw error;
  }

  const { context, sheet } = data;

  // SAM-58 — a catalog template the coach may use pre-fills the builder; an
  // unknown, archived or foreign one is simply ignored (the form starts empty).
  const fromTemplate = templateId
    ? await new WorkoutCatalog(prisma).get(session.user.id, templateId).catch((error: unknown) => {
      if (error instanceof SchoolError) return null;
      throw error;
    })
    : null;
  const initial = fromTemplate && fromTemplate.template.status !== "ARCHIVED"
    ? {
      title: fromTemplate.template.title,
      sportType: fromTemplate.template.sportType,
      description: fromTemplate.version.content.instructions ?? fromTemplate.template.description,
      blocks: fromTemplate.version.content.blocks,
      templateId: fromTemplate.template.id,
      templateVersion: fromTemplate.version.number,
    }
    : null;
  // SAM-18 — every zone family the sheet supports, as the options the builder offers.
  const zoneOptions = buildZoneOptions(data.zones);

  // Teams belong to a school; an independent prescription has none to offer.
  const teams = scope.kind === "school"
    ? await prisma.team.findMany({
      where: { schoolId: scope.schoolId, archivedAt: null, members: { some: { athleteId } } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    })
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
        <Link
          href={athleteHubHref(scope, athleteId, "treinos")}
          className="glass-button rounded-full px-4 py-2 text-sm font-medium"
        >
          Voltar aos treinos
        </Link>
      }
    >
      <SectionCard
        title="Prescrever treino"
        description={
          sheet
            ? "A ficha técnica deste atleta sugere a modalidade e a faixa de intensidade."
            : "Este atleta ainda não tem ficha técnica; preencha-a para ganhar sugestões de intensidade."
        }
        action={
          sheet ? undefined : (
            <Link
              href={athleteHubHref(scope, athleteId, "ficha-tecnica")}
              className="text-xs font-medium text-foreground/70 underline-offset-4 hover:text-foreground hover:underline"
            >
              Preencher ficha técnica
            </Link>
          )
        }
      >
        {context.isResponsibleCoach ? (
          <PrescriptionBuilder
            schoolId={scopeFormValue(scope)}
            basePath={hubBasePath(scope, athleteId)}
            athleteId={athleteId}
            athleteName={context.athlete.name ?? context.athlete.email ?? "Atleta"}
            sportTypes={orderedSportTypes(sheet?.sportTypes ?? [], data.schoolSportTypes)}
            teams={teams}
            zoneOptions={zoneOptions}
            defaultScheduledAt={defaultScheduledAt(context.timeZone)}
            timeZone={context.timeZone}
            initial={initial}
          />
        ) : (
          <p className="theme-panel-warning rounded-[20px] border px-4 py-3 text-sm leading-6">
            {context.currentCoach
              ? `Quem prescreve para este atleta é ${context.currentCoach.name}. `
                + "Você pode acompanhar os treinos e pedir alterações, mas não prescrever no lugar dele."
              : "Este atleta não tem professor responsável. Vincule um professor antes de prescrever treinos."}
          </p>
        )}
      </SectionCard>
    </AthleteHubShell>
  );
}
