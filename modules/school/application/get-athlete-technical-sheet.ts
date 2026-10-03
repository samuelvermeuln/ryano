/**
 * Reads the technical sheet a school holds for one athlete, plus the training
 * zones derived from it and the history of its parameters.
 *
 * Returns `sheet: null` when none was written yet — that is the normal state of
 * a newly arrived athlete, and the screen offers "Adicionar ficha técnica"
 * rather than rendering a form full of dashes as if they were data.
 *
 * Authorization is the coach-athlete gate, not a new rule: whoever may read the
 * athlete's current data in this school may read the parameters used to
 * prescribe for them.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import type { ParameterChanges } from "../domain/athlete-technical-sheet";
import {
  availableHeartRateMethods,
  deriveTrainingZones,
  HEART_RATE_ZONE_METHODS,
  type HeartRateZoneMethod,
  type TrainingZones,
  type ZoneParameters,
} from "../domain/training-zones";
import { technicalSheetScope, type CoachAthleteScopeInput } from "./coach-athlete-scope";
import { ResolveCoachAthleteContext, type CoachAthleteContext } from "./resolve-coach-athlete-context";

const REVISIONS_SHOWN = 20;

export type TechnicalSheetRevisionView = {
  id: string;
  changedAt: Date;
  changedByName: string | null;
  changes: ParameterChanges;
};

export type AthleteTechnicalSheetView = {
  context: CoachAthleteContext;
  sheet: {
    id: string;
    sportTypes: string[];
    experienceLevel: string | null;
    goals: string | null;
    targetEvent: string | null
    targetEventDate: Date | null;
    availability: string | null;
    equipment: string | null;
    restrictions: string | null;
    maxHeartRate: number | null;
    thresholdHeartRate: number | null;
    restingHeartRate: number | null;
    thresholdPaceSecPerKm: number | null;
    ftpWatts: number | null;
    cssSecPer100m: number | null;
    heartRateZoneMethod: HeartRateZoneMethod | null;
    notes: string | null;
    updatedAt: Date;
    updatedByName: string | null;
    revisionCount: number;
    /** SAM-50 — level per (modality, environment), in modality order. */
    sportLevels: Array<{
      sportType: string;
      environment: string;
      level: string;
      assessedAt: Date | null;
      assessedByName: string | null;
      eventExperience: string | null;
      recentHistory: string | null;
      currentCondition: string | null;
      notes: string | null;
    }>;
  } | null;
  /** SAM-18 — every family whose parameter exists; `heartRate` null without a reference. */
  zones: TrainingZones;
  /** Heart-rate methods the current parameters support (the editor offers only these). */
  availableHeartRateMethods: HeartRateZoneMethod[];
  /** SAM-18 — most recent parameter changes, newest first. */
  revisions: TechnicalSheetRevisionView[];
  /** The modalities this school serves, offered first by the editor. */
  schoolSportTypes: string[];
};

function asMethod(value: string | null): HeartRateZoneMethod | null {
  return (HEART_RATE_ZONE_METHODS as readonly string[]).includes(value ?? "") ? (value as HeartRateZoneMethod) : null;
}

export const EMPTY_ZONE_PARAMETERS: ZoneParameters = {
  maxHeartRate: null, thresholdHeartRate: null, restingHeartRate: null,
  thresholdPaceSecPerKm: null, ftpWatts: null, cssSecPer100m: null, heartRateZoneMethod: null,
};

export class GetAthleteTechnicalSheet {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, scope: CoachAthleteScopeInput, athleteId: string): Promise<AthleteTechnicalSheetView> {
    const context = await new ResolveCoachAthleteContext(this.db, this.clock)
      .execute(actorUserId, scope, athleteId);
    const sheetScope = technicalSheetScope(context, athleteId);
    const select = {
      id: true, sportTypes: true, experienceLevel: true, goals: true,
      targetEvent: true, targetEventDate: true, availability: true, equipment: true,
      restrictions: true, maxHeartRate: true, thresholdHeartRate: true, restingHeartRate: true,
      thresholdPaceSecPerKm: true, ftpWatts: true, cssSecPer100m: true, heartRateZoneMethod: true, notes: true,
      updatedAt: true,
      updatedBy: { select: { name: true, email: true } },
      revisions: {
        orderBy: [{ changedAt: "desc" }, { id: "desc" }],
        take: REVISIONS_SHOWN,
        select: { id: true, changedAt: true, changes: true, changedBy: { select: { name: true, email: true } } },
      },
      sportLevels: {
        orderBy: [{ sportType: "asc" }, { environment: "asc" }],
        select: {
          sportType: true, environment: true, level: true, assessedAt: true,
          eventExperience: true, recentHistory: true, currentCondition: true, notes: true,
          assessedBy: { select: { name: true, email: true } },
        },
      },
    } satisfies Prisma.AthleteTechnicalSheetSelect;

    const [row, sportTypesOwner] = await Promise.all([
      sheetScope.kind === "school"
        ? this.db.athleteTechnicalSheet.findUnique({ where: { schoolId_athleteId: sheetScope.where }, select })
        : this.db.athleteTechnicalSheet.findFirst({ where: sheetScope.where, select }),
      // The modalities offered first by the editor: the school's, or — with no
      // school — the ones the independent coach declares on their profile (SAM-28).
      sheetScope.kind === "school"
        ? this.db.school.findUnique({ where: { id: sheetScope.where.schoolId }, select: { sportTypes: true } })
        : this.db.coachProfile.findUnique({ where: { id: context.coachId }, select: { sportTypes: true } }),
    ]);

    const parameters: ZoneParameters = row
      ? {
        maxHeartRate: row.maxHeartRate,
        thresholdHeartRate: row.thresholdHeartRate,
        restingHeartRate: row.restingHeartRate,
        thresholdPaceSecPerKm: row.thresholdPaceSecPerKm,
        ftpWatts: row.ftpWatts,
        cssSecPer100m: row.cssSecPer100m,
        heartRateZoneMethod: asMethod(row.heartRateZoneMethod),
      }
      : EMPTY_ZONE_PARAMETERS;

    return {
      context,
      sheet: row
        ? (({ revisions, updatedBy, sportLevels, ...rest }) => ({
          ...rest,
          revisionCount: revisions.length,
          heartRateZoneMethod: asMethod(rest.heartRateZoneMethod),
          updatedByName: updatedBy?.name ?? updatedBy?.email ?? null,
          sportLevels: (sportLevels ?? []).map(({ assessedBy, ...level }) => ({
            ...level,
            assessedByName: assessedBy?.name ?? assessedBy?.email ?? null,
          })),
        }))(row)
        : null,
      zones: deriveTrainingZones(parameters),
      availableHeartRateMethods: availableHeartRateMethods(parameters),
      revisions: (row?.revisions ?? []).map((revision) => ({
        id: revision.id,
        changedAt: revision.changedAt,
        changedByName: revision.changedBy?.name ?? revision.changedBy?.email ?? null,
        changes: (revision.changes ?? {}) as ParameterChanges,
      })),
      schoolSportTypes: sportTypesOwner?.sportTypes ?? [],
    };
  }
}
