/**
 * SAM-54 — follow-up of a participation (§6, §6.1, §7.3; AC03, AC18, AC21).
 */
import { describe, expect, it, vi } from "vitest";

import { canApply, preparationStatusText } from "@/modules/school/domain/event-preparation";
import { ChangeEventPreparation, GetEventPreparation, openPreparation } from "@/modules/school/application/event-preparations";

const NOW = new Date("2026-10-03T12:00:00.000Z");
const clock = () => NOW;

type Link = { coachId: string; schoolId: string | null; userId: string; displayName: string };

/**
 * In-memory db: `links` are the active coaching links the current-data gate
 * accepts (school checks pass for schoolId "alpha"); `managers` manage schools.
 */
function makeDb({ links = [] as Link[], schoolMembership = null as { schoolId: string } | null, preparation = null as Record<string, unknown> | null, managers = [] as string[] } = {}) {
  const live = { links: [...links] };
  const db = {
    live,
    coachAthleteAssignment: {
      findMany: vi.fn().mockImplementation(({ where }: { where: { coach: { userId?: string } } }) =>
        Promise.resolve(live.links.filter((link) => !where.coach.userId || link.userId === where.coach.userId)
          .map((link) => ({ coachId: link.coachId, schoolId: link.schoolId, coach: { userId: link.userId, displayName: link.displayName } })))),
      findFirst: vi.fn().mockImplementation(({ where }: { where: { coachId?: string; coach?: { userId: string } } }) => {
        const link = live.links.find((item) => (where.coachId ? item.coachId === where.coachId : item.userId === where.coach?.userId));
        return Promise.resolve(link ? { id: "a", coach: { userId: link.userId } } : null);
      }),
    },
    school: { findUnique: vi.fn().mockResolvedValue({ id: "alpha", status: "ACTIVE" }) },
    schoolAthleteMembership: {
      findFirst: vi.fn().mockImplementation(() => Promise.resolve(schoolMembership || live.links.some((link) => link.schoolId)
        ? { id: "m", schoolId: schoolMembership?.schoolId ?? "alpha" } : null)),
    },
    schoolMembership: {
      findMany: vi.fn().mockResolvedValue(managers.map((userId) => ({ userId }))),
      findFirst: vi.fn().mockImplementation(({ where }: { where: { userId: string } }) => Promise.resolve(managers.includes(where.userId) ? { id: "sm", userId: where.userId, schoolId: "alpha", status: "ACTIVE", endedAt: null } : null)),
    },
    schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([{ membershipId: "sm", role: "OWNER" }]) },
    eventPreparation: {
      findUnique: vi.fn().mockImplementation(() => Promise.resolve(db.eventPreparation.current)),
      findUniqueOrThrow: vi.fn().mockImplementation(() => Promise.resolve(db.eventPreparation.current)),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(data)),
      /** A successful write makes the next read return `afterWrite` (when set). */
      updateMany: vi.fn().mockImplementation(() => {
        if (db.eventPreparation.afterWrite) db.eventPreparation.current = db.eventPreparation.afterWrite;
        return Promise.resolve({ count: 1 });
      }),
      current: preparation,
      afterWrite: null as Record<string, unknown> | null,
    },
    eventPreparationTransition: { create: vi.fn().mockResolvedValue({}) },
    // SAM-55 — follow-up tasks touched by revocation/transfer.
    followUpTask: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    followUpTaskTransition: { create: vi.fn().mockResolvedValue({}) },
    coachProfile: { findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve({ userId: live.links.find((link) => link.coachId === where.id)?.userId ?? "user-" + where.id })) },
    user: { findUnique: vi.fn().mockResolvedValue({ name: "Maria" }) },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(db));
  return db;
}

const ricardo: Link = { coachId: "coach-ricardo", schoolId: null, userId: "ricardo", displayName: "Ricardo Souza" };
const carlosAlpha: Link = { coachId: "coach-carlos", schoolId: "alpha", userId: "carlos", displayName: "Carlos Mendes" };

function preparationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "prep", participationId: "p1", coachId: "coach-ricardo", schoolId: null, status: "AWAITING_ASSESSMENT",
    startedAt: null, closedAt: null, firstReviewLocalDate: null, analysisNotes: null, version: 1,
    coach: { id: "coach-ricardo", userId: "ricardo", displayName: "Ricardo Souza" },
    participation: { id: "p1", athleteId: "maria", status: "PLANNED", goalText: null, athlete: { name: "Maria" }, event: { id: "e", name: "Travessia", startLocalDate: "2026-12-20", timeZone: "America/Sao_Paulo", sportType: "open-water" }, option: null },
    transitions: [],
    ...overrides,
  };
}

describe("domínio", () => {
  it("texto ao aluno nomeia o professor; sem responsável diz isso", () => {
    expect(preparationStatusText("AWAITING_ASSESSMENT", "Ricardo Souza")).toBe("Evento registrado — aguardando avaliação do professor Ricardo Souza");
    expect(preparationStatusText("UNASSIGNED", null)).toBe("Evento registrado — sem professor responsável");
    expect(canApply("assume", "PLANNING")).toBe(false);
    expect(canApply("resume", "PAUSED")).toBe(true);
  });
});

describe("openPreparation", () => {
  it.each([
    ["independente", ricardo, null],
    ["escola", carlosAlpha, "alpha"],
  ])("com professor %s ativo: AWAITING_ASSESSMENT com responsável (AC18)", async (_scope, link, schoolId) => {
    const db = makeDb({ links: [link] });
    const created = await openPreparation(db as never, clock, { id: "p1", athleteId: "maria" }, "maria");
    expect(created).toMatchObject({ status: "AWAITING_ASSESSMENT", coachId: link.coachId, schoolId });
  });

  it("sem vínculo: UNASSIGNED e ninguém é notificado (AC03)", async () => {
    const db = makeDb();
    const created = await openPreparation(db as never, clock, { id: "p1", athleteId: "solo" }, "solo");
    expect(created).toMatchObject({ status: "UNASSIGNED", coachId: null, schoolId: null });
  });

  it("matriculado em escola sem professor: fila da escola", async () => {
    const db = makeDb({ schoolMembership: { schoolId: "alpha" } });
    expect(await openPreparation(db as never, clock, { id: "p1", athleteId: "pedro" }, "pedro")).toMatchObject({ status: "UNASSIGNED", schoolId: "alpha" });
  });

  it("idempotente", async () => {
    const db = makeDb({ preparation: { id: "prep" } });
    expect(await openPreparation(db as never, clock, { id: "p1", athleteId: "maria" }, "maria")).toEqual({ id: "prep" });
    expect(db.eventPreparation.create).not.toHaveBeenCalled();
  });
});

describe("acesso e revogação (AC21)", () => {
  it("responsável vê; sem vínculo recebe 404", async () => {
    const db = makeDb({ links: [ricardo], preparation: preparationRow() });
    await expect(new GetEventPreparation(db as never, clock).execute("ricardo", "prep")).resolves.toMatchObject({ role: "responsible" });
    await expect(new GetEventPreparation(db as never, clock).execute("stranger", "prep")).rejects.toMatchObject({ status: 404 });
  });

  it("vínculo encerrado: volta a UNASSIGNED com transição do sistema e o professor anterior recebe 404", async () => {
    const db = makeDb({ links: [], preparation: preparationRow() });
    db.eventPreparation.afterWrite = preparationRow({ coachId: null, coach: null, status: "UNASSIGNED", version: 2 });
    await expect(new GetEventPreparation(db as never, clock).execute("ricardo", "prep")).rejects.toMatchObject({ status: 404 });
    expect(db.eventPreparation.updateMany.mock.calls[0][0].data).toMatchObject({ coachId: null, status: "UNASSIGNED" });
    expect(db.eventPreparationTransition.create.mock.calls[0][0].data).toMatchObject({ actorUserId: null, reason: "vínculo com o professor encerrado", fromCoachId: "coach-ricardo" });
    // The athlete still reads it, now without a responsible.
    await expect(new GetEventPreparation(db as never, clock).execute("maria", "prep")).resolves.toMatchObject({ statusText: "Evento registrado — sem professor responsável" });
  });
});

describe("ChangeEventPreparation", () => {
  it("professor assume, define primeira revisão e o histórico registra", async () => {
    const db = makeDb({ links: [ricardo], preparation: preparationRow() });
    db.eventPreparation.afterWrite = preparationRow({ status: "PLANNING", version: 2 });
    const view = await new ChangeEventPreparation(db as never, clock).execute("ricardo", "prep", { action: "assume", expectedVersion: 1, firstReviewLocalDate: "2026-10-20", analysisNotes: "base aeróbia ok" });
    expect(view.status).toBe("PLANNING");
    expect(db.eventPreparation.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: "prep", version: 1 }, data: { status: "PLANNING", firstReviewLocalDate: "2026-10-20", coachId: "coach-ricardo" } });
    expect(db.eventPreparationTransition.create.mock.calls[0][0].data).toMatchObject({ fromStatus: "AWAITING_ASSESSMENT", toStatus: "PLANNING", actorUserId: "ricardo" });
  });

  it("aluno não assume; escola atribui só professor com vínculo na escola", async () => {
    const db = makeDb({ links: [carlosAlpha], preparation: preparationRow({ coachId: null, coach: null, status: "UNASSIGNED", schoolId: "alpha" }), managers: ["owner"] });
    await expect(new ChangeEventPreparation(db as never, clock).execute("maria", "prep", { action: "assume", expectedVersion: 1 })).rejects.toMatchObject({ status: 403 });
    db.eventPreparation.afterWrite = preparationRow({ status: "AWAITING_ASSESSMENT", coachId: "coach-carlos", coach: { id: "coach-carlos", userId: "carlos", displayName: "Carlos" }, schoolId: "alpha", version: 2 });
    await new ChangeEventPreparation(db as never, clock).execute("owner", "prep", { action: "assign", coachId: "coach-carlos", expectedVersion: 1 });
    expect(db.eventPreparation.updateMany.mock.calls[0][0].data).toMatchObject({ coachId: "coach-carlos", status: "AWAITING_ASSESSMENT" });
    db.live.links = [];
    await expect(new ChangeEventPreparation(db as never, clock).execute("owner", "prep", { action: "assign", coachId: "coach-x", expectedVersion: 2 }))
      .rejects.toMatchObject({ status: 404 });
  });

  it("pausar exige motivo; versão antiga dá conflito", async () => {
    const db = makeDb({ links: [ricardo], preparation: preparationRow({ status: "PLANNING" }) });
    await expect(new ChangeEventPreparation(db as never, clock).execute("ricardo", "prep", { action: "pause", expectedVersion: 1 })).rejects.toThrow();
    db.eventPreparation.updateMany.mockResolvedValue({ count: 0 });
    await expect(new ChangeEventPreparation(db as never, clock).execute("ricardo", "prep", { action: "pause", reason: "viagem", expectedVersion: 1 }))
      .rejects.toMatchObject({ code: "PREPARATION_CONFLICT" });
  });
});
