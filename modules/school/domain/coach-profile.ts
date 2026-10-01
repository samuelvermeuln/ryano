import { z } from "zod";
import { isRyvanoSportType } from "@/modules/shared/activities/sport-types";
import { CoachStatus } from "./enums";

const opaqueId = z.string().min(1).refine((value) => value.trim() === value);

/** SAM-28 — public profile fields. Sports are canonical; credentials are free text (CREF, certifications). */
export const coachSportTypesSchema = z.array(
  z.string().refine((value) => isRyvanoSportType(value) && value !== "default", "Modalidade fora da taxonomia Ryvano"),
).max(20);
export const coachCredentialsSchema = z.array(z.string().trim().min(1).max(120)).max(10);

const profileInputSchema = z.strictObject({
  id: opaqueId,
  userId: opaqueId,
  displayName: z.string().trim().min(1),
  bio: z.string().optional(),
  sportTypes: coachSportTypesSchema.default([]),
  credentials: coachCredentialsSchema.default([]),
  acceptsIndependentAthletes: z.boolean().default(true),
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
/** Input shape: the SAM-28 fields have defaults, so callers may omit them. */
export type CreateCoachProfileInput = z.input<typeof profileInputSchema>;

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
