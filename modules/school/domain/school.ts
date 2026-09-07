import { z } from "zod";
import { CoachSelectionPolicy, SchoolJoinPolicy, SchoolStatus } from "./enums";

const opaqueId = z.string().min(1).refine((value) => value.trim() === value);
const schoolInputSchema = z.strictObject({
  id: opaqueId,
  ownerUserId: opaqueId,
  name: z.string().trim().min(1).max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().max(5000).optional(),
  logoUrl: z.url().optional(),
  joinPolicy: z.enum(SchoolJoinPolicy).optional(),
  coachSelectionPolicy: z.enum(CoachSelectionPolicy).optional(),
});

export interface School {
  id: string;
  slug: string;
  name: string;
  ownerUserId: string;
  description: string | null;
  logoUrl: string | null;
  status: SchoolStatus;
  joinPolicy: SchoolJoinPolicy;
  coachSelectionPolicy: CoachSelectionPolicy;
  createdAt: Date;
  updatedAt: Date;
  deactivatedAt: Date | null;
  archivedAt: Date | null;
}

export interface CreateSchoolInput {
  id: string;
  slug: string;
  name: string;
  ownerUserId: string;
  description?: string;
  logoUrl?: string;
  joinPolicy?: SchoolJoinPolicy;
  coachSelectionPolicy?: CoachSelectionPolicy;
}

export function createSchool(raw: CreateSchoolInput, now: Date): School {
  const input = schoolInputSchema.parse(raw);
  z.date().parse(now);
  return {
    ...input,
    name: input.name.trim(),
    description: input.description ?? null,
    logoUrl: input.logoUrl ?? null,
    status: SchoolStatus.ACTIVE,
    joinPolicy: input.joinPolicy ?? SchoolJoinPolicy.REQUIRE_APPROVAL,
    coachSelectionPolicy: input.coachSelectionPolicy ?? CoachSelectionPolicy.ADMIN_ASSIGNS,
    createdAt: new Date(now),
    updatedAt: new Date(now),
    deactivatedAt: null,
    archivedAt: null,
  };
}
