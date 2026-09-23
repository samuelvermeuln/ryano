/**
 * T503 — ListTeams, GetTeamDetail e UpdateTeam.
 *
 * Foco: escopo por escola (turma de outra escola não vaza), paginação por
 * cursor e semântica de PATCH parcial (undefined ≠ null).
 */
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ListTeams, GetTeamDetail, UpdateTeam } from "@/modules/school/application/list-teams";

const now = new Date("2026-10-01T10:00:00Z");
const OWNER = "user-owner";

function teamRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "team-1", name: "Turma A", sportType: "running", level: "Iniciante",
    capacity: 20, location: "Quadra 1", archivedAt: null,
    _count: { members: 8, coaches: 2 },
    ...over,
  };
}

function makeDb(over: Record<string, unknown> = {}) {
  return {
    school: { findUnique: vi.fn().mockResolvedValue({ id: "school-1", ownerUserId: OWNER }) },
    coachSchoolMembership: { findFirst: vi.fn().mockResolvedValue(null) },
    team: { findMany: vi.fn().mockResolvedValue([teamRow()]), findUnique: vi.fn(), update: vi.fn() },
    ...over,
  } as unknown as PrismaClient;
}

describe("ListTeams [T503]", () => {
  it("recusa chamador não autenticado", async () => {
    await expect(new ListTeams(makeDb()).execute(null, { schoolId: "school-1" }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("recusa quem não é dono nem membro ativo", async () => {
    const db = makeDb({
      school: { findUnique: vi.fn().mockResolvedValue({ id: "school-1", ownerUserId: "outro" }) },
      coachSchoolMembership: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    await expect(new ListTeams(db).execute("intruso", { schoolId: "school-1" }))
      .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("permite membro ativo que não é dono", async () => {
    const db = makeDb({
      school: { findUnique: vi.fn().mockResolvedValue({ id: "school-1", ownerUserId: "outro" }) },
      coachSchoolMembership: { findFirst: vi.fn().mockResolvedValue({ id: "csm-1" }) },
      team: { findMany: vi.fn().mockResolvedValue([teamRow()]), findUnique: vi.fn(), update: vi.fn() },
    });
    const out = await new ListTeams(db).execute("prof", { schoolId: "school-1" });
    expect(out.items).toHaveLength(1);
  });

  it("expõe ocupação e contagem de professores", async () => {
    const out = await new ListTeams(makeDb()).execute(OWNER, { schoolId: "school-1" });
    expect(out.items[0]).toMatchObject({ occupancy: 8, coachCount: 2, capacity: 20 });
    // `_count` é detalhe do Prisma e não deve vazar para a camada de cima.
    expect(out.items[0]).not.toHaveProperty("_count");
  });

  it("esconde arquivadas por padrão e as inclui sob demanda", async () => {
    const db = makeDb();
    await new ListTeams(db).execute(OWNER, { schoolId: "school-1" });
    expect(db.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ archivedAt: null }) }));

    const db2 = makeDb();
    await new ListTeams(db2).execute(OWNER, { schoolId: "school-1", includeArchived: true });
    expect((db2.team.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where)
      .not.toHaveProperty("archivedAt");
  });

  it("sempre filtra pela escola pedida", async () => {
    const db = makeDb();
    await new ListTeams(db).execute(OWNER, { schoolId: "school-1" });
    expect(db.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ schoolId: "school-1" }) }));
  });

  it("devolve nextCursor quando há mais de uma página", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => teamRow({ id: `team-${i + 1}` }));
    const db = makeDb({ team: { findMany: vi.fn().mockResolvedValue(rows), findUnique: vi.fn(), update: vi.fn() } });
    const out = await new ListTeams(db).execute(OWNER, { schoolId: "school-1", limit: 2 });
    // Busca limit+1 para saber se há próxima página sem um count extra.
    expect(db.team.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3 }));
    expect(out.items).toHaveLength(2);
    expect(out.nextCursor).toBe("team-2");
  });

  it("devolve nextCursor nulo na última página", async () => {
    const out = await new ListTeams(makeDb()).execute(OWNER, { schoolId: "school-1", limit: 20 });
    expect(out.nextCursor).toBeNull();
  });
});

describe("GetTeamDetail [T503]", () => {
  const detail = {
    id: "team-1", schoolId: "school-1", name: "Turma A", sportType: "running",
    level: null, capacity: 10, location: null, notes: null, archivedAt: null,
    createdAt: now, updatedAt: now,
    members: [{ athleteId: "a-1", createdAt: now, athlete: { name: "Ana", email: "ana@x.com" } }],
    coaches: [{ coachId: "c-1", createdAt: now, coach: { user: { name: "Bru", email: "bru@x.com" } } }],
  };

  it("recusa turma inexistente", async () => {
    const db = makeDb({ team: { findUnique: vi.fn().mockResolvedValue(null), findMany: vi.fn(), update: vi.fn() } });
    await expect(new GetTeamDetail(db).execute(OWNER, { teamId: "nope" }))
      .rejects.toMatchObject({ code: "TEAM_NOT_FOUND", status: 404 });
  });

  it("recusa turma de escola da qual o ator não participa", async () => {
    const db = makeDb({
      team: { findUnique: vi.fn().mockResolvedValue({ ...detail, schoolId: "school-alheia" }), findMany: vi.fn(), update: vi.fn() },
      school: { findUnique: vi.fn().mockResolvedValue({ id: "school-alheia", ownerUserId: "outro" }) },
      coachSchoolMembership: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    await expect(new GetTeamDetail(db).execute("intruso", { teamId: "team-1" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("achata atletas e professores com ocupação", async () => {
    const db = makeDb({ team: { findUnique: vi.fn().mockResolvedValue(detail), findMany: vi.fn(), update: vi.fn() } });
    const out = await new GetTeamDetail(db).execute(OWNER, { teamId: "team-1" });
    expect(out.occupancy).toBe(1);
    expect(out.athletes[0]).toMatchObject({ athleteId: "a-1", name: "Ana" });
    expect(out.coaches[0]).toMatchObject({ coachId: "c-1", name: "Bru" });
    expect(out).not.toHaveProperty("members");
  });
});

describe("UpdateTeam [T503]", () => {
  function updateDb(team: object | null = { id: "team-1", schoolId: "school-1", archivedAt: null }) {
    return makeDb({
      team: {
        findUnique: vi.fn().mockResolvedValue(team),
        update: vi.fn().mockResolvedValue({ id: "team-1" }),
        findMany: vi.fn(),
      },
    });
  }

  it("recusa edição de turma arquivada", async () => {
    const db = updateDb({ id: "team-1", schoolId: "school-1", archivedAt: now });
    await expect(new UpdateTeam(db, () => now).execute(OWNER, { teamId: "team-1", name: "Novo" }))
      .rejects.toMatchObject({ code: "TEAM_ARCHIVED", status: 409 });
  });

  it("recusa PATCH sem nenhum campo", async () => {
    const db = updateDb();
    await expect(new UpdateTeam(db, () => now).execute(OWNER, { teamId: "team-1" }))
      .rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    expect(db.team.update).not.toHaveBeenCalled();
  });

  it("não toca em campos ausentes", async () => {
    const db = updateDb();
    await new UpdateTeam(db, () => now).execute(OWNER, { teamId: "team-1", name: "Turma B" });
    const data = (db.team.update as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(data).toHaveProperty("name", "Turma B");
    // Um PATCH de nome não pode apagar a capacidade declarada.
    expect(data).not.toHaveProperty("capacity");
    expect(data).not.toHaveProperty("location");
  });

  it("distingue null (limpar) de ausente (não mexer)", async () => {
    const db = updateDb();
    await new UpdateTeam(db, () => now).execute(OWNER, { teamId: "team-1", capacity: null });
    const data = (db.team.update as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(data).toHaveProperty("capacity", null);
    expect(data).not.toHaveProperty("name");
  });
});
