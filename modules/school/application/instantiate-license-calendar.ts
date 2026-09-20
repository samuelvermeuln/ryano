import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { TrainingLicenseStatus, WorkoutAssignmentStatus } from "../domain/enums";
import { planPayloadSchema } from "../domain/training-product-version";
import { createWorkoutAssignment } from "../domain/workout-assignment";
import { schoolLogger } from "../infrastructure/logger";

export const instantiateLicenseCalendarSchema = z.strictObject({
  licenseId: z.string().min(1),
  /** Absolute date for "week 1 / day 1". Defaults to now when omitted. */
  startDate: z.union([z.iso.datetime(), z.date()]).optional().transform((v) => (v ? new Date(v) : undefined)),
});
export type InstantiateLicenseCalendarInput = z.infer<typeof instantiateLicenseCalendarSchema>;

/** ISO weekday offset from Monday (1=Mon … 7=Sun) relative to the plan's startDate Monday. */
function scheduledDateForDay(startMonday: Date, week: number, dayOfWeek: number): Date {
  const d = new Date(startMonday);
  d.setUTCDate(d.getUTCDate() + (week - 1) * 7 + (dayOfWeek - 1));
  return d;
}

/** Returns the most recent Monday at 00:00 UTC on or before `from`. */
function toMonday(from: Date): Date {
  const d = new Date(from);
  const dow = d.getUTCDay(); // 0=Sun
  const offset = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - offset);
  d.setUTCHours(0, 0, 0, 0);
  return d;
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
      const startMonday = toMonday(input.startDate ?? license.startedAt ?? now);

      const assignmentRows = plan.weeks.flatMap((week) =>
        week.days.map((day) => {
          const scheduledAt = scheduledDateForDay(startMonday, week.week, day.dayOfWeek);
          const assignment = createWorkoutAssignment(
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
              dueAt: new Date(scheduledAt.getTime() + 23 * 60 * 60 * 1000), // EOD
              status: WorkoutAssignmentStatus.SCHEDULED,
              matchStatus: null,
              matchedActivityId: null,
              matchedAt: null,
              matchScore: null,
              trainingLicenseId: license.id,
            },
            now,
          );
          return assignment;
        }),
      );

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
        data: { calendarInstantiated: true, updatedAt: now },
      });

      log.info("license_calendar_done", { licenseId: license.id, created: assignmentRows.length });
      return { licenseId: license.id, created: assignmentRows.length, alreadyInstantiated: false };
    });
  }
}
