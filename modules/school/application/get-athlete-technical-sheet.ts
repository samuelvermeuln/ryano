/**
 * Reads the technical sheet a school holds for one athlete, plus the heart-rate
 * zones derived from it.
 *
 * Returns `sheet: null` when none was written yet — that is the normal state of
 * a newly arrived athlete, and the screen offers "Adicionar ficha técnica"
 * rather than rendering a form full of dashes as if they were data.
 *
 * Authorization is the coach-athlete gate, not a new rule: whoever may read the
 * athlete's current data in this school may read the parameters used to
 * prescribe for them.
 */
import type { PrismaClient } from "@prisma/client";
import { deriveHeartRateZones, type HeartRateZone } from "../domain/athlete-technical-sheet";
import { ResolveCoachAthleteContext, type CoachAthleteContext } from "./resolve-coach-athlete-context";

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
    notes: string | null;
    updatedAt: Date;
    updatedByName: string | null;
  } | null;
  /** Empty when no reference maximum heart rate is recorded. */
  heartRateZones: HeartRateZone[];
  /** The modalities this school serves, offered first by the editor. */
  schoolSportTypes: string[];
};

export class GetAthleteTechnicalSheet {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, schoolId: string, athleteId: string): Promise<AthleteTechnicalSheetView> {
    const context = await new ResolveCoachAthleteContext(this.db, this.clock)
      .execute(actorUserId, schoolId, athleteId);

    const [row, school] = await Promise.all([
      this.db.athleteTechnicalSheet.findUnique({
        where: { schoolId_athleteId: { schoolId: context.schoolId, athleteId } },
        select: {
          id: true, sportTypes: true, experienceLevel: true, goals: true,
          targetEvent: true, targetEventDate: true, availability: true, equipment: true,
          restrictions: true, maxHeartRate: true, thresholdHeartRate: true, restingHeartRate: true,
          thresholdPaceSecPerKm: true, ftpWatts: true, cssSecPer100m: true, notes: true,
          updatedAt: true,
          updatedBy: { select: { name: true, email: true } },
        },
      }),
      this.db.school.findUnique({ where: { id: context.schoolId }, select: { sportTypes: true } }),
    ]);

    return {
      context,
      sheet: row
        ? {
          ...row,
          updatedByName: row.updatedBy?.name ?? row.updatedBy?.email ?? null,
        }
        : null,
      heartRateZones: deriveHeartRateZones(row?.maxHeartRate ?? null),
      schoolSportTypes: school?.sportTypes ?? [],
    };
  }
}
