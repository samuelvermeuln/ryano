import { z } from "zod";
import { prisma } from "@/server/db";
import { WorkoutRepository } from "@/modules/school/infrastructure/workout-repository";
import { SchoolError } from "@/modules/school/domain/errors";
import { parseJsonBody, workoutResponse, type WorkoutRouteContext } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const repo = new WorkoutRepository(prisma);

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  scheduledDate: z.union([z.iso.datetime(), z.date()]).nullable().optional()
    .transform((v) => (v === undefined ? undefined : v === null ? null : new Date(v))),
  scheduledStartAt: z.union([z.iso.datetime(), z.date()]).nullable().optional()
    .transform((v) => (v === undefined ? undefined : v === null ? null : new Date(v))),
});

export function GET(_request: Request, context: WorkoutRouteContext) {
  return workoutResponse(async () => {
    const { id } = await context.params;
    const workout = await repo.findById(id);
    if (!workout) throw new SchoolError("WORKOUT_NOT_FOUND", "Treino não encontrado.", 404);
    return workout;
  });
}

export function PATCH(request: Request, context: WorkoutRouteContext) {
  return workoutResponse(async (actorId) => {
    const { id } = await context.params;
    const body = patchSchema.parse(await parseJsonBody(request));
    // Authorization: only the authoring coach may update the workout.
    const existing = await repo.findById(id);
    if (!existing) throw new SchoolError("WORKOUT_NOT_FOUND", "Treino não encontrado.", 404);
    const coach = await prisma.coachProfile.findUnique({ where: { userId: actorId }, select: { id: true } });
    if (!coach || existing.authorCoachId !== coach.id) {
      throw new SchoolError("FORBIDDEN", "Apenas o professor responsável pode alterar este treino.", 403);
    }
    const updated = await repo.update(id, body);
    if (!updated) throw new SchoolError("WORKOUT_NOT_FOUND", "Treino não encontrado.", 404);
    return updated;
  });
}
