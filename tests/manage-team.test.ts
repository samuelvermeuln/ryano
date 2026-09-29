/**
 * T154/T155/T156 — Tests for team management use cases:
 * CreateTeam, ArchiveTeam, AddAthleteToTeam, RemoveAthleteFromTeam,
 * AddCoachToTeam, RemoveCoachFromTeam
 */
import { describe, expect, it, vi } from "vitest";
import { CreateTeam, ArchiveTeam, AddAthleteToTeam, RemoveAthleteFromTeam, AddCoachToTeam, RemoveCoachFromTeam } from "@/modules/school/application/manage-team";
import type { PrismaClient } from "@prisma/client";

const now = new Date("2026-10-01T10:00:00Z");

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makePrisma(tx: object): PrismaClient {
  return { $transaction: vi.fn((fn: (t: unknown) => unknown) => fn(tx)) } as unknown as PrismaClient;
}

const activeSchool = { id: "school-1", ownerUserId: "user-owner", status: "ACTIVE" };
const savedTeam = {
  id: "team-1", schoolId: "school-1", name: "Turma A",
  sportType: null, level: null, capacity: null, location: null, notes: null,
  archivedAt: null, createdAt: now, updatedAt: now,
};

/**
 * `eligibleAthleteIds`/`eligibleCoachIds` are the ids the school would return
 * as active members; anything the use case asks for outside them stands for a
 * person from another school (SAM-8).
 */
function makeCreateTeamTx(
  opts: {
    school?: object | null;
    coachMembership?: object | null;
    eligibleAthleteIds?: string[];
    eligibleCoachIds?: string[];
  } = {},
) {
  const eligibleAthletes = opts.eligibleAthleteIds ?? [];
  const eligibleCoaches = opts.eligibleCoachIds ?? [];
  const requested = (where: { in?: string[] } | string | undefined): string[] =>
    typeof where === "object" && where !== null && Array.isArray(where.in) ? where.in : [];

  return {
    school: { findUnique: vi.fn().mockResolvedValue(opts.school !== undefined ? opts.school : activeSchool) },
    coachSchoolMembership: {
      findFirst: vi.fn().mockResolvedValue(opts.coachMembership !== undefined ? opts.coachMembership : { id: "csm-1" }),
      findMany: vi.fn(async ({ where }: { where: { coachId?: { in?: string[] } } }) =>
        requested(where.coachId)
          .filter((coachId) => eligibleCoaches.includes(coachId))
          .map((coachId) => ({ coachId })),
      ),
    },
    schoolAthleteMembership: {
      findMany: vi.fn(async ({ where }: { where: { athleteId?: { in?: string[] } } }) =>
        requested(where.athleteId)
          .filter((athleteId) => eligibleAthletes.includes(athleteId))
          .map((athleteId) => ({ athleteId })),
      ),
    },
    team: { create: vi.fn().mockResolvedValue(savedTeam) },
    teamAthlete: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    teamCoach: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
}

function makeArchiveTx(team?: object | null) {
  return {
    team: {
      findUnique: vi.fn().mockResolvedValue(team !== undefined ? team : savedTeam),
      update: vi.fn().mockResolvedValue({ ...savedTeam, archivedAt: now }),
    },
    school: { findUnique: vi.fn().mockResolvedValue(activeSchool) },
    coachSchoolMembership: { findFirst: vi.fn().mockResolvedValue({ id: "csm-1" }) },
  };
}

// ---------------------------------------------------------------------------
// CreateTeam
// ---------------------------------------------------------------------------

describe("CreateTeam", () => {
  it("rejects unauthenticated caller", async () => {
    const uc = new CreateTeam(makePrisma(makeCreateTeamTx()), () => now);
    await expect(uc.execute(null, { schoolId: "school-1", name: "Turma A" }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects when school not found", async () => {
    const tx = makeCreateTeamTx({ school: null });
    const uc = new CreateTeam(makePrisma(tx), () => now);
    await expect(uc.execute("user-owner", { schoolId: "school-1", name: "Turma A" }))
      .rejects.toMatchObject({ code: "SCHOOL_NOT_FOUND" });
  });

  it("allows school owner to create team", async () => {
    const tx = makeCreateTeamTx();
    const uc = new CreateTeam(makePrisma(tx), () => now);
    const result = await uc.execute("user-owner", { schoolId: "school-1", name: "Turma A" });
    expect(result.name).toBe("Turma A");
    expect(tx.team.create).toHaveBeenCalledOnce();
  });

  it("allows active coach to create team", async () => {
    const tx = makeCreateTeamTx();
    const uc = new CreateTeam(makePrisma(tx), () => now);
    const result = await uc.execute("user-coach", { schoolId: "school-1", name: "Turma B" });
    expect(result).toBeDefined();
  });

  it("rejects non-member creating team", async () => {
    const tx = makeCreateTeamTx({ coachMembership: null });
    const uc = new CreateTeam(makePrisma(tx), () => now);
    await expect(uc.execute("user-stranger", { schoolId: "school-1", name: "Turma C" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ---------------------------------------------------------------------------
// CreateTeam — roster informed at creation time [SAM-8]
// ---------------------------------------------------------------------------

describe("CreateTeam com participantes [SAM-8]", () => {
  it("cria turma sem participantes quando as listas são omitidas", async () => {
    const tx = makeCreateTeamTx();
    const uc = new CreateTeam(makePrisma(tx), () => now);
    await uc.execute("user-owner", { schoolId: "school-1", name: "Turma A" });
    // Turma sem ninguém é válida: a tela permite montar o elenco depois.
    expect(tx.teamAthlete.createMany).not.toHaveBeenCalled();
    expect(tx.teamCoach.createMany).not.toHaveBeenCalled();
  });

  it("vincula atletas e professores elegíveis na mesma transação", async () => {
    const tx = makeCreateTeamTx({
      eligibleAthleteIds: ["athlete-1", "athlete-2"],
      eligibleCoachIds: ["coach-1"],
    });
    const prisma = makePrisma(tx);
    const uc = new CreateTeam(prisma, () => now);

    await uc.execute("user-owner", {
      schoolId: "school-1",
      name: "Turma A",
      athleteIds: ["athlete-1", "athlete-2"],
      coachIds: ["coach-1"],
    });

    // Uma transação só: turma e vínculos entram juntos ou não entram.
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.teamAthlete.createMany).toHaveBeenCalledOnce();
    expect(tx.teamCoach.createMany).toHaveBeenCalledOnce();

    const athleteRows = tx.teamAthlete.createMany.mock.calls[0]![0].data;
    expect(athleteRows.map((row: { athleteId: string }) => row.athleteId)).toEqual([
      "athlete-1",
      "athlete-2",
    ]);
    expect(athleteRows.every((row: { teamId: string }) => row.teamId === savedTeam.id)).toBe(true);
    expect(tx.teamCoach.createMany.mock.calls[0]![0].data).toMatchObject([
      { teamId: savedTeam.id, coachId: "coach-1" },
    ]);
  });

  it("recusa atleta de outra escola e não cria a turma", async () => {
    const tx = makeCreateTeamTx({ eligibleAthleteIds: ["athlete-1"] });
    const uc = new CreateTeam(makePrisma(tx), () => now);

    await expect(
      uc.execute("user-owner", {
        schoolId: "school-1",
        name: "Turma A",
        athleteIds: ["athlete-1", "athlete-de-outra-escola"],
      }),
    ).rejects.toMatchObject({ code: "ATHLETE_NOT_MEMBER", status: 403 });

    // O id inelegível aborta tudo: a alternativa (ignorar em silêncio) criaria
    // uma turma diferente da que o usuário pediu.
    expect(tx.team.create).not.toHaveBeenCalled();
    expect(tx.teamAthlete.createMany).not.toHaveBeenCalled();
  });

  it("recusa professor sem vínculo ativo e não cria a turma", async () => {
    const tx = makeCreateTeamTx({ eligibleCoachIds: ["coach-1"] });
    const uc = new CreateTeam(makePrisma(tx), () => now);

    await expect(
      uc.execute("user-owner", {
        schoolId: "school-1",
        name: "Turma A",
        coachIds: ["coach-de-outra-escola"],
      }),
    ).rejects.toMatchObject({ code: "COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE", status: 403 });

    expect(tx.team.create).not.toHaveBeenCalled();
    expect(tx.teamCoach.createMany).not.toHaveBeenCalled();
  });

  it("valida pertencimento à escola do path, não a outra informada", async () => {
    // A consulta de elegibilidade precisa usar o schoolId da turma; se usasse
    // qualquer outro, um atleta de fora passaria pela checagem.
    const tx = makeCreateTeamTx({ eligibleAthleteIds: ["athlete-1"] });
    const uc = new CreateTeam(makePrisma(tx), () => now);
    await uc.execute("user-owner", {
      schoolId: "school-1",
      name: "Turma A",
      athleteIds: ["athlete-1"],
    });
    expect(tx.schoolAthleteMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ schoolId: "school-1", status: "ACTIVE" }),
      }),
    );
  });

  it("colapsa ids repetidos em um único vínculo", async () => {
    const tx = makeCreateTeamTx({ eligibleAthleteIds: ["athlete-1"] });
    const uc = new CreateTeam(makePrisma(tx), () => now);
    await uc.execute("user-owner", {
      schoolId: "school-1",
      name: "Turma A",
      athleteIds: ["athlete-1", "athlete-1"],
    });
    // Selecionar duas vezes é a mesma escolha; o unique do banco recusaria.
    expect(tx.teamAthlete.createMany.mock.calls[0]![0].data).toHaveLength(1);
  });

  it("recusa quando a seleção inicial passa da capacidade declarada", async () => {
    const tx = makeCreateTeamTx({ eligibleAthleteIds: ["athlete-1", "athlete-2"] });
    const uc = new CreateTeam(makePrisma(tx), () => now);
    await expect(
      uc.execute("user-owner", {
        schoolId: "school-1",
        name: "Turma A",
        capacity: 1,
        athleteIds: ["athlete-1", "athlete-2"],
      }),
    ).rejects.toMatchObject({ code: "TEAM_CAPACITY_EXCEEDED", status: 409 });
    expect(tx.team.create).not.toHaveBeenCalled();
  });

  it("aceita seleção exatamente igual à capacidade", async () => {
    const tx = makeCreateTeamTx({ eligibleAthleteIds: ["athlete-1", "athlete-2"] });
    const uc = new CreateTeam(makePrisma(tx), () => now);
    await uc.execute("user-owner", {
      schoolId: "school-1",
      name: "Turma A",
      capacity: 2,
      athleteIds: ["athlete-1", "athlete-2"],
    });
    expect(tx.teamAthlete.createMany).toHaveBeenCalledOnce();
  });

  it("recusa quem não tem permissão antes de tocar nos vínculos", async () => {
    const tx = makeCreateTeamTx({
      coachMembership: null,
      eligibleAthleteIds: ["athlete-1"],
    });
    const uc = new CreateTeam(makePrisma(tx), () => now);
    await expect(
      uc.execute("user-stranger", {
        schoolId: "school-1",
        name: "Turma A",
        athleteIds: ["athlete-1"],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(tx.schoolAthleteMembership.findMany).not.toHaveBeenCalled();
    expect(tx.teamAthlete.createMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ArchiveTeam
// ---------------------------------------------------------------------------

describe("ArchiveTeam", () => {
  it("rejects unauthenticated caller", async () => {
    const uc = new ArchiveTeam(makePrisma(makeArchiveTx()), () => now);
    await expect(uc.execute(null, { teamId: "team-1" }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects when team not found", async () => {
    const tx = makeArchiveTx(null);
    const uc = new ArchiveTeam(makePrisma(tx), () => now);
    await expect(uc.execute("user-owner", { teamId: "team-X" }))
      .rejects.toMatchObject({ code: "TEAM_NOT_FOUND" });
  });

  it("rejects archiving already-archived team", async () => {
    const tx = makeArchiveTx({ ...savedTeam, archivedAt: new Date("2026-09-01") });
    const uc = new ArchiveTeam(makePrisma(tx), () => now);
    await expect(uc.execute("user-owner", { teamId: "team-1" }))
      .rejects.toMatchObject({ code: "TEAM_ALREADY_ARCHIVED" });
  });

  it("archives a team", async () => {
    const tx = makeArchiveTx();
    const uc = new ArchiveTeam(makePrisma(tx), () => now);
    const result = await uc.execute("user-owner", { teamId: "team-1" });
    expect(result.archivedAt).toEqual(now);
    expect(tx.team.update).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// AddAthleteToTeam / RemoveAthleteFromTeam
// ---------------------------------------------------------------------------

function makeAthleteTx(
  opts: { team?: object | null; athleteMembership?: object | null; existing?: object | null; occupancy?: number } = {},
) {
  return {
    team: { findUnique: vi.fn().mockResolvedValue(opts.team !== undefined ? opts.team : savedTeam) },
    school: { findUnique: vi.fn().mockResolvedValue(activeSchool) },
    coachSchoolMembership: { findFirst: vi.fn().mockResolvedValue({ id: "csm-1" }) },
    schoolAthleteMembership: { findFirst: vi.fn().mockResolvedValue(opts.athleteMembership !== undefined ? opts.athleteMembership : { id: "sam-1" }) },
    teamAthlete: {
      create: vi.fn().mockResolvedValue({ id: "ta-1", teamId: "team-1", athleteId: "athlete-1", createdAt: now }),
      findFirst: vi.fn().mockResolvedValue(opts.existing !== undefined ? opts.existing : { id: "ta-1" }),
      delete: vi.fn().mockResolvedValue({ id: "ta-1" }),
      count: vi.fn().mockResolvedValue(opts.occupancy ?? 0),
    },
  };
}

describe("AddAthleteToTeam", () => {
  it("rejects archived team", async () => {
    const tx = makeAthleteTx({ team: { ...savedTeam, archivedAt: new Date() } });
    const uc = new AddAthleteToTeam(makePrisma(tx), () => now);
    await expect(uc.execute("user-owner", { teamId: "team-1", athleteId: "athlete-1" }))
      .rejects.toMatchObject({ code: "TEAM_ARCHIVED" });
  });

  it("rejects athlete not in school", async () => {
    const tx = makeAthleteTx({ athleteMembership: null });
    const uc = new AddAthleteToTeam(makePrisma(tx), () => now);
    await expect(uc.execute("user-owner", { teamId: "team-1", athleteId: "athlete-outsider" }))
      .rejects.toMatchObject({ code: "ATHLETE_NOT_MEMBER" });
  });

  it("adds athlete to team", async () => {
    const tx = makeAthleteTx();
    const uc = new AddAthleteToTeam(makePrisma(tx), () => now);
    const result = await uc.execute("user-owner", { teamId: "team-1", athleteId: "athlete-1" });
    expect(result.teamId).toBe("team-1");
    expect(tx.teamAthlete.create).toHaveBeenCalledOnce();
  });

  // T504 — capacidade declarada
  it("não consulta ocupação quando a capacidade é nula [T504]", async () => {
    const tx = makeAthleteTx({ team: { ...savedTeam, capacity: null }, occupancy: 999 });
    const uc = new AddAthleteToTeam(makePrisma(tx), () => now);
    await uc.execute("user-owner", { teamId: "team-1", athleteId: "athlete-1" });
    // Sem limite declarado a contagem é trabalho desperdiçado em toda inclusão.
    expect(tx.teamAthlete.count).not.toHaveBeenCalled();
    expect(tx.teamAthlete.create).toHaveBeenCalledOnce();
  });

  it("aceita quando ainda há vaga [T504]", async () => {
    const tx = makeAthleteTx({ team: { ...savedTeam, capacity: 10 }, occupancy: 9 });
    const uc = new AddAthleteToTeam(makePrisma(tx), () => now);
    await uc.execute("user-owner", { teamId: "team-1", athleteId: "athlete-1" });
    expect(tx.teamAthlete.create).toHaveBeenCalledOnce();
  });

  it("recusa quando a turma está exatamente cheia [T504]", async () => {
    // Borda que separa `>=` de `>`: com occupancy == capacity a vaga acabou.
    const tx = makeAthleteTx({ team: { ...savedTeam, capacity: 10 }, occupancy: 10 });
    const uc = new AddAthleteToTeam(makePrisma(tx), () => now);
    await expect(uc.execute("user-owner", { teamId: "team-1", athleteId: "athlete-1" }))
      .rejects.toMatchObject({ code: "TEAM_CAPACITY_EXCEEDED", status: 409 });
    expect(tx.teamAthlete.create).not.toHaveBeenCalled();
  });

  it("recusa quando a ocupação já passou da capacidade reduzida [T504]", async () => {
    // Capacidade pode ser reduzida abaixo do efetivo atual; quem já está fica,
    // mas ninguém novo entra.
    const tx = makeAthleteTx({ team: { ...savedTeam, capacity: 5 }, occupancy: 8 });
    const uc = new AddAthleteToTeam(makePrisma(tx), () => now);
    await expect(uc.execute("user-owner", { teamId: "team-1", athleteId: "athlete-1" }))
      .rejects.toMatchObject({ code: "TEAM_CAPACITY_EXCEEDED" });
    expect(tx.teamAthlete.create).not.toHaveBeenCalled();
  });

  it("verifica capacidade dentro da transação [T504]", async () => {
    // Se a contagem rodasse fora da transação, duas inclusões simultâneas
    // poderiam ler a mesma ocupação e ambas passarem.
    const tx = makeAthleteTx({ team: { ...savedTeam, capacity: 10 }, occupancy: 9 });
    const prisma = makePrisma(tx);
    const uc = new AddAthleteToTeam(prisma, () => now);
    await uc.execute("user-owner", { teamId: "team-1", athleteId: "athlete-1" });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.teamAthlete.count).toHaveBeenCalledWith({ where: { teamId: "team-1" } });
  });
});

describe("RemoveAthleteFromTeam", () => {
  it("rejects when athlete not in team", async () => {
    const tx = makeAthleteTx({ existing: null });
    const uc = new RemoveAthleteFromTeam(makePrisma(tx), () => now);
    await expect(uc.execute("user-owner", { teamId: "team-1", athleteId: "athlete-99" }))
      .rejects.toMatchObject({ code: "ATHLETE_NOT_IN_TEAM" });
  });

  it("removes athlete from team", async () => {
    const tx = makeAthleteTx();
    const uc = new RemoveAthleteFromTeam(makePrisma(tx), () => now);
    await uc.execute("user-owner", { teamId: "team-1", athleteId: "athlete-1" });
    expect(tx.teamAthlete.delete).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// AddCoachToTeam / RemoveCoachFromTeam
// ---------------------------------------------------------------------------

function makeCoachTx(opts: { team?: object | null; coachMembership?: object | null; existing?: object | null } = {}) {
  return {
    team: { findUnique: vi.fn().mockResolvedValue(opts.team !== undefined ? opts.team : savedTeam) },
    school: { findUnique: vi.fn().mockResolvedValue(activeSchool) },
    coachSchoolMembership: {
      findFirst: vi.fn().mockResolvedValue(opts.coachMembership !== undefined ? opts.coachMembership : { id: "csm-1" }),
    },
    teamCoach: {
      create: vi.fn().mockResolvedValue({ id: "tc-1", teamId: "team-1", coachId: "coach-1", createdAt: now }),
      findFirst: vi.fn().mockResolvedValue(opts.existing !== undefined ? opts.existing : { id: "tc-1" }),
      delete: vi.fn().mockResolvedValue({ id: "tc-1" }),
    },
  };
}

describe("AddCoachToTeam", () => {
  it("rejects archived team", async () => {
    const tx = makeCoachTx({ team: { ...savedTeam, archivedAt: new Date() } });
    const uc = new AddCoachToTeam(makePrisma(tx), () => now);
    await expect(uc.execute("user-owner", { teamId: "team-1", coachId: "coach-1" }))
      .rejects.toMatchObject({ code: "TEAM_ARCHIVED" });
  });

  it("rejects coach not in school", async () => {
    // First findFirst is for membership check (assertSchoolMembership), second for coach membership
    const tx = makeCoachTx({ coachMembership: null });
    tx.school.findUnique = vi.fn().mockResolvedValue({ ...activeSchool, ownerUserId: "user-owner" });
    // owner is calling, so assertSchoolMembership passes; but coach membership check fails
    const uc = new AddCoachToTeam(makePrisma(tx), () => now);
    await expect(uc.execute("user-owner", { teamId: "team-1", coachId: "coach-outsider" }))
      .rejects.toMatchObject({ code: "COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE" });
  });

  it("adds coach to team", async () => {
    const tx = makeCoachTx();
    const uc = new AddCoachToTeam(makePrisma(tx), () => now);
    const result = await uc.execute("user-owner", { teamId: "team-1", coachId: "coach-1" });
    expect(result.teamId).toBe("team-1");
    expect(tx.teamCoach.create).toHaveBeenCalledOnce();
  });
});

describe("RemoveCoachFromTeam", () => {
  it("rejects when coach not in team", async () => {
    const tx = makeCoachTx({ existing: null });
    const uc = new RemoveCoachFromTeam(makePrisma(tx), () => now);
    await expect(uc.execute("user-owner", { teamId: "team-1", coachId: "coach-99" }))
      .rejects.toMatchObject({ code: "COACH_NOT_IN_TEAM" });
  });

  it("removes coach from team", async () => {
    const tx = makeCoachTx();
    const uc = new RemoveCoachFromTeam(makePrisma(tx), () => now);
    await uc.execute("user-owner", { teamId: "team-1", coachId: "coach-1" });
    expect(tx.teamCoach.delete).toHaveBeenCalledOnce();
  });
});
