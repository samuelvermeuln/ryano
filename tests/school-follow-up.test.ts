/**
 * SAM-68 — school/assessoria follow-up (§19.3, §20, §16.4, §22.7): coordination
 * board, queue assignment, collaborators by discipline and the access limits.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => ({ manager: true }));
vi.mock("@/modules/school/application/can-manage-school", () => ({ CanManageSchool: class { execute() { return Promise.resolve(access.manager); } } }));
vi.mock("@/modules/school/application/can-manage-members", () => ({ CanManageMembers: class { assert() { return Promise.resolve(); } } }));
const assignCore = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }));
const changePreparation = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock("@/modules/school/application/event-preparations", () => ({
  ChangeEventPreparation: class { execute(...args: unknown[]) { changePreparation.calls.push(args); return Promise.resolve({ ok: true }); } },
}));
beforeEach(() => { access.manager = true; assignCore.calls = []; changePreparation.calls = []; });

import { AddCollaboratorCoach, AssignPreparationCoach, GetSchoolFollowUpBoard } from "@/modules/school/application/school-follow-up";

const NOW = new Date("2026-10-03T12:00:00.000Z");
const event = { id: "ev1", name: "Travessia da Baía", startLocalDate: "2026-12-20" };
const prep = (id: string, athleteId: string, name: string, goal: string, coachId: string | null, status: string) => ({
  id: `prep-${id}`, status, version: 1, coachId, coach: coachId ? { displayName: coachId === "c-carlos" ? "Carlos" : "Ana" } : null,
  participation: { id: `p-${id}`, athleteId, goalText: goal, athlete: { name }, event, option: { label: "2 km" } },
});

/** Only the models the board may read: anything else (health, activities) throws. */
function boardDb() {
  const models: Record<string, unknown> = {
    eventPreparation: { findMany: vi.fn().mockResolvedValue([prep("1", "joao", "João", "concluir", "c-carlos", "PLANNING"), prep("2", "fernanda", "Fernanda", "baixar 3 min", "c-ana", "AWAITING_ASSESSMENT"), prep("3", "pedro", "Pedro", "primeira travessia", null, "UNASSIGNED")]) },
    coachSchoolMembership: { findMany: vi.fn().mockResolvedValue([{ coachId: "c-carlos", coach: { displayName: "Carlos", userId: "u-carlos" } }, { coachId: "c-ana", coach: { displayName: "Ana", userId: "u-ana" } }]) },
    schoolAthleteMembership: { findMany: vi.fn().mockResolvedValue([]) },
    followUpTask: { findMany: vi.fn().mockResolvedValue([{ assigneeUserId: "u-ana", dueAt: new Date("2026-10-01T00:00:00Z"), rescheduledTo: null }, { assigneeUserId: null, dueAt: null, rescheduledTo: null }]) },
    athleteGoal: { findMany: vi.fn().mockResolvedValue([{ participationId: "p-2", description: "nadar abaixo de 45 min" }]) },
    coachAthleteAssignment: { findMany: vi.fn().mockResolvedValue([{ athleteId: "joao", isPrimary: true, discipline: null, coach: { displayName: "Carlos" } }, { athleteId: "joao", isPrimary: false, discipline: "natação", coach: { displayName: "Ana" } }]) },
  };
  return new Proxy(models, { get(target, key: string) { if (!(key in target)) throw new Error(`board must not read ${key}`); return target[key]; } });
}

describe("painel da escola", () => {
  it("três alunos no mesmo evento com objetivos distintos, distribuição, fila e equipe — sem ler dados de saúde", async () => {
    const board = await new GetSchoolFollowUpBoard(boardDb() as never, () => NOW).execute("owner", "alpha");
    const participants = board.events[0]!.participants;
    expect(participants.map((item) => item.goal)).toEqual(["concluir (desejado)", "nadar abaixo de 45 min (pactuado)", "primeira travessia (desejado)"]);
    expect(participants[2]).toMatchObject({ responsible: null, status: "UNASSIGNED" });
    expect(participants[0]!.team).toEqual([{ name: "Carlos", primary: true, discipline: null }, { name: "Ana", primary: false, discipline: "natação" }]);
    expect(board.distribution.find((row) => row.name === "Ana")).toMatchObject({ preparations: 1, awaitingAnalysis: 1, openTasks: 1, overdueTasks: 1 });
    expect(board).toMatchObject({ unassigned: 1, queueTasks: 1 });
  });

  it("só a coordenação (OWNER/ADMIN) abre o painel", async () => {
    access.manager = false;
    await expect(new GetSchoolFollowUpBoard(boardDb() as never, () => NOW).execute("carlos", "alpha")).rejects.toMatchObject({ status: 403 });
  });
});

function txDb(options: { primary?: boolean; linked?: boolean } = {}) {
  const tx = {
    eventPreparation: { findUnique: vi.fn().mockResolvedValue({ id: "prep-3", schoolId: "alpha", participation: { athleteId: "pedro" } }) },
    coachAthleteAssignment: {
      findFirst: vi.fn().mockImplementation(({ where }: { where: { isPrimary?: boolean; coachId?: string } }) =>
        Promise.resolve(where.isPrimary ? (options.primary ? { id: "primary" } : null) : options.linked ? { id: "link" } : null)),
    },
    $transaction: vi.fn(),
  };
  tx.$transaction.mockImplementation((fn: (client: unknown) => unknown) => fn(tx));
  return tx;
}

vi.mock("@/modules/school/application/assign-coach-to-athlete", async (original) => {
  const real = await original<typeof import("@/modules/school/application/assign-coach-to-athlete")>();
  return {
    ...real,
    assignCoachToAthleteInTransaction: vi.fn((...args: unknown[]) => {
      if ((args[7] as { isPrimary?: boolean } | undefined)?.isPrimary === undefined) return real.assignCoachToAthleteInTransaction(...(args as Parameters<typeof real.assignCoachToAthleteInTransaction>));
      assignCore.calls.push({ coachId: args[4], options: args[7] });
      return Promise.resolve({ id: "new-link" });
    }),
  };
});

describe("atribuir professor à fila", () => {
  it("sem responsável na escola: o professor vira o responsável principal e assume o acompanhamento", async () => {
    await new AssignPreparationCoach(txDb() as never, () => NOW).execute("owner", "prep-3", { coachId: "c-carlos", expectedVersion: 1 });
    expect(assignCore.calls).toEqual([{ coachId: "c-carlos", options: { isPrimary: true } }]);
    expect(changePreparation.calls[0]).toEqual(["owner", "prep-3", { action: "assign", expectedVersion: 1, coachId: "c-carlos", reason: "coordenação definiu o responsável" }]);
  });

  it("aluno já tem responsável principal: o escolhido entra como colaborador; quem já acompanha não ganha outro vínculo", async () => {
    await new AssignPreparationCoach(txDb({ primary: true }) as never, () => NOW).execute("owner", "prep-3", { coachId: "c-ana", expectedVersion: 2 });
    expect(assignCore.calls[0]).toMatchObject({ options: { isPrimary: false } });
    assignCore.calls = [];
    await new AssignPreparationCoach(txDb({ linked: true }) as never, () => NOW).execute("owner", "prep-3", { coachId: "c-ana", expectedVersion: 2 });
    expect(assignCore.calls).toEqual([]);
    access.manager = false;
    await expect(new AssignPreparationCoach(txDb() as never, () => NOW).execute("carlos", "prep-3", { coachId: "c-ana", expectedVersion: 1 })).rejects.toMatchObject({ status: 403 });
  });

  it("colaborador por disciplina passa pela coordenação", async () => {
    const db = txDb();
    await new AddCollaboratorCoach(db as never, () => NOW).execute("owner", "alpha", { athleteId: "pedro", coachId: "c-ana", discipline: "natação" });
    expect(assignCore.calls[0]).toMatchObject({ coachId: "c-ana", options: { isPrimary: false, discipline: "natação" } });
  });
});
