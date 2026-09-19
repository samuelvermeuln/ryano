import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { TemplateStatus, WorkoutOwnerType } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { createWorkoutTemplate } from "../domain/workout-template";
import { WorkoutTemplateRepository } from "../infrastructure/workout-template-repository";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const createWorkoutTemplateSchema = z.strictObject({
  ownerType: z.enum([WorkoutOwnerType.COACH, WorkoutOwnerType.SCHOOL]),
  schoolId: id.nullish().transform((value) => value ?? null),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullish().transform((value) => value ?? null),
  sportType: z.string().trim().min(1).max(100),
  status: z.enum([TemplateStatus.DRAFT, TemplateStatus.ACTIVE]).default(TemplateStatus.DRAFT),
}).superRefine((input, ctx) => {
  if (input.ownerType === WorkoutOwnerType.COACH && input.schoolId) {
    ctx.addIssue({ code: "custom", path: ["schoolId"], message: "Personal templates cannot belong to a school" });
  }
  if (input.ownerType === WorkoutOwnerType.SCHOOL && !input.schoolId) {
    ctx.addIssue({ code: "custom", path: ["schoolId"], message: "School templates require a school" });
  }
});

/** Creates a coach-owned library entry or one owned by a school the coach actively serves. */
export class CreateWorkoutTemplate {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = createWorkoutTemplateSchema.parse(raw);

    try {
      return await this.db.$transaction(async (tx) => {
        const coach = await tx.coachProfile.findUnique({
          where: { userId: actor.data }, select: { id: true, status: true },
        });
        if (!coach) throw new SchoolError("COACH_PROFILE_NOT_FOUND", "Perfil de professor não encontrado.", 404);
        if (coach.status !== "ACTIVE") throw new SchoolError("COACH_INACTIVE", "O professor não está ativo.", 409);

        if (input.ownerType === WorkoutOwnerType.SCHOOL) {
          const school = await tx.school.findUnique({
            where: { id: input.schoolId! }, select: { id: true, status: true },
          });
          if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
          if (school.status !== "ACTIVE") throw new SchoolError("SCHOOL_INACTIVE", "A escola não está ativa.", 409);
          const membership = await tx.coachSchoolMembership.findFirst({
            where: { schoolId: school.id, coachId: coach.id, status: "ACTIVE", endedAt: null }, select: { id: true },
          });
          if (!membership) {
            throw new SchoolError("COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE", "O professor não possui vínculo ativo com esta escola.", 403);
          }
        }

        const now = this.clock();
        return new WorkoutTemplateRepository(tx).create(createWorkoutTemplate({
          id: randomUUID(), ownerType: input.ownerType,
          ownerId: input.ownerType === WorkoutOwnerType.COACH ? coach.id : input.schoolId!,
          authorCoachId: coach.id, schoolId: input.schoolId,
          title: input.title, description: input.description, sportType: input.sportType,
          version: 1, status: input.status,
        }, now));
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2003", "P2034"].includes(error.code)) {
        throw new SchoolError("WORKOUT_TEMPLATE_CREATE_CONFLICT", "Não foi possível criar o template. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }
}
