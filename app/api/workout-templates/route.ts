import { z } from "zod";
import { prisma } from "@/server/db";
import { WorkoutTemplateRepository } from "@/modules/school/infrastructure/workout-template-repository";
import { WorkoutOwnerType } from "@/modules/school/domain/enums";
import { createTemplate, templateBody, templateResponse } from "./_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const repo = new WorkoutTemplateRepository(prisma);

const listQuerySchema = z.object({
  ownerType: z.enum(WorkoutOwnerType),
  ownerId: z.string().min(1).max(256),
  cursor: z.string().min(1).max(2048).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export function POST(request: Request) {
  return templateResponse(async (actorId) => createTemplate.execute(actorId, await templateBody(request)), 201);
}

export function GET(request: Request) {
  return templateResponse(async () => {
    const { searchParams } = new URL(request.url);
    const query = listQuerySchema.parse(Object.fromEntries(searchParams.entries()));
    return repo.listByOwner(query.ownerType, query.ownerId, { cursor: query.cursor, limit: query.limit });
  });
}
