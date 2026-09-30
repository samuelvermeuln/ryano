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
import { deriveHeartRateZones } from "@/modules/school/domain/athlete-technical-sheet";
import { SchoolError } from "@/modules/school/domain/errors";
import { addCalendarDays, todayLocalDate } from "@/modules/school/domain/local-date";
import { isRyvanoSportType, RYVANO_SPORT_TYPES, type RyvanoSportType } from "@/modules/shared/activities/sport-types";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { AthleteHubShell, athleteHubHref } from "../../athlete-hub-shell";
import { PrescriptionBuilder } from "./prescription-builder";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string; athleteId: string }> };

const technicalSheet = new GetAthleteTechnicalSheet(prisma);

/**
 * The athlete's own modalities first, then the school's, then the full canonical
 * catalogue — a coach must never be blocked from prescribing a modality just
 * because nobody declared it yet.
 */
function orderedSportTypes(sheetSports: string[], schoolSports: string[]): RyvanoSportType[] {
  const preferred = [...sheetSports, ...schoolSports].filter(isRyvanoSportType);
  return [...new Set([...preferred, ...RYVANO_SPORT_TYPES])];
}

/** `datetime-local` needs `YYYY-MM-DDTHH:mm`; defaults to tomorrow at 06:00 in the school's zone (SAM-16). */
function defaultScheduledAt(timeZone: string): string {
  return `${addCalendarDays(todayLocalDate(new Date(), timeZone), 1)}T06:00`;
}

export default async function PrescribeWorkoutPage({ params }: PageProps) {
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

  const { context, sheet } = data;
  const zones = deriveHeartRateZones(sheet?.maxHeartRate ?? null);
  // Zone 2 is the default suggestion: the range a coach reaches for most often,
  // and it is only offered when the sheet actually records a maximum heart rate.
  const zone2 = zones.find((zone) => zone.zone === 2) ?? null;

  const teams = await prisma.team.findMany({
    where: { schoolId: context.schoolId, archivedAt: null, members: { some: { athleteId } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <AthleteHubShell
      schoolId={schoolId}
      athlete={context.athlete}
      teams={context.teams}
      currentCoach={context.currentCoach}
      isResponsibleCoach={context.isResponsibleCoach}
      active="treinos"
      actions={
        <Link
          href={athleteHubHref(schoolId, athleteId, "treinos")}
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
              href={athleteHubHref(schoolId, athleteId, "ficha-tecnica")}
              className="text-xs font-medium text-foreground/70 underline-offset-4 hover:text-foreground hover:underline"
            >
              Preencher ficha técnica
            </Link>
          )
        }
      >
        {context.isResponsibleCoach ? (
          <PrescriptionBuilder
            schoolId={schoolId}
            athleteId={athleteId}
            athleteName={context.athlete.name ?? context.athlete.email ?? "Atleta"}
            sportTypes={orderedSportTypes(sheet?.sportTypes ?? [], data.schoolSportTypes)}
            teams={teams}
            suggestedHeartRate={zone2 ? { min: zone2.fromBpm, max: zone2.toBpm } : null}
            defaultScheduledAt={defaultScheduledAt(context.timeZone)}
            timeZone={context.timeZone}
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
