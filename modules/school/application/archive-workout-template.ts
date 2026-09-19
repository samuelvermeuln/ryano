import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { TemplateStatus } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { workoutTemplateSchema } from "../domain/workout-template";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const archiveWorkoutTemplateSchema = z.strictObject({ templateId: id });

/** Archives a template; idempotent if already archived. Existing workout snapshots are not touched. */
export class ArchiveWorkoutTemplate {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const { templateId } = archiveWorkoutTemplateSchema.parse(raw);

    try {
      return await this.db.$transaction(async (tx) => {
        const coach = await tx.coachProfile.findUnique({
          where: { userId: actor.data }, select: { id: true, status: true },
        });
        if (!coach) throw new SchoolError("COACH_PROFILE_NOT_FOUND", "Perfil de professor não encontrado.", 404);
        if (coach.status !== "ACTIVE") throw new SchoolError("COACH_INACTIVE", "O professor não está ativo.", 409);

        const stored = await tx.workoutTemplate.findUnique({ where: { id: templateId } });
        if (!stored) throw new SchoolError("WORKOUT_TEMPLATE_NOT_FOUND", "Template não encontrado.", 404);
        const template = workoutTemplateSchema.parse(stored);

        if (template.ownerType === "SYSTEM") throw new SchoolError("FORBIDDEN", "Você não pode arquivar este template.", 403);

        if (template.ownerType === "COACH") {
          if (template.authorCoachId !== coach.id) throw new SchoolError("FORBIDDEN", "Você não pode arquivar este template.", 403);
        } else {
          // SCHOOL — active membership required even for archiving
          const school = await tx.school.findUnique({ where: { id: template.schoolId! }, select: { status: true } });
          if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
          if (school.status !== "ACTIVE") throw new SchoolError("SCHOOL_INACTIVE", "A escola não está ativa.", 409);
          const membership = await tx.coachSchoolMembership.findFirst({
            where: { schoolId: template.schoolId!, coachId: coach.id, status: "ACTIVE", endedAt: null }, select: { id: true },
          });
          if (!membership) throw new SchoolError("COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE", "O professor não possui vínculo ativo com esta escola.", 403);
        }

        // Idempotent — already archived is a success
        if (template.status === TemplateStatus.ARCHIVED) return template;

        const now = this.clock();
        return workoutTemplateSchema.parse(
          await tx.workoutTemplate.update({ where: { id: template.id }, data: { status: TemplateStatus.ARCHIVED, updatedAt: now } }),
        );
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2025", "P2034"].includes(error.code)) {
        throw new SchoolError("WORKOUT_TEMPLATE_UPDATE_CONFLICT", "O template foi alterado. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }
}
