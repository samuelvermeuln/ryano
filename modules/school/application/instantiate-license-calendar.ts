import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { TrainingLicenseStatus, WorkoutAssignmentStatus } from "../domain/enums";
import { planPayloadSchema, type PlanPayload } from "../domain/training-product-version";
import { createWorkoutAssignment } from "../domain/workout-assignment";
import { schoolLogger } from "../infrastructure/logger";
import { addCalendarDays, isValidLocalDate, localMidnightToUtc, mondayOnOrBefore, type LocalDate } from "../domain/local-date";

export const instantiateLicenseCalendarSchema = z.strictObject({
  licenseId: z.string().min(1),
  /** IANA timezone (e.g. "America/Sao_Paulo") — required (RF-006): every day is anchored in the athlete's local calendar, never UTC. */
  timezone: z.string().min(1),
  /** "YYYY-MM-DD" for "week 1 / day 1", in the athlete's local calendar. */
  startLocalDate: z.string().refine(isValidLocalDate, { message: "startLocalDate must be a valid YYYY-MM-DD date" }),
});
export type InstantiateLicenseCalendarInput = z.infer<typeof instantiateLicenseCalendarSchema>;

/**
 * TM011 (RF-006) — local date of `week`/`dayOfWeek`, anchored on the Monday
 * on/before `startLocalDate`. Pure calendar-date arithmetic; the timezone is
 * only applied once, when converting THIS SPECIFIC day to a UTC instant (see
 * `local-date.ts`), so each day gets the correct DST offset for its own date
 * instead of inheriting the offset of day 1.
 */
function localDateForDay(startMonday: string, week: number, dayOfWeek: number): string {
  return addCalendarDays(startMonday, (week - 1) * 7 + (dayOfWeek - 1));
}

/** Day offset from week 1 / day 1 (Monday), 0-based — exported for TARGET_EVENT_DATE anchoring (TM041, ActivateTrainingLicense). */
export function planDayOffset(week: number, dayOfWeek: number): number {
  return (week - 1) * 7 + (dayOfWeek - 1);
}

export interface PlannedAssignmentDay {
  localDate: LocalDate;
  week: number;
  dayOfWeek: number;
  workoutTemplateId: string;
  note?: string;
}

/**
 * TM041 — pure day-computation extracted from `execute()` below, so
 * `ActivateTrainingLicense`'s conflict preview can compute the exact same
 * calendar `InstantiateLicenseCalendar.execute()` will materialize, without
 * duplicating the Monday-anchoring/day-offset arithmetic. Behavior-preserving
 * extraction — `execute()`'s output is unchanged (see tests/instantiate-license-calendar.test.ts).
 */
export function computePlannedDays(plan: PlanPayload, startLocalDate: LocalDate): PlannedAssignmentDay[] {
  const startMonday = mondayOnOrBefore(startLocalDate);
  return plan.weeks.flatMap((week) =>
    week.days.map((day) => ({
      localDate: localDateForDay(startMonday, week.week, day.dayOfWeek),
      week: week.week,
      dayOfWeek: day.dayOfWeek,
      workoutTemplateId: day.workoutTemplateId,
      note: day.note,
    })),
  );
}

/**
 * T406 — Materialise workout assignments from a training license's plan payload.
 *
 * Idempotent: if calendarInstantiated is already true the operation returns
 * the existing license record without creating duplicate assignments.
 */
export class InstantiateLicenseCalendar {
  constructor(
    private readonly db: PrismaClient,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(raw: unknown) {
    const log = schoolLogger("instantiate-license-calendar");
    const input = instantiateLicenseCalendarSchema.parse(raw);
    const now = this.clock();

    log.info("license_calendar_start", { licenseId: input.licenseId, correlationId: log.correlationId });

    return this.db.$transaction(async (tx) => {
      const license = await tx.trainingLicense.findUnique({
        where: { id: input.licenseId },
        select: {
          id: true, athleteId: true, versionId: true, status: true,
          calendarInstantiated: true, startedAt: true,
        },
      });

      if (!license) throw new SchoolError("LICENSE_NOT_FOUND", "Licença não encontrada.", 404);
      if (license.status !== TrainingLicenseStatus.ACTIVE) {
        throw new SchoolError("LICENSE_NOT_ACTIVE", "Licença não está ativa.", 409);
      }
      if (license.calendarInstantiated) {
        log.info("license_calendar_already_done", { licenseId: license.id });
        return { licenseId: license.id, created: 0, alreadyInstantiated: true };
      }

      const version = await tx.trainingProductVersion.findUnique({
        where: { id: license.versionId },
        select: { id: true, planPayload: true },
      });
      if (!version) throw new SchoolError("VERSION_NOT_FOUND", "Versão do produto não encontrada.", 404);

      const plan = planPayloadSchema.parse(version.planPayload);
      const plannedDays = computePlannedDays(plan, input.startLocalDate);

      const assignmentRows = plannedDays.map((day) => {
        const scheduledAt = localMidnightToUtc(day.localDate, input.timezone);
        // End of THIS local day = local midnight of the NEXT day, converted
        // independently — correct even when the day itself is 23h/25h long.
        const dueAt = localMidnightToUtc(addCalendarDays(day.localDate, 1), input.timezone);
        return createWorkoutAssignment(
          {
            id: randomUUID(),
            workoutId: null,
            workoutTemplateId: day.workoutTemplateId,
            athleteId: license.athleteId,
            assignedBy: null,
            schoolId: null,
            coachId: null,
            teamId: null,
            scheduledAt,
            dueAt,
            status: WorkoutAssignmentStatus.SCHEDULED,
            matchStatus: null,
            matchedActivityId: null,
            matchedAt: null,
            matchScore: null,
            trainingLicenseId: license.id,
          },
          now,
        );
      });

      await tx.workoutAssignment.createMany({
        data: assignmentRows.map((a) => ({
          id: a.id,
          workoutId: a.workoutId,
          workoutTemplateId: a.workoutTemplateId,
          athleteId: a.athleteId,
          assignedBy: a.assignedBy,
          schoolId: a.schoolId,
          teamId: a.teamId,
          scheduledAt: a.scheduledAt,
          dueAt: a.dueAt,
          status: a.status,
          matchStatus: a.matchStatus,
          matchedActivityId: a.matchedActivityId,
          matchedAt: a.matchedAt,
          matchScore: a.matchScore,
          trainingLicenseId: a.trainingLicenseId,
        })),
      });

      await tx.trainingLicense.update({
        where: { id: license.id },
        // TM041 — calendarInstantiatedAt (migration 0039) records when this
        // happened; additive, does not change the pre-existing
        // calendarInstantiated/updatedAt contract other callers rely on.
        data: { calendarInstantiated: true, calendarInstantiatedAt: now, updatedAt: now },
      });

      log.info("license_calendar_done", { licenseId: license.id, created: assignmentRows.length });
      return { licenseId: license.id, created: assignmentRows.length, alreadyInstantiated: false };
    });
  }
}
