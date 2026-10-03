import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { OpenWaterSession } from "../domain/open-water-session";
import { z } from "zod";
import { TemplateStatus, WorkoutOwnerType, WorkoutStatus } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { createWorkout, createWorkoutSnapshot, type WorkoutSnapshot } from "../domain/workout";
import { createWorkoutBlock } from "../domain/workout-block";
import { WorkoutRepository } from "../infrastructure/workout-repository";
import { rowsOfContentBlocks, templateContentSchema } from "../domain/workout-template-content";

type JsonPayload = Prisma.InputJsonValue;

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

const blockInputSchema = z.strictObject({
  blockType: z.string().trim().min(1).max(50),
  title: z.string().trim().min(1).max(200).nullish().transform((v) => v ?? null),
  distanceM: z.number().finite().min(0).nullish().transform((v) => v ?? null),
  durationS: z.number().int().min(0).nullish().transform((v) => v ?? null),
  repetitions: z.number().int().min(0).nullish().transform((v) => v ?? null),
  targetPayload: z.json().nullish().transform((v) => v ?? null),
  restPayload: z.json().nullish().transform((v) => v ?? null),
});

export const createWorkoutSchema = z.strictObject({
  ownerType: z.enum([WorkoutOwnerType.COACH, WorkoutOwnerType.SCHOOL]),
  schoolId: id.nullish().transform((v) => v ?? null),
  templateId: id.nullish().transform((v) => v ?? null),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullish().transform((v) => v ?? null),
  sportType: z.string().trim().min(1).max(100),
  scheduledDate: z.union([z.iso.datetime(), z.date()]).nullish().transform((v) => (v ? new Date(v) : null)),
  scheduledStartAt: z.union([z.iso.datetime(), z.date()]).nullish().transform((v) => (v ? new Date(v) : null)),
  blocks: z.array(blockInputSchema).default([]),
}).superRefine((input, ctx) => {
  if (input.ownerType === WorkoutOwnerType.SCHOOL && !input.schoolId) {
    ctx.addIssue({ code: "custom", path: ["schoolId"], message: "School workouts require a schoolId" });
  }
  if (input.ownerType === WorkoutOwnerType.COACH && input.schoolId) {
    ctx.addIssue({ code: "custom", path: ["schoolId"], message: "Personal workouts cannot belong to a school" });
  }
});

/** Creates a concrete workout prescription, optionally derived from an active template snapshot. */
export class CreateWorkout {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = createWorkoutSchema.parse(raw);

    try {
      return await this.db.$transaction(async (tx) => {
        const coach = await tx.coachProfile.findUnique({
          where: { userId: actor.data }, select: { id: true, status: true },
        });
        if (!coach) throw new SchoolError("COACH_PROFILE_NOT_FOUND", "Perfil de professor não encontrado.", 404);
        if (coach.status !== "ACTIVE") throw new SchoolError("COACH_INACTIVE", "O professor não está ativo.", 409);

        if (input.ownerType === WorkoutOwnerType.SCHOOL) {
          const school = await tx.school.findUnique({ where: { id: input.schoolId! }, select: { id: true, status: true } });
          if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
          if (school.status !== "ACTIVE") throw new SchoolError("SCHOOL_INACTIVE", "A escola não está ativa.", 409);
          const membership = await tx.coachSchoolMembership.findFirst({
            where: { schoolId: school.id, coachId: coach.id, status: "ACTIVE", endedAt: null }, select: { id: true },
          });
          if (!membership) {
            throw new SchoolError("COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE", "O professor não possui vínculo ativo com esta escola.", 403);
          }
        }

        let templateId: string | null = null;
        let templateVersion: number | null = null;
        let snapshotContent: JsonPayload = { blocks: input.blocks };
        let blockRows = input.blocks;
        let sessionContext: OpenWaterSession | null = null;

        if (input.templateId) {
          const template = await tx.workoutTemplate.findUnique({ where: { id: input.templateId } });
          if (!template) throw new SchoolError("WORKOUT_TEMPLATE_NOT_FOUND", "Template de treino não encontrado.", 404);
          if (template.status !== TemplateStatus.ACTIVE) {
            throw new SchoolError("WORKOUT_TEMPLATE_NOT_ACTIVE", "O template de treino não está ativo.", 409);
          }
          if (input.ownerType === WorkoutOwnerType.COACH && template.authorCoachId !== coach.id) {
            throw new SchoolError("FORBIDDEN", "Este template não pertence ao professor.", 403);
          }
          if (input.ownerType === WorkoutOwnerType.SCHOOL && template.schoolId !== input.schoolId) {
            throw new SchoolError("FORBIDDEN", "Este template não pertence à escola.", 403);
          }
          templateId = template.id;
          templateVersion = template.version;
          // SAM-58 — the content is the template's CURRENT immutable version (it used to look up
          // blocks with `workoutId: template.id`, which is never a workout, so it was always empty).
          const version = await tx.workoutTemplateVersion.findUnique({ where: { templateId_number: { templateId: template.id, number: template.version } } });
          const content = templateContentSchema.parse(version?.content ?? {});
          blockRows = rowsOfContentBlocks(content.blocks).map((row, index) => ({
            ...row, title: content.blocks[index]!.title,
          }));
          snapshotContent = { blocks: JSON.parse(JSON.stringify(blockRows)) } as JsonPayload;
          // SAM-65 — the open-water context of the template travels with the version used.
          sessionContext = content.openWater;
        }

        const now = this.clock();
        const workoutId = randomUUID();
        const snapshot = createWorkoutSnapshot({
          templateId,
          templateVersion,
          title: input.title,
          description: input.description,
          sportType: input.sportType,
          content: snapshotContent,
        } as WorkoutSnapshot);

        const workout = createWorkout({
          id: workoutId,
          templateId,
          templateVersion,
          authorCoachId: coach.id,
          originSchoolId: input.ownerType === WorkoutOwnerType.SCHOOL ? input.schoolId : null,
          title: input.title,
          description: input.description,
          sportType: input.sportType,
          scheduledDate: input.scheduledDate,
          scheduledStartAt: input.scheduledStartAt,
          status: input.scheduledDate ? WorkoutStatus.SCHEDULED : WorkoutStatus.DRAFT,
          snapshotPayload: snapshot,
        }, now);

        const repo = new WorkoutRepository(tx);
        const saved = await repo.create(workout);
        if (sessionContext) {
          await tx.workout.update({ where: { id: saved.id }, data: { sessionContext: sessionContext as unknown as Prisma.InputJsonValue } });
        }

        {
          await Promise.all(
            blockRows.map((block, index) =>
              repo.createBlock(
                createWorkoutBlock({
                  id: randomUUID(),
                  workoutId: saved.id,
                  position: index,
                  blockType: block.blockType as never,
                  title: block.title,
                  distanceM: block.distanceM,
                  durationS: block.durationS,
                  repetitions: block.repetitions,
                  targetPayload: block.targetPayload,
                  restPayload: block.restPayload,
                }, now),
              ),
            ),
          );
        }

        return saved;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2003", "P2034"].includes(error.code)) {
        throw new SchoolError("WORKOUT_CREATE_CONFLICT", "Não foi possível criar o treino. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }
}
