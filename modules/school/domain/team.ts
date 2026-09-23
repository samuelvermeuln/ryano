import { z } from "zod";

const opaqueId = z.string().min(1).max(256).refine((v) => v.trim() === v);

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

const teamProfileFields = {
  sportType: z.string().trim().min(1).max(100).nullable(),
  level: z.string().trim().min(1).max(100).nullable(),
  capacity: z.number().int().positive().max(10_000).nullable(),
  location: z.string().trim().min(1).max(200).nullable(),
  notes: z.string().trim().min(1).max(1000).nullable(),
};

const teamInputSchema = z.strictObject({
  id: opaqueId,
  schoolId: opaqueId,
  name: z.string().trim().min(1).max(200),
  ...teamProfileFields,
  archivedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const teamSchema = teamInputSchema;

export interface Team {
  id: string;
  schoolId: string;
  name: string;
  sportType: string | null;
  level: string | null;
  capacity: number | null;
  location: string | null;
  notes: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTeamInput {
  id: string;
  schoolId: string;
  name: string;
  sportType?: string | null;
  level?: string | null;
  capacity?: number | null;
  location?: string | null;
  notes?: string | null;
}

export function createTeam(raw: CreateTeamInput, now: Date): Team {
  const input = z
    .strictObject({
      id: opaqueId,
      schoolId: opaqueId,
      name: z.string().trim().min(1).max(200),
      sportType: teamProfileFields.sportType.optional(),
      level: teamProfileFields.level.optional(),
      capacity: teamProfileFields.capacity.optional(),
      location: teamProfileFields.location.optional(),
      notes: teamProfileFields.notes.optional(),
    })
    .parse(raw);
  z.date().parse(now);
  return {
    id: input.id,
    schoolId: input.schoolId,
    name: input.name.trim(),
    // Campo ausente e campo explicitamente nulo significam a mesma coisa aqui:
    // "não declarado". A coluna é nullable, então ambos viram null.
    sportType: input.sportType ?? null,
    level: input.level ?? null,
    capacity: input.capacity ?? null,
    location: input.location ?? null,
    notes: input.notes ?? null,
    archivedAt: null,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
}

// ---------------------------------------------------------------------------
// TeamAthlete
// ---------------------------------------------------------------------------

export const teamAthleteSchema = z.strictObject({
  id: opaqueId,
  teamId: opaqueId,
  athleteId: opaqueId,
  createdAt: z.date(),
});

export interface TeamAthlete {
  id: string;
  teamId: string;
  athleteId: string;
  createdAt: Date;
}

export function createTeamAthlete(raw: Omit<TeamAthlete, "createdAt">, now: Date): TeamAthlete {
  const input = teamAthleteSchema.omit({ createdAt: true }).parse(raw);
  z.date().parse(now);
  return { ...input, createdAt: new Date(now) };
}

// ---------------------------------------------------------------------------
// TeamCoach
// ---------------------------------------------------------------------------

export const teamCoachSchema = z.strictObject({
  id: opaqueId,
  teamId: opaqueId,
  coachId: opaqueId,
  createdAt: z.date(),
});

export interface TeamCoach {
  id: string;
  teamId: string;
  coachId: string;
  createdAt: Date;
}

export function createTeamCoach(raw: Omit<TeamCoach, "createdAt">, now: Date): TeamCoach {
  const input = teamCoachSchema.omit({ createdAt: true }).parse(raw);
  z.date().parse(now);
  return { ...input, createdAt: new Date(now) };
}
