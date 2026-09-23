/**
 * T513 — O card "Solicitações pendentes" do painel da escola precisa concordar
 * com a tela de solicitações, que lista atletas E professores pendentes.
 *
 * Antes desta correção o card contava apenas `schoolAthleteMembership`, então
 * uma escola com professores aguardando aprovação exibia um número menor do que
 * a lista para a qual o card leva.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  athleteCount: vi.fn(),
  coachCount: vi.fn(),
  teamCount: vi.fn(),
  schoolFindUnique: vi.fn(),
  assignmentFindMany: vi.fn(),
  assignmentGroupBy: vi.fn(),
  executionFindMany: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    school: { findUnique: mocks.schoolFindUnique },
    schoolAthleteMembership: { count: mocks.athleteCount },
    coachSchoolMembership: { count: mocks.coachCount },
    team: { count: mocks.teamCount },
    workoutAssignment: { findMany: mocks.assignmentFindMany, groupBy: mocks.assignmentGroupBy },
    workoutExecution: { findMany: mocks.executionFindMany },
  },
}));
vi.mock("@/server/auth-guards", () => ({ requireOnboardedSession: vi.fn() }));
vi.mock("@/modules/school/config/feature-flag", () => ({ isSchoolModuleEnabled: () => true }));

import { getSchoolOverview } from "@/app/escola/[schoolId]/page";

/** `count` é chamado uma vez para atletas ativos e outra para pendentes. */
function countByStatus(active: number, pending: number) {
  return vi.fn(async (args: { where: { status?: string } }) =>
    args.where.status === "PENDING" ? pending : active);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.schoolFindUnique.mockResolvedValue({ id: "school-1", name: "Escola A", status: "ACTIVE" });
  mocks.teamCount.mockResolvedValue(0);
  mocks.assignmentFindMany.mockResolvedValue([]);
  mocks.assignmentGroupBy.mockResolvedValue([]);
  mocks.executionFindMany.mockResolvedValue([]);
});

describe("getSchoolOverview — pendingRequests [T513]", () => {
  it("soma atletas e professores pendentes", async () => {
    mocks.athleteCount.mockImplementation(countByStatus(10, 3));
    mocks.coachCount.mockImplementation(countByStatus(4, 2));

    const data = await getSchoolOverview("school-1");

    // 3 atletas + 2 professores. O código antigo retornava 3.
    expect(data.pendingRequests).toBe(5);
  });

  it("conta professores pendentes mesmo sem atleta pendente", async () => {
    mocks.athleteCount.mockImplementation(countByStatus(10, 0));
    mocks.coachCount.mockImplementation(countByStatus(4, 2));

    const data = await getSchoolOverview("school-1");

    // Caso que o bug escondia por completo: card mostrava 0 e a lista, 2.
    expect(data.pendingRequests).toBe(2);
  });

  it("usa o mesmo filtro da tela de solicitações: status PENDING sem recorte por endedAt", async () => {
    mocks.athleteCount.mockImplementation(countByStatus(0, 1));
    mocks.coachCount.mockImplementation(countByStatus(0, 1));

    await getSchoolOverview("school-1");

    // A tela não filtra por endedAt; incluir o filtro aqui voltaria a divergir.
    expect(mocks.coachCount).toHaveBeenCalledWith({
      where: { schoolId: "school-1", status: "PENDING" },
    });
  });

  it("não conta pendentes como ativos", async () => {
    mocks.athleteCount.mockImplementation(countByStatus(10, 3));
    mocks.coachCount.mockImplementation(countByStatus(4, 2));

    const data = await getSchoolOverview("school-1");

    expect(data.athleteCount).toBe(10);
    expect(data.coachCount).toBe(4);
  });
});
