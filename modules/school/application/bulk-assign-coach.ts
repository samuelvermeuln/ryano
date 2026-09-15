import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { assignCoachToAthleteInTransaction } from "./assign-coach-to-athlete";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);
export const bulkAssignCoachSchema = z.strictObject({
  coachId: id,
  athleteIds: z.array(id).min(1).max(100).refine((ids) => new Set(ids).size === ids.length, "Não repita atletas no lote."),
});

export type BulkAssignCoachInput = z.infer<typeof bulkAssignCoachSchema>;
export type BulkAssignCoachResult = {
  items: Awaited<ReturnType<typeof assignCoachToAthleteInTransaction>>[];
};

export class BulkAssignCoach {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, schoolId: string, raw: unknown): Promise<BulkAssignCoachResult> {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const school = id.safeParse(schoolId);
    const input = bulkAssignCoachSchema.safeParse(raw);
    if (!school.success || !input.success) throw new SchoolError("INVALID_INPUT", "Informe escola, professor e até 100 atletas distintos válidos.", 400);
    try {
      return await this.db.$transaction(async (tx) => {
        const now = this.clock();
        const items: BulkAssignCoachResult["items"] = [];
        // A failed member rolls back every assignment, including any associated events.
        for (const athleteId of input.data.athleteIds) {
          items.push(await assignCoachToAthleteInTransaction(tx, actor.data, school.data, athleteId, input.data.coachId, now));
        }
        return { items };
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        // The bounded batch performs the same membership checks as single assignment.
        timeout: 30_000,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2025", "P2034"].includes(error.code)) {
        throw new SchoolError("COACH_ATHLETE_ASSIGNMENT_CONFLICT", "Os vínculos foram alterados. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }
}
