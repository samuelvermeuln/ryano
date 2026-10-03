/**
 * Writes the technical sheet a school holds for one athlete.
 *
 * Only the coach responsible for the athlete, or the school's OWNER/ADMIN, gets
 * here: the authorization is `ResolveCoachAthleteContext`, the same gate the
 * read side uses, so there is no second, weaker rule to keep in sync.
 *
 * Upsert on `(schoolId, athleteId)` — the screen edits one sheet, and creating a
 * second row would silently split the parameters the prescription reads from.
 * The write and its audit record commit together in a serializable transaction,
 * because "who changed a zone, and when" is exactly the trail the issue asks to
 * preserve.
 */
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { athleteTechnicalSheetInputSchema, diffTrackedParameters } from "../domain/athlete-technical-sheet";
import { athleteSportLevelsInputSchema, sportLevelSnapshot, sportLevelsChanged } from "../domain/athlete-sport-level";
import { SchoolError } from "../domain/errors";
import { AuditAction, AuditEntityType, AuditService } from "../infrastructure/audit-service";
import { technicalSheetScope, type CoachAthleteScopeInput } from "./coach-athlete-scope";
import { ResolveCoachAthleteContext } from "./resolve-coach-athlete-context";

export class SaveAthleteTechnicalSheet {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, scope: CoachAthleteScopeInput, athleteId: string, raw: unknown) {
    const context = await new ResolveCoachAthleteContext(this.db, this.clock)
      .execute(actorUserId, scope, athleteId);
    // SAM-50 — levels per (modality, environment) travel next to the sheet
    // fields: absent = untouched, [] = cleared. The sheet schema is strict, so
    // they are split off before it parses.
    const { sportLevels: rawLevels, ...sheetRaw } = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const input = athleteTechnicalSheetInputSchema.parse(sheetRaw);
    const sportLevels = rawLevels === undefined ? undefined : athleteSportLevelsInputSchema.parse(rawLevels);
    const sheetScope = technicalSheetScope(context, athleteId);

    const now = this.clock();
    try {
      return await this.db.$transaction(async (tx) => {
        // SAM-18 — the values in force before this save, for the revision row.
        const previousSelect = {
          id: true,
          maxHeartRate: true, thresholdHeartRate: true, restingHeartRate: true,
          thresholdPaceSecPerKm: true, ftpWatts: true, cssSecPer100m: true, heartRateZoneMethod: true,
        } as const;
        const previous = sheetScope.kind === "school"
          ? await tx.athleteTechnicalSheet.findUnique({ where: { schoolId_athleteId: sheetScope.where }, select: previousSelect })
          : await tx.athleteTechnicalSheet.findFirst({ where: sheetScope.where, select: previousSelect });

        const data = {
          sportTypes: input.sportTypes,
          experienceLevel: input.experienceLevel,
          goals: input.goals,
          targetEvent: input.targetEvent,
          targetEventDate: input.targetEventDate,
          availability: input.availability,
          equipment: input.equipment,
          restrictions: input.restrictions,
          maxHeartRate: input.maxHeartRate,
          thresholdHeartRate: input.thresholdHeartRate,
          restingHeartRate: input.restingHeartRate,
          thresholdPaceSecPerKm: input.thresholdPaceSecPerKm,
          ftpWatts: input.ftpWatts,
          cssSecPer100m: input.cssSecPer100m,
          heartRateZoneMethod: input.heartRateZoneMethod,
          notes: input.notes,
          updatedByUserId: actorUserId,
        };

        // SAM-30 — the independent sheet is keyed by (coachId, athleteId) under a
        // partial unique index Prisma cannot address with `upsert`, so it is a
        // read-then-write inside the serializable transaction; the index still
        // refuses a duplicate created by a concurrent request.
        const saved = sheetScope.kind === "school"
          ? await tx.athleteTechnicalSheet.upsert({
            where: { schoolId_athleteId: sheetScope.where },
            create: {
              id: randomUUID(),
              schoolId: sheetScope.where.schoolId,
              athleteId,
              ...data,
              createdAt: now,
              updatedAt: now,
            },
            update: { ...data, updatedAt: now },
          })
          : previous
            ? await tx.athleteTechnicalSheet.update({
              where: { id: previous.id },
              data: { ...data, updatedAt: now },
            })
            : await tx.athleteTechnicalSheet.create({
              data: {
                id: randomUUID(),
                schoolId: null,
                coachId: sheetScope.where.coachId,
                athleteId,
                ...data,
                createdAt: now,
                updatedAt: now,
              },
            });

        // SAM-18 — a parameter revision carries the values themselves (not
        // only the field names), so an old prescription can be read against
        // the thresholds that were in force when it was written.
        const changes: Record<string, unknown> = { ...diffTrackedParameters(previous, data) };

        // SAM-50 — levels are replaced as a set; the revision keeps before/after.
        if (sportLevels !== undefined) {
          const before = await tx.athleteSportLevel.findMany({
            where: { sheetId: saved.id },
            select: { sportType: true, environment: true, level: true, assessedAt: true, assessedByUserId: true },
          });
          const beforeSnapshot = sportLevelSnapshot(before);
          const afterSnapshot = sportLevelSnapshot(sportLevels.map((row) => ({ ...row, assessedAt: row.assessedAt })));
          if (sportLevelsChanged(beforeSnapshot, afterSnapshot)) {
            changes.sportLevels = { from: beforeSnapshot, to: afterSnapshot };
          }
          // A row whose (modality, environment, level, date) did not change keeps its assessor.
          const keptAssessor = new Map(before.map((row) => [
            `${row.sportType}:${row.environment}:${row.level}:${row.assessedAt?.toISOString().slice(0, 10) ?? ""}`,
            row.assessedByUserId,
          ]));
          await tx.athleteSportLevel.deleteMany({ where: { sheetId: saved.id } });
          if (sportLevels.length > 0) {
            await tx.athleteSportLevel.createMany({
              data: sportLevels.map((row) => ({
                id: randomUUID(),
                sheetId: saved.id,
                sportType: row.sportType,
                environment: row.environment,
                level: row.level,
                assessedAt: row.assessedAt,
                assessedByUserId: keptAssessor.get(
                  `${row.sportType}:${row.environment}:${row.level}:${row.assessedAt?.toISOString().slice(0, 10) ?? ""}`,
                ) ?? actorUserId,
                eventExperience: row.eventExperience,
                recentHistory: row.recentHistory,
                currentCondition: row.currentCondition,
                notes: row.notes,
                createdAt: now,
                updatedAt: now,
              })),
            });
          }
        }

        if (Object.keys(changes).length > 0) {
          await tx.athleteTechnicalSheetRevision.create({
            data: {
              id: randomUUID(),
              sheetId: saved.id,
              schoolId: context.schoolId,
              athleteId,
              changedByUserId: actorUserId,
              changes: changes as Prisma.InputJsonValue,
              changedAt: now,
            },
          });
        }

        // Independent coaching has no school log to write to (same rule as the
        // coaching requests); the revision row above is its trail.
        if (context.schoolId !== null) {
          await new AuditService(tx).log({
            schoolId: context.schoolId,
            actorUserId,
            action: AuditAction.TECHNICAL_SHEET_SAVED,
            entityType: AuditEntityType.TECHNICAL_SHEET,
            entityId: saved.id,
            // Which parameters were set, never their values: the audit trail says
            // what was touched and by whom without duplicating the athlete's data
            // into a second, less protected table.
            metadata: {
              athleteId,
              fieldsProvided: Object.entries(data)
                .filter(([key, value]) =>
                  key !== "updatedByUserId"
                  && value !== null
                  && !(Array.isArray(value) && value.length === 0))
                .map(([key]) => key),
            },
          });
        }

        return saved;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && ["P2002", "P2003", "P2034"].includes(error.code)
      ) {
        throw new SchoolError(
          "SCHOOL_CONFLICT",
          "Não foi possível salvar a ficha técnica. Atualize e tente novamente.",
          409,
        );
      }
      throw error;
    }
  }
}
