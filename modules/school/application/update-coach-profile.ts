import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { coachCredentialsSchema, coachProfileSchema, coachSportTypesSchema, type CoachProfile } from "../domain/coach-profile";
import { SchoolError } from "../domain/errors";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

/** SAM-28 — what the coach edits on their own public profile. */
export const updateCoachProfileSchema = z.strictObject({
  displayName: z.string().trim().min(2).max(200).optional(),
  bio: z.string().trim().max(2000).nullable().optional(),
  sportTypes: coachSportTypesSchema.optional(),
  credentials: coachCredentialsSchema.optional(),
  acceptsIndependentAthletes: z.boolean().optional(),
}).refine((value) => Object.values(value).some((field) => field !== undefined), "Informe ao menos um campo para atualizar.");
export type UpdateCoachProfileInput = z.input<typeof updateCoachProfileSchema>;

/**
 * The coach edits their own profile — the one athletes read in /app/professor.
 * There is no school or admin path on purpose: the profile belongs to the
 * person, independently of any school (T041).
 */
export class UpdateCoachProfile {
  constructor(private readonly db: Pick<PrismaClient, "coachProfile">, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown): Promise<CoachProfile> {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = updateCoachProfileSchema.parse(raw);

    const existing = await this.db.coachProfile.findUnique({ where: { userId: actor.data }, select: { id: true } });
    if (!existing) throw new SchoolError("COACH_PROFILE_NOT_FOUND", "Perfil de professor não encontrado.", 404);

    const data: Record<string, unknown> = { updatedAt: this.clock() };
    if (input.displayName !== undefined) data.displayName = input.displayName;
    if (input.bio !== undefined) data.bio = input.bio === "" ? null : input.bio;
    if (input.sportTypes !== undefined) data.sportTypes = input.sportTypes;
    if (input.credentials !== undefined) data.credentials = input.credentials;
    if (input.acceptsIndependentAthletes !== undefined) data.acceptsIndependentAthletes = input.acceptsIndependentAthletes;
    const row = await this.db.coachProfile.update({ where: { id: existing.id }, data });
    return coachProfileSchema.parse(row);
  }
}
