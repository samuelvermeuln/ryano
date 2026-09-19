import { z } from "zod";
import { prisma } from "@/server/db";
import { WorkoutRepository } from "@/modules/school/infrastructure/workout-repository";
import { WorkoutOwnerType } from "@/modules/school/domain/enums";
import { createWorkout, parseJsonBody, workoutResponse } from "./_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const repo = new WorkoutRepository(prisma);

const listQuerySchema = z.object({
  ownerType: z.enum(WorkoutOwnerType).optional(),
  ownerId: z.string().min(1).max(256).optional(),
  cursor: z.string().min(1).max(2048).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export function POST(request: Request) {
  return workoutResponse(async (actorId) => createWorkout.execute(actorId, await parseJsonBody(request)), 201);
}

export function GET(request: Request) {
  return workoutResponse(async () => {
    const { searchParams } = new URL(request.url);
    const query = listQuerySchema.parse(Object.fromEntries(searchParams.entries()));
    if (query.ownerType && query.ownerId) {
      if (query.ownerType === WorkoutOwnerType.SCHOOL) {
        return repo.listByOriginSchool(query.ownerId, { cursor: query.cursor, limit: query.limit });
      }
      return repo.listByAuthorCoach(query.ownerId, { cursor: query.cursor, limit: query.limit });
    }
    return { items: [], nextCursor: null };
  });
}
