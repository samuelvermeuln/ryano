import { z } from "zod";
import { CoachStatus } from "./enums";

const opaqueId = z.string().min(1).refine((value) => value.trim() === value);
const profileInputSchema = z.strictObject({
  id: opaqueId,
  userId: opaqueId,
  displayName: z.string().trim().min(1),
  bio: z.string().optional(),
});

/** A coach profile belongs to a user independently of school membership. */
export const coachProfileSchema = profileInputSchema.extend({
  bio: z.string().nullable(),
  status: z.enum(CoachStatus),
  createdAt: z.date(),
  updatedAt: z.date(),
}).refine((profile) => profile.updatedAt >= profile.createdAt, {
  path: ["updatedAt"],
  message: "Update cannot precede creation",
});

export type CoachProfile = z.infer<typeof coachProfileSchema>;
export type CreateCoachProfileInput = z.infer<typeof profileInputSchema>;

export function createCoachProfile(raw: CreateCoachProfileInput, now: Date): CoachProfile {
  const input = profileInputSchema.parse(raw);
  z.date().parse(now);
  return {
    ...input,
    bio: input.bio ?? null,
    status: CoachStatus.ACTIVE,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
}
