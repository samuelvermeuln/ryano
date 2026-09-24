import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { TrainingLicenseActivationMode, TrainingLicenseStatus } from "../domain/enums";
import { planPayloadSchema, type PlanPayload } from "../domain/training-product-version";
import { schoolMetrics } from "../infrastructure/metrics";
import {
  addCalendarDays, isValidLocalDate, localMidnightToUtc, mondayOnOrBefore, todayLocalDate, type LocalDate,
} from "../domain/local-date";
import {
  computePlannedDays, planDayOffset, InstantiateLicenseCalendar, type PlannedAssignmentDay,
} from "./instantiate-license-calendar";

const localDate = z.string().refine(isValidLocalDate, { message: "Data local inválida (esperado YYYY-MM-DD)" });

export const activateTrainingLicenseSchema = z.strictObject({
  licenseId: z.string().min(1),
  mode: z.enum(TrainingLicenseActivationMode),
  /** IANA timezone — required for every mode (RF-006/RF-109). */
  timezone: z.string().min(1),
  /** Required (and only meaningful) for START_ON_DATE. */
  startLocalDate: localDate.optional(),
  /** Required (and only meaningful) for TARGET_EVENT_DATE. */
  targetEventDate: localDate.optional(),
  /** Optimistic-concurrency token: the license's `updatedAt` as last read by the client (RNF-003). Optional — omitting it just relies on the idempotent-activation check below. */
  expectedVersion: z.string().min(1).optional(),
  /** RF-109 — when true, compute and return the calendar + conflicts WITHOUT writing anything. */
  preview: z.boolean().default(false),
}).superRefine((v, ctx) => {
  if (v.mode === TrainingLicenseActivationMode.START_ON_DATE && !v.startLocalDate) {
    ctx.addIssue({ code: "custom", path: ["startLocalDate"], message: "startLocalDate é obrigatório para o modo START_ON_DATE" });
  }
  if (v.mode === TrainingLicenseActivationMode.TARGET_EVENT_DATE && !v.targetEventDate) {
    ctx.addIssue({ code: "custom", path: ["targetEventDate"], message: "targetEventDate é obrigatório para o modo TARGET_EVENT_DATE" });
  }
});
export type ActivateTrainingLicenseInput = z.infer<typeof activateTrainingLicenseSchema>;

type OwnedLicense = {
  id: string; athleteId: string; versionId: string; status: string;
  activationMode: string | null; activationStatus: string;
  timezone: string | null; chosenStartLocalDate: string | null; anchorEventLocalDate: string | null;
  updatedAt: Date;
};

/**
 * TM041 (RF-109) — wraps `InstantiateLicenseCalendar` (TM011/RF-006) with
 * the athlete-facing activation flow: ownership check, START_NOW/
 * START_ON_DATE/TARGET_EVENT_DATE mode resolution, a conflict preview before
 * confirming, and idempotent confirmation across duplicate/double-tab
 * requests. Does not reimplement any timezone/calendar-day arithmetic —
 * everything date-shaped comes from `local-date.ts` and
 * `computePlannedDays`/`InstantiateLicenseCalendar` (instantiate-license-calendar.ts).
 *
 * TARGET_EVENT_DATE anchoring: the start date is computed by counting back
 * from `targetEventDate` by the plan's total day-span, then snapping to that
 * week's Monday (same anchoring convention `InstantiateLicenseCalendar`
 * already applies to every other mode). When the athlete's chosen event date
 * falls on the same weekday as the plan's last prescribed day, the last
 * session lands exactly on `targetEventDate`; otherwise it lands within that
 * final week (documented limitation — the product spec does not define stricter
 * behavior for a mismatched weekday, see STATUS.md Q1/decisions).
 */
export class ActivateTrainingLicense {
  private readonly instantiate: InstantiateLicenseCalendar;

  constructor(
    private readonly db: PrismaClient,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.instantiate = new InstantiateLicenseCalendar(db, clock);
  }

  async execute(actorAthleteId: string, raw: unknown) {
    const input = activateTrainingLicenseSchema.parse(raw);
    const now = this.clock();

    if (input.preview) {
      return this.buildPreview(actorAthleteId, input, now);
    }

    const activation = await this.db.$transaction(async (tx) => {
      const license = await loadOwnedActiveLicense(tx, actorAthleteId, input.licenseId);
      const plan = await loadPlan(tx, license.versionId);
      const startLocalDate = resolveStartLocalDate(input, plan, now);

      if (license.activationStatus === "ACTIVATED") {
        if (matchesRecordedActivation(license, input, startLocalDate)) {
          // Idempotent retry (double-tab): the exact same choice was already
          // recorded. No new write — fall through to (re)instantiate, which
          // is itself idempotent via `calendarInstantiated` and also heals a
          // license whose fields were set but whose calendar materialization
          // never completed (e.g. a crash between the two steps).
          return { license, startLocalDate, wrote: false };
        }
        throw new SchoolError("LICENSE_ALREADY_ACTIVE", "Esta licença já foi ativada com outra escolha de início.", 409);
      }

      if (input.expectedVersion && license.updatedAt.toISOString() !== input.expectedVersion) {
        throw new SchoolError("LICENSE_ALREADY_ACTIVE", "A licença foi alterada. Recarregue e tente novamente.", 409);
      }

      await tx.trainingLicense.update({
        where: { id: license.id },
        data: {
          activationMode: input.mode,
          activationStatus: "ACTIVATED",
          timezone: input.timezone,
          chosenStartLocalDate: input.mode === TrainingLicenseActivationMode.TARGET_EVENT_DATE ? null : startLocalDate,
          anchorEventLocalDate: input.mode === TrainingLicenseActivationMode.TARGET_EVENT_DATE ? (input.targetEventDate ?? null) : null,
          startedAt: localMidnightToUtc(startLocalDate, input.timezone),
          updatedAt: now,
        },
      });
      return { license, startLocalDate, wrote: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const result = await this.instantiate.execute({
      licenseId: activation.license.id, timezone: input.timezone, startLocalDate: activation.startLocalDate,
    });

    // TM052 (RNF-008) — only the genuine first activation, not idempotent replays.
    if (!result.alreadyInstantiated) {
      schoolMetrics.marketplaceLicenseActivated({
        licenseId: activation.license.id, athleteId: actorAthleteId, mode: input.mode,
      });
    }

    return { preview: false as const, ...result, startLocalDate: activation.startLocalDate, timezone: input.timezone };
  }

  private async buildPreview(actorAthleteId: string, input: ActivateTrainingLicenseInput, now: Date) {
    const license = await loadOwnedActiveLicense(this.db, actorAthleteId, input.licenseId);
    const plan = await loadPlan(this.db, license.versionId);
    const startLocalDate = resolveStartLocalDate(input, plan, now);
    const plannedDays = computePlannedDays(plan, startLocalDate);
    const conflicts = await this.findConflicts(license.athleteId, license.id, input.timezone, plannedDays);

    return {
      preview: true as const,
      licenseId: license.id,
      startLocalDate,
      timezone: input.timezone,
      weeks: groupByWeek(plannedDays),
      conflicts,
    };
  }

  private async findConflicts(
    athleteId: string, licenseId: string, timezone: string, plannedDays: PlannedAssignmentDay[],
  ): Promise<Array<{ localDate: LocalDate; existingAssignmentId: string }>> {
    if (plannedDays.length === 0) return [];
    const localDates = plannedDays.map((d) => d.localDate);
    const min = localDates.reduce((a, b) => (a < b ? a : b));
    const max = localDates.reduce((a, b) => (a > b ? a : b));

    const existing = await this.db.workoutAssignment.findMany({
      where: {
        athleteId,
        trainingLicenseId: { not: licenseId },
        status: { notIn: ["CANCELLED"] },
        scheduledAt: { gte: localMidnightToUtc(min, timezone), lt: localMidnightToUtc(addCalendarDays(max, 1), timezone) },
      },
      select: { id: true, scheduledAt: true },
    });

    const plannedLocalDates = new Set(plannedDays.map((d) => d.localDate));
    const conflicts: Array<{ localDate: LocalDate; existingAssignmentId: string }> = [];
    for (const row of existing) {
      if (!row.scheduledAt) continue;
      const rowLocalDate = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(row.scheduledAt);
      if (plannedLocalDates.has(rowLocalDate)) conflicts.push({ localDate: rowLocalDate, existingAssignmentId: row.id });
    }
    return conflicts;
  }
}

type LicenseReader = Pick<PrismaClient, "trainingLicense"> | { trainingLicense: Pick<PrismaClient["trainingLicense"], "findUnique"> };
type VersionReader = Pick<PrismaClient, "trainingProductVersion"> | { trainingProductVersion: Pick<PrismaClient["trainingProductVersion"], "findUnique"> };

async function loadOwnedActiveLicense(db: LicenseReader, actorAthleteId: string, licenseId: string): Promise<OwnedLicense> {
  const license = await db.trainingLicense.findUnique({
    where: { id: licenseId },
    select: {
      id: true, athleteId: true, versionId: true, status: true,
      activationMode: true, activationStatus: true, timezone: true,
      chosenStartLocalDate: true, anchorEventLocalDate: true, updatedAt: true,
    },
  });
  if (!license) throw new SchoolError("LICENSE_NOT_FOUND", "Licença não encontrada.", 404);
  // RNF-001 — out-of-scope access responds 404, never 403: a guessed
  // licenseId belonging to another athlete must not confirm its existence.
  if (license.athleteId !== actorAthleteId) throw new SchoolError("LICENSE_NOT_FOUND", "Licença não encontrada.", 404);
  if (license.status !== TrainingLicenseStatus.ACTIVE) {
    throw new SchoolError("LICENSE_NOT_ACTIVE", "Licença não está ativa.", 409);
  }
  return license;
}

async function loadPlan(db: VersionReader, versionId: string): Promise<PlanPayload> {
  const version = await db.trainingProductVersion.findUnique({ where: { id: versionId }, select: { planPayload: true } });
  if (!version) throw new SchoolError("VERSION_NOT_FOUND", "Versão do produto não encontrada.", 404);
  return planPayloadSchema.parse(version.planPayload);
}

function resolveStartLocalDate(input: ActivateTrainingLicenseInput, plan: PlanPayload, now: Date): LocalDate {
  if (input.mode === TrainingLicenseActivationMode.START_NOW) {
    return todayLocalDate(now, input.timezone);
  }
  if (input.mode === TrainingLicenseActivationMode.START_ON_DATE) {
    return input.startLocalDate as LocalDate; // required by schema superRefine
  }
  // TARGET_EVENT_DATE — see class doc for the anchoring rationale.
  let maxOffset = 0;
  for (const week of plan.weeks) {
    for (const day of week.days) {
      maxOffset = Math.max(maxOffset, planDayOffset(week.week, day.dayOfWeek));
    }
  }
  const backdated = addCalendarDays(input.targetEventDate as LocalDate, -maxOffset);
  return mondayOnOrBefore(backdated);
}

function matchesRecordedActivation(license: OwnedLicense, input: ActivateTrainingLicenseInput, startLocalDate: LocalDate): boolean {
  if (license.activationMode !== input.mode || license.timezone !== input.timezone) return false;
  if (input.mode === TrainingLicenseActivationMode.TARGET_EVENT_DATE) {
    return license.anchorEventLocalDate === input.targetEventDate;
  }
  return license.chosenStartLocalDate === startLocalDate;
}

function groupByWeek(days: PlannedAssignmentDay[]) {
  const byWeek = new Map<number, PlannedAssignmentDay[]>();
  for (const day of days) {
    const list = byWeek.get(day.week);
    if (list) list.push(day); else byWeek.set(day.week, [day]);
  }
  return Array.from(byWeek.entries())
    .sort(([a], [b]) => a - b)
    .map(([week, weekDays]) => ({ week, days: weekDays }));
}
