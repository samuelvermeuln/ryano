import { z } from "zod";

const opaqueId = z.string().min(1).max(256).refine((v) => v.trim() === v);

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

const teamInputSchema = z.strictObject({
  id: opaqueId,
  schoolId: opaqueId,
  name: z.string().trim().min(1).max(200),
  archivedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const teamSchema = teamInputSchema;

export interface Team {
  id: string;
  schoolId: string;
  name: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTeamInput {
  id: string;
  schoolId: string;
  name: string;
}

export function createTeam(raw: CreateTeamInput, now: Date): Team {
  const input = z
    .strictObject({ id: opaqueId, schoolId: opaqueId, name: z.string().trim().min(1).max(200) })
    .parse(raw);
  z.date().parse(now);
  return {
    id: input.id,
    schoolId: input.schoolId,
    name: input.name.trim(),
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
