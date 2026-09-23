/**
 * T503 — Leitura e edição de turmas.
 *
 * ListTeams     — turmas da escola com ocupação, paginadas por cursor.
 * GetTeamDetail — turma com atletas e professores vinculados.
 * UpdateTeam    — edita nome e campos operacionais.
 *
 * As três operações exigem vínculo ativo com a escola: turma é dado
 * administrativo e não deve vazar para quem não pertence à escola.
 */
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";

const id = z.string().min(1).max(256).refine((v) => v.trim() === v);

/**
 * Dono da escola ou membro ativo. Espelha a checagem usada em manage-team.ts;
 * a duplicação é deliberada enquanto não há um helper compartilhado exportado.
 */
async function assertSchoolAccess(
  db: Pick<PrismaClient, "school" | "coachSchoolMembership">,
  actorUserId: string,
  schoolId: string,
) {
  const school = await db.school.findUnique({ where: { id: schoolId }, select: { id: true, ownerUserId: true } });
  if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
  if (school.ownerUserId === actorUserId) return;

  const member = await db.coachSchoolMembership.findFirst({
    where: { schoolId, status: "ACTIVE", endedAt: null, coach: { userId: actorUserId } },
    select: { id: true },
  });
  if (!member) throw new SchoolError("FORBIDDEN", "Apenas membros ativos da escola podem ver turmas.", 403);
}

// ---------------------------------------------------------------------------
// ListTeams
// ---------------------------------------------------------------------------

export const listTeamsSchema = z.strictObject({
  schoolId: id,
  // Arquivadas ficam fora por padrão: a tela administrativa trata do que está
  // em operação hoje.
  includeArchived: z.coerce.boolean().default(false),
  sportType: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: id.optional(),
});

export type TeamSummary = {
  id: string;
  name: string;
  sportType: string | null;
  level: string | null;
  capacity: number | null;
  location: string | null;
  occupancy: number;
  coachCount: number;
  archivedAt: Date | null;
};

export class ListTeams {
  constructor(private readonly db: Pick<PrismaClient, "team" | "school" | "coachSchoolMembership">) {}

  async execute(actorUserId: string | null, raw: unknown): Promise<{ items: TeamSummary[]; nextCursor: string | null }> {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = listTeamsSchema.parse(raw);
    await assertSchoolAccess(this.db, actor.data, input.schoolId);

    const rows = await this.db.team.findMany({
      where: {
        schoolId: input.schoolId,
        ...(input.includeArchived ? {} : { archivedAt: null }),
        ...(input.sportType === undefined ? {} : { sportType: input.sportType }),
        ...(input.cursor === undefined ? {} : { id: { gt: input.cursor } }),
      },
      orderBy: { id: "asc" },
      take: input.limit + 1,
      select: {
        id: true, name: true, sportType: true, level: true, capacity: true,
        location: true, archivedAt: true,
        // Ocupação vem do banco: contar em memória exigiria carregar os
        // vínculos de todas as turmas da página.
        _count: { select: { members: true, coaches: true } },
      },
    });

    const items = rows.slice(0, input.limit).map((row) => ({
      id: row.id,
      name: row.name,
      sportType: row.sportType,
      level: row.level,
      capacity: row.capacity,
      location: row.location,
      occupancy: row._count.members,
      coachCount: row._count.coaches,
      archivedAt: row.archivedAt,
    }));

    return { items, nextCursor: rows.length > input.limit ? items[items.length - 1].id : null };
  }
}

// ---------------------------------------------------------------------------
// GetTeamDetail
// ---------------------------------------------------------------------------

export const getTeamDetailSchema = z.strictObject({ teamId: id });

export class GetTeamDetail {
  constructor(private readonly db: Pick<PrismaClient, "team" | "school" | "coachSchoolMembership">) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = getTeamDetailSchema.parse(raw);

    const team = await this.db.team.findUnique({
      where: { id: input.teamId },
      select: {
        id: true, schoolId: true, name: true, sportType: true, level: true,
        capacity: true, location: true, notes: true, archivedAt: true,
        createdAt: true, updatedAt: true,
        members: {
          select: { athleteId: true, createdAt: true, athlete: { select: { name: true, email: true } } },
          orderBy: { createdAt: "asc" },
        },
        coaches: {
          select: { coachId: true, createdAt: true, coach: { select: { user: { select: { name: true, email: true } } } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!team) throw new SchoolError("TEAM_NOT_FOUND", "Turma não encontrada.", 404);

    // A autorização acontece depois de achar a turma porque depende do schoolId
    // dela. Ambos os caminhos de recusa (404 e 403) já são respostas de erro,
    // então isso não revela existência a quem não deveria agir sobre a turma.
    await assertSchoolAccess(this.db, actor.data, team.schoolId);

    const { members, coaches, ...rest } = team;
    return {
      ...rest,
      occupancy: members.length,
      athletes: members.map((m) => ({
        athleteId: m.athleteId, name: m.athlete?.name ?? null, email: m.athlete?.email ?? null, since: m.createdAt,
      })),
      coaches: coaches.map((c) => ({
        coachId: c.coachId, name: c.coach?.user?.name ?? null, email: c.coach?.user?.email ?? null, since: c.createdAt,
      })),
    };
  }
}

// ---------------------------------------------------------------------------
// UpdateTeam
// ---------------------------------------------------------------------------

export const updateTeamSchema = z.strictObject({
  teamId: id,
  name: z.string().trim().min(1).max(200).optional(),
  sportType: z.string().trim().min(1).max(100).nullish(),
  level: z.string().trim().min(1).max(100).nullish(),
  capacity: z.number().int().positive().max(10_000).nullish(),
  location: z.string().trim().min(1).max(200).nullish(),
  notes: z.string().trim().min(1).max(1000).nullish(),
});

export class UpdateTeam {
  constructor(
    private readonly db: Pick<PrismaClient, "team" | "school" | "coachSchoolMembership" | "$transaction">,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const { teamId, ...fields } = updateTeamSchema.parse(raw);

    const team = await this.db.team.findUnique({ where: { id: teamId }, select: { id: true, schoolId: true, archivedAt: true } });
    if (!team) throw new SchoolError("TEAM_NOT_FOUND", "Turma não encontrada.", 404);
    if (team.archivedAt) throw new SchoolError("TEAM_ARCHIVED", "Não é possível editar uma turma arquivada.", 409);
    await assertSchoolAccess(this.db, actor.data, team.schoolId);

    // Só os campos presentes são escritos: `undefined` é "não mexer" e `null` é
    // "limpar". Distinguir os dois evita que um PATCH parcial apague dados.
    const data = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    if (Object.keys(data).length === 0) {
      throw new SchoolError("VALIDATION_ERROR", "Informe ao menos um campo para atualizar.", 400);
    }

    return this.db.team.update({ where: { id: teamId }, data: { ...data, updatedAt: this.clock() } });
  }
}
