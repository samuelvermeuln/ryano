/**
 * T154/T155/T156 — Team CRUD and membership use cases.
 *
 * CreateTeam    — school owner or admin creates a team.
 * ArchiveTeam   — soft-delete; no data is removed.
 * AddAthleteToTeam — adds an athlete who is an active school member.
 * RemoveAthleteFromTeam — removes an athlete from the team.
 * AddCoachToTeam — assigns a coach (active school member) to a team.
 * RemoveCoachFromTeam — removes a coach from the team.
 */
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { createTeam, createTeamAthlete, createTeamCoach } from "../domain/team";

const id = z.string().min(1).max(256).refine((v) => v.trim() === v);

// ---------------------------------------------------------------------------
// CreateTeam
// ---------------------------------------------------------------------------

const teamProfileSchema = {
  sportType: z.string().trim().min(1).max(100).nullish(),
  level: z.string().trim().min(1).max(100).nullish(),
  // Um limite de 0 tornaria a turma inutilizável; ausência de limite se expressa com null.
  capacity: z.number().int().positive().max(10_000).nullish(),
  location: z.string().trim().min(1).max(200).nullish(),
  notes: z.string().trim().min(1).max(1000).nullish(),
};

export const createTeamSchema = z.strictObject({
  schoolId: id,
  name: z.string().trim().min(1).max(200),
  ...teamProfileSchema,
});

export class CreateTeam {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = createTeamSchema.parse(raw);

    return this.db.$transaction(async (tx) => {
      const school = await tx.school.findUnique({ where: { id: input.schoolId }, select: { id: true, ownerUserId: true, status: true } });
      if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
      if (school.ownerUserId !== actor.data) {
        const member = await tx.coachSchoolMembership.findFirst({
          where: { schoolId: input.schoolId, status: "ACTIVE", endedAt: null, coach: { userId: actor.data } }, select: { id: true },
        });
        if (!member) throw new SchoolError("FORBIDDEN", "Apenas membros ativos da escola podem criar turmas.", 403);
      }

      const team = createTeam({
        id: randomUUID(),
        schoolId: input.schoolId,
        name: input.name,
        sportType: input.sportType,
        level: input.level,
        capacity: input.capacity,
        location: input.location,
        notes: input.notes,
      }, this.clock());
      return tx.team.create({ data: team });
    });
  }
}

// ---------------------------------------------------------------------------
// ArchiveTeam
// ---------------------------------------------------------------------------

export const archiveTeamSchema = z.strictObject({ teamId: id });

export class ArchiveTeam {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = archiveTeamSchema.parse(raw);

    return this.db.$transaction(async (tx) => {
      const team = await tx.team.findUnique({ where: { id: input.teamId }, select: { id: true, schoolId: true, archivedAt: true } });
      if (!team) throw new SchoolError("TEAM_NOT_FOUND", "Turma não encontrada.", 404);
      if (team.archivedAt) throw new SchoolError("TEAM_ALREADY_ARCHIVED", "A turma já está arquivada.", 409);

      await assertSchoolMembership(tx, actor.data, team.schoolId);
      const now = this.clock();
      return tx.team.update({ where: { id: input.teamId }, data: { archivedAt: now, updatedAt: now } });
    });
  }
}

// ---------------------------------------------------------------------------
// AddAthleteToTeam
// ---------------------------------------------------------------------------

export const addAthleteToTeamSchema = z.strictObject({ teamId: id, athleteId: id });

export class AddAthleteToTeam {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = addAthleteToTeamSchema.parse(raw);

    try {
      return await this.db.$transaction(async (tx) => {
        const team = await tx.team.findUnique({ where: { id: input.teamId }, select: { id: true, schoolId: true, archivedAt: true, capacity: true } });
        if (!team) throw new SchoolError("TEAM_NOT_FOUND", "Turma não encontrada.", 404);
        if (team.archivedAt) throw new SchoolError("TEAM_ARCHIVED", "Não é possível adicionar atletas a uma turma arquivada.", 409);

        await assertSchoolMembership(tx, actor.data, team.schoolId);

        const athleteMembership = await tx.schoolAthleteMembership.findFirst({
          where: { schoolId: team.schoolId, athleteId: input.athleteId, status: "ACTIVE" }, select: { id: true },
        });
        if (!athleteMembership) throw new SchoolError("ATHLETE_NOT_MEMBER", "O atleta não é membro ativo desta escola.", 403);

        // capacity nulo = sem limite declarado. A contagem fica dentro da
        // transação para que duas inclusões simultâneas não ultrapassem o
        // limite cada uma lendo a ocupação anterior à outra.
        if (team.capacity != null) {
          const occupancy = await tx.teamAthlete.count({ where: { teamId: input.teamId } });
          if (occupancy >= team.capacity) {
            throw new SchoolError("TEAM_CAPACITY_EXCEEDED", `A turma atingiu a capacidade de ${team.capacity} atletas.`, 409);
          }
        }

        const member = createTeamAthlete({ id: randomUUID(), teamId: input.teamId, athleteId: input.athleteId }, this.clock());
        return tx.teamAthlete.create({ data: member });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new SchoolError("ATHLETE_ALREADY_IN_TEAM", "O atleta já é membro desta turma.", 409);
      }
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// RemoveAthleteFromTeam
// ---------------------------------------------------------------------------

export const removeAthleteFromTeamSchema = z.strictObject({ teamId: id, athleteId: id });

export class RemoveAthleteFromTeam {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = removeAthleteFromTeamSchema.parse(raw);

    return this.db.$transaction(async (tx) => {
      const team = await tx.team.findUnique({ where: { id: input.teamId }, select: { id: true, schoolId: true } });
      if (!team) throw new SchoolError("TEAM_NOT_FOUND", "Turma não encontrada.", 404);
      await assertSchoolMembership(tx, actor.data, team.schoolId);

      const member = await tx.teamAthlete.findFirst({ where: { teamId: input.teamId, athleteId: input.athleteId }, select: { id: true } });
      if (!member) throw new SchoolError("ATHLETE_NOT_IN_TEAM", "O atleta não é membro desta turma.", 404);
      return tx.teamAthlete.delete({ where: { id: member.id } });
    });
  }
}

// ---------------------------------------------------------------------------
// AddCoachToTeam
// ---------------------------------------------------------------------------

export const addCoachToTeamSchema = z.strictObject({ teamId: id, coachId: id });

export class AddCoachToTeam {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = addCoachToTeamSchema.parse(raw);

    try {
      return await this.db.$transaction(async (tx) => {
        const team = await tx.team.findUnique({ where: { id: input.teamId }, select: { id: true, schoolId: true, archivedAt: true } });
        if (!team) throw new SchoolError("TEAM_NOT_FOUND", "Turma não encontrada.", 404);
        if (team.archivedAt) throw new SchoolError("TEAM_ARCHIVED", "Não é possível adicionar coaches a uma turma arquivada.", 409);

        await assertSchoolMembership(tx, actor.data, team.schoolId);

        const coachMembership = await tx.coachSchoolMembership.findFirst({
          where: { schoolId: team.schoolId, coachId: input.coachId, status: "ACTIVE", endedAt: null }, select: { id: true },
        });
        if (!coachMembership) throw new SchoolError("COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE", "O coach não possui vínculo ativo com esta escola.", 403);

        const tc = createTeamCoach({ id: randomUUID(), teamId: input.teamId, coachId: input.coachId }, this.clock());
        return tx.teamCoach.create({ data: tc });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new SchoolError("COACH_ALREADY_IN_TEAM", "O coach já é membro desta turma.", 409);
      }
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// RemoveCoachFromTeam
// ---------------------------------------------------------------------------

export const removeCoachFromTeamSchema = z.strictObject({ teamId: id, coachId: id });

export class RemoveCoachFromTeam {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = removeCoachFromTeamSchema.parse(raw);

    return this.db.$transaction(async (tx) => {
      const team = await tx.team.findUnique({ where: { id: input.teamId }, select: { id: true, schoolId: true } });
      if (!team) throw new SchoolError("TEAM_NOT_FOUND", "Turma não encontrada.", 404);
      await assertSchoolMembership(tx, actor.data, team.schoolId);

      const tc = await tx.teamCoach.findFirst({ where: { teamId: input.teamId, coachId: input.coachId }, select: { id: true } });
      if (!tc) throw new SchoolError("COACH_NOT_IN_TEAM", "O coach não é membro desta turma.", 404);
      return tx.teamCoach.delete({ where: { id: tc.id } });
    });
  }
}

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/** Throws FORBIDDEN unless the actor is the school owner or an active coach member. */
async function assertSchoolMembership(tx: Tx, actorUserId: string, schoolId: string): Promise<void> {
  const school = await tx.school.findUnique({ where: { id: schoolId }, select: { ownerUserId: true } });
  if (school?.ownerUserId === actorUserId) return;
  const member = await tx.coachSchoolMembership.findFirst({
    where: { schoolId, status: "ACTIVE", endedAt: null, coach: { userId: actorUserId } }, select: { id: true },
  });
  if (!member) throw new SchoolError("FORBIDDEN", "Você não tem permissão para gerenciar esta turma.", 403);
}
