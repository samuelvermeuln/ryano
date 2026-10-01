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
import { SchoolError } from "../domain/errors";
import { AuditAction, AuditEntityType, AuditService } from "../infrastructure/audit-service";
import { ResolveCoachAthleteContext } from "./resolve-coach-athlete-context";

export class SaveAthleteTechnicalSheet {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, schoolId: string, athleteId: string, raw: unknown) {
    const context = await new ResolveCoachAthleteContext(this.db, this.clock)
      .execute(actorUserId, schoolId, athleteId);
    const input = athleteTechnicalSheetInputSchema.parse(raw);

    const now = this.clock();
    try {
      return await this.db.$transaction(async (tx) => {
        // SAM-18 — the values in force before this save, for the revision row.
        const previous = await tx.athleteTechnicalSheet.findUnique({
          where: { schoolId_athleteId: { schoolId: context.schoolId, athleteId } },
          select: {
            maxHeartRate: true, thresholdHeartRate: true, restingHeartRate: true,
            thresholdPaceSecPerKm: true, ftpWatts: true, cssSecPer100m: true, heartRateZoneMethod: true,
          },
        });

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

        const saved = await tx.athleteTechnicalSheet.upsert({
          where: { schoolId_athleteId: { schoolId: context.schoolId, athleteId } },
          create: {
            id: randomUUID(),
            schoolId: context.schoolId,
            athleteId,
            ...data,
            createdAt: now,
            updatedAt: now,
          },
          update: { ...data, updatedAt: now },
        });

        // SAM-18 — a parameter revision carries the values themselves (not
        // only the field names), so an old prescription can be read against
        // the thresholds that were in force when it was written.
        const changes = diffTrackedParameters(previous, data);
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
