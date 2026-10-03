/**
 * SAM-53 — desired × agreed goals with revisions (§5.4, §8.4, AC04).
 */
import { describe, expect, it, vi } from "vitest";

import { goalInputSchema, goalPatchSchema, goalVersionAt } from "@/modules/school/domain/athlete-goal";
import { CreateAthleteGoal, ListAthleteGoals, UpdateAthleteGoal } from "@/modules/school/application/athlete-goals";

const NOW = new Date("2026-10-03T12:00:00.000Z");
const clock = () => NOW;

function makeDb(overrides: Record<string, unknown> = {}) {
  return {
    coachAthleteAssignment: {
      findMany: vi.fn().mockImplementation(({ where }: { where: { coach: { userId: string } } }) =>
        Promise.resolve(where.coach.userId === "coach" ? [{ schoolId: null }] : [])),
      findFirst: vi.fn().mockResolvedValue({ id: "assignment" }),
    },
    schoolAthleteMembership: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    school: { findUnique: vi.fn() },
    schoolMembership: { findFirst: vi.fn() },
    schoolMembershipRole: { findMany: vi.fn() },
    athleteEventParticipation: { findFirst: vi.fn().mockResolvedValue({ id: "p1" }) },
    athleteGoal: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(data)),
      findFirst: vi.fn().mockResolvedValue({ id: "wish" }),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(),
    ...overrides,
  };
}

describe("domínio", () => {
  it("objetivo de processo sem evento é aceito; alvo e faixa não convivem", () => {
    expect(goalInputSchema.parse({ type: "PROCESS", description: "nadar 3x por semana" })).toMatchObject({ participationId: null, origin: "ATHLETE_DESIRED" });
    expect(() => goalInputSchema.parse({ type: "RESULT", description: "10 km", targetValue: 50, targetMin: 45 })).toThrow(/alvo ou uma faixa/);
    expect(() => goalInputSchema.parse({ type: "RESULT", description: "10 km", desiredGoalId: "w" })).toThrow(/pactuado/);
  });

  it("encerrar exige justificativa; patch parcial não traz defaults", () => {
    expect(() => goalPatchSchema.parse({ status: "NOT_ACHIEVED", expectedVersion: 1 })).toThrow(/Justifique/);
    expect(goalPatchSchema.parse({ description: "sub 55", expectedVersion: 1 })).toEqual({ description: "sub 55", expectedVersion: 1 });
  });

  it("versão vigente numa data passada desfaz as revisões posteriores (§8.4)", () => {
    const current = { id: "g", targetValue: 55, description: "10 km", createdAt: new Date("2026-08-01") };
    const revisions = [
      { changedAt: new Date("2026-09-01"), changes: { targetValue: { from: 50, to: 52 } } },
      { changedAt: new Date("2026-09-20"), changes: { targetValue: { from: 52, to: 55 } } },
    ];
    expect(goalVersionAt(current, revisions, new Date("2026-08-15"))?.targetValue).toBe(50);
    expect(goalVersionAt(current, revisions, new Date("2026-09-10"))?.targetValue).toBe(52);
    expect(goalVersionAt(current, revisions, NOW)?.targetValue).toBe(55);
    expect(goalVersionAt(current, revisions, new Date("2026-07-01"))).toBeNull();
  });
});

describe("CreateAthleteGoal", () => {
  it("aluno registra desejo; professor pactua apontando o desejo, sem apagá-lo", async () => {
    const db = makeDb();
    const wish = await new CreateAthleteGoal(db as never, clock).execute("athlete", { type: "RESULT", description: "10 km abaixo de 50 min", unit: "min", targetValue: 50 });
    expect(wish).toMatchObject({ origin: "ATHLETE_DESIRED", athleteId: "athlete", createdByUserId: "athlete", responsibleUserId: null });
    const agreed = await new CreateAthleteGoal(db as never, clock).execute("coach", {
      athleteId: "athlete", type: "PROCESS", description: "concluir com controle", origin: "COACH_AGREED", desiredGoalId: "wish",
    });
    expect(agreed).toMatchObject({ origin: "COACH_AGREED", desiredGoalId: "wish", createdByUserId: "coach", responsibleUserId: "coach" });
    expect(db.athleteGoal.create).toHaveBeenCalledTimes(2);
  });

  it("aluno não cria objetivo pactuado; estranho recebe 404", async () => {
    const db = makeDb();
    await expect(new CreateAthleteGoal(db as never, clock).execute("athlete", { type: "PROCESS", description: "x x", origin: "COACH_AGREED" }))
      .rejects.toMatchObject({ status: 403 });
    await expect(new CreateAthleteGoal(db as never, clock).execute("stranger", { athleteId: "athlete", type: "PROCESS", description: "x x" }))
      .rejects.toMatchObject({ status: 404 });
  });
});

describe("UpdateAthleteGoal", () => {
  const wish = { id: "wish", athleteId: "athlete", origin: "ATHLETE_DESIRED", targetValue: 50, description: "10 km", status: "ACTIVE", needsReviewSince: null, version: 1 };

  function txDb(current: Record<string, unknown>) {
    const tx = {
      athleteGoal: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: vi.fn().mockResolvedValue({ id: current.id }) },
      athleteGoalRevision: { create: vi.fn().mockResolvedValue({}) },
    };
    const db = makeDb({ $transaction: vi.fn().mockImplementation((fn: (client: unknown) => unknown) => fn(tx)) });
    db.athleteGoal.findUnique.mockResolvedValue(current);
    return { db, tx };
  }

  it("alterar alvo grava antes/depois com autor e marca revisão pendente (AC04)", async () => {
    const { db, tx } = txDb(wish);
    await new UpdateAthleteGoal(db as never, clock).execute("athlete", "wish", { targetValue: 48, expectedVersion: 1, reason: "treinei mais" });
    expect(tx.athleteGoalRevision.create.mock.calls[0][0].data).toMatchObject({ changedByUserId: "athlete", changes: { targetValue: { from: 50, to: 48 } }, reason: "treinei mais" });
    expect(tx.athleteGoal.updateMany.mock.calls[0][0].data.needsReviewSince).toEqual(NOW);
  });

  it("aluno não altera o pactuado; professor altera e limpa a revisão pendente", async () => {
    const agreed = { ...wish, id: "agreed", origin: "COACH_AGREED", needsReviewSince: new Date("2026-10-01") };
    const { db, tx } = txDb(agreed);
    await expect(new UpdateAthleteGoal(db as never, clock).execute("athlete", "agreed", { description: "outra", expectedVersion: 1 }))
      .rejects.toMatchObject({ status: 403 });
    await new UpdateAthleteGoal(db as never, clock).execute("coach", "agreed", { status: "ACHIEVED", statusReason: "concluiu bem", expectedVersion: 1 });
    expect(tx.athleteGoal.updateMany.mock.calls[0][0].data.needsReviewSince).toBeNull();
  });

  it("versão antiga: conflito", async () => {
    const { db, tx } = txDb(wish);
    tx.athleteGoal.updateMany.mockResolvedValue({ count: 0 });
    await expect(new UpdateAthleteGoal(db as never, clock).execute("athlete", "wish", { targetValue: 47, expectedVersion: 1 }))
      .rejects.toMatchObject({ code: "GOAL_CONFLICT", status: 409 });
  });
});

describe("ListAthleteGoals", () => {
  it("agrupa desejo com o pactuado que o responde; pactuado avulso fica sozinho", async () => {
    const row = (id: string, origin: string, desiredGoalId: string | null) => ({
      id, origin, desiredGoalId, type: "RESULT", description: id, indicator: null, unit: null, baselineValue: null,
      targetValue: null, targetMin: null, targetMax: null, dueLocalDate: null, evaluationMethod: null, acceptedEvidence: null,
      status: "ACTIVE", statusReason: null, participationId: null, needsReviewSince: null, version: 1,
      createdBy: { name: "X" }, revisions: [],
    });
    const db = makeDb();
    db.athleteGoal.findMany.mockResolvedValue([row("wish", "ATHLETE_DESIRED", null), row("agreed", "COACH_AGREED", "wish"), row("solo", "COACH_AGREED", null)]);
    const pairs = await new ListAthleteGoals(db as never, clock).execute("athlete", "athlete");
    expect(pairs.map((pair) => [pair.desired?.id ?? null, pair.agreed.map((goal) => goal.id)])).toEqual([["wish", ["agreed"]], [null, ["solo"]]]);
  });
});
