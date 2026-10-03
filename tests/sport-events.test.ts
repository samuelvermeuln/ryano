/**
 * SAM-51 — event, option and participation (§5.1–5.3, §5.5, §21.5).
 */
import { describe, expect, it, vi } from "vitest";

import {
  daysUntilEvent,
  diffFields,
  eventDuplicateKey,
  isPastEvent,
  sportEventInputSchema,
  sportEventOptionInputSchema,
} from "@/modules/school/domain/sport-event";
import {
  CreateEventParticipation,
  ListAthleteParticipations,
  resolveEventActor,
  UpdateEventParticipation,
} from "@/modules/school/application/sport-events";

const NOW = new Date("2026-10-03T12:00:00.000Z");
const clock = () => NOW;

const travessia = {
  name: "Travessia da Baía", type: "ORGANIZED_CROSSING", sportType: "open-water", environment: "SEA",
  startLocalDate: "2026-12-20", timeZone: "America/Sao_Paulo", city: "Niterói",
};

describe("domínio do evento", () => {
  it("dia inteiro fica como data local; horário só com data confirmada", () => {
    const event = sportEventInputSchema.parse(travessia);
    expect(event.startLocalDate).toBe("2026-12-20");
    expect(event.startTimeLocal).toBeNull();
    expect(event.visibility).toBe("PRIVATE");
    expect(() => sportEventInputSchema.parse({ ...travessia, dateConfirmed: false, startTimeLocal: "07:00" })).toThrow(/data confirmada/);
    expect(() => sportEventInputSchema.parse({ ...travessia, timeZone: "Mars/Olympus" })).toThrow(/Fuso/);
    expect(() => sportEventInputSchema.parse({ ...travessia, endLocalDate: "2026-12-19" })).toThrow(/antes do início/);
  });

  it("opção exige valor e unidade juntos; unidades não são convertidas", () => {
    expect(sportEventOptionInputSchema.parse({ label: "2 km", distanceValue: 2, distanceUnit: "km" }).distanceUnit).toBe("km");
    expect(() => sportEventOptionInputSchema.parse({ label: "2 km", distanceValue: 2 })).toThrow(/valor e unidade/);
  });

  it("dias até a prova no fuso do evento; sem data confirmada não há contagem exata; passado é negativo", () => {
    expect(daysUntilEvent({ startLocalDate: "2026-12-20", dateConfirmed: true, timeZone: "America/Sao_Paulo" }, NOW)).toBe(78);
    expect(daysUntilEvent({ startLocalDate: "2026-12-20", dateConfirmed: false, timeZone: "America/Sao_Paulo" }, NOW)).toBeNull();
    expect(daysUntilEvent({ startLocalDate: "2026-09-01", dateConfirmed: true, timeZone: "America/Sao_Paulo" }, NOW)).toBeLessThan(0);
    expect(isPastEvent({ startLocalDate: "2026-09-01", endLocalDate: null, timeZone: "America/Sao_Paulo" }, NOW)).toBe(true);
  });

  it("chave de duplicado ignora acento, caixa e espaços", () => {
    expect(eventDuplicateKey({ name: "Travessia  da Baía", startLocalDate: "2026-12-20", city: "Niterói" }))
      .toBe(eventDuplicateKey({ name: "travessia da baia", startLocalDate: "2026-12-20", city: "NITEROI" }));
  });

  it("diff só registra o que mudou", () => {
    expect(diffFields({ goalText: "concluir", status: "PLANNED" }, { goalText: "sub 50", status: "PLANNED" }))
      .toEqual({ goalText: { from: "concluir", to: "sub 50" } });
  });
});

function makeDb(overrides: Record<string, unknown> = {}) {
  const db = {
    coachAthleteAssignment: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    schoolAthleteMembership: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    school: { findUnique: vi.fn().mockResolvedValue(null) },
    schoolMembership: { findFirst: vi.fn().mockResolvedValue(null) },
    schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([]) },
    sportEvent: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({ id: "evt" }),
      create: vi.fn().mockResolvedValue({}),
    },
    sportEventOption: { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({}), findFirst: vi.fn().mockResolvedValue({ id: "opt" }) },
    athleteEventParticipation: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ ...data })),
      findUnique: vi.fn(),
      // SAM-55 — no earlier registration of the same event/option (retry is idempotent).
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    eventPreparation: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: data.id, status: data.status })),
    },
    $transaction: vi.fn(),
    ...overrides,
  };
  return db;
}

describe("autorização (§20, AC03, AC21)", () => {
  it("atleta age sobre si; professor sem vínculo ativo recebe 404", async () => {
    const db = makeDb();
    await expect(resolveEventActor(db as never, clock, "athlete", "athlete")).resolves.toEqual({ kind: "athlete" });
    await expect(resolveEventActor(db as never, clock, "stranger", "athlete")).rejects.toMatchObject({ code: "ATHLETE_NOT_FOUND", status: 404 });
  });

  it("professor independente com vínculo ativo age como coach", async () => {
    const db = makeDb({
      coachAthleteAssignment: {
        findMany: vi.fn().mockResolvedValue([{ schoolId: null }]),
        findFirst: vi.fn().mockResolvedValue({ id: "assignment" }),
      },
    });
    await expect(resolveEventActor(db as never, clock, "coach-user", "athlete")).resolves.toEqual({ kind: "coach", schoolId: null });
  });
});

describe("CreateEventParticipation", () => {
  it("atleta cria evento pessoal privado, a opção e a participação (AC01)", async () => {
    const db = makeDb();
    const created = await new CreateEventParticipation(db as never, clock).execute("athlete", {
      event: travessia,
      option: { label: "2 km", distanceValue: 2, distanceUnit: "km" },
      participation: { goalText: "concluir com controle e boa orientação", suggestedPriority: "MAIN" },
    });
    const event = db.sportEvent.create.mock.calls[0][0].data;
    expect(event).toMatchObject({ origin: "ATHLETE", visibility: "PRIVATE", startLocalDate: "2026-12-20", startTimeStatus: "TO_BE_CONFIRMED", startAt: null, createdByUserId: "athlete" });
    expect(created).toMatchObject({ athleteId: "athlete", suggestedPriority: "MAIN", status: "PLANNED", createdByUserId: "athlete" });
  });

  it("evento igual já visível: 409 com candidatos; confirmando que é outro, cria", async () => {
    const db = makeDb();
    db.sportEvent.findMany.mockResolvedValue([{ id: "evt-1", name: "Travessia da Baia", edition: null, startLocalDate: "2026-12-20", city: "niteroi" }]);
    await expect(new CreateEventParticipation(db as never, clock).execute("athlete", { event: travessia }))
      .rejects.toMatchObject({ code: "EVENT_DUPLICATE_SUSPECTED", status: 409 });
    expect(db.sportEvent.create).not.toHaveBeenCalled();
    await new CreateEventParticipation(db as never, clock).execute("athlete", { event: travessia, confirmDistinct: true });
    expect(db.sportEvent.create).toHaveBeenCalledOnce();
  });

  it("reenvio do mesmo cadastro devolve a mesma participação (SAM-55, AC02)", async () => {
    const db = makeDb();
    db.athleteEventParticipation.findFirst.mockResolvedValue({ id: "p-existing", athleteId: "athlete", eventId: "evt" });
    db.eventPreparation.findUnique.mockResolvedValue({ id: "prep", status: "UNASSIGNED", coachId: null, schoolId: null });
    const again = await new CreateEventParticipation(db as never, clock).execute("athlete", { eventId: "evt", optionId: "opt" });
    expect(again).toMatchObject({ id: "p-existing", preparation: { id: "prep" } });
    expect(db.athleteEventParticipation.create).not.toHaveBeenCalled();
  });

  it("segundo atleta reaproveita o evento existente (não duplica)", async () => {
    const db = makeDb();
    await new CreateEventParticipation(db as never, clock).execute("athlete", { eventId: "evt", optionId: "opt", participation: { goalText: "sub 50 min" } });
    expect(db.sportEvent.create).not.toHaveBeenCalled();
    expect(db.athleteEventParticipation.create.mock.calls[0][0].data).toMatchObject({ eventId: "evt", optionId: "opt" });
  });

  it("atleta não publica evento para a escola", async () => {
    const db = makeDb();
    await expect(new CreateEventParticipation(db as never, clock).execute("athlete", { event: { ...travessia, visibility: "SCHOOL" } }))
      .rejects.toMatchObject({ status: 403 });
  });
});

describe("UpdateEventParticipation", () => {
  const current = { id: "p1", athleteId: "athlete", eventId: "evt", optionId: "opt", goalText: "concluir", status: "PLANNED", agreedPriority: null, needsReviewSince: null, version: 3 };

  it("mudança de distância grava revisão com antes/depois e marca revisão pendente (AC04)", async () => {
    const tx = {
      athleteEventParticipation: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "p1" }),
      },
      participationRevision: { create: vi.fn().mockResolvedValue({}) },
      // No preparation yet: the EVENT_CHANGED trigger has nobody to tell.
      eventPreparation: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const db = makeDb({ $transaction: vi.fn().mockImplementation((fn: (client: unknown) => unknown) => fn(tx)) });
    db.athleteEventParticipation.findUnique.mockResolvedValue(current);
    db.sportEventOption.findFirst.mockResolvedValue({ id: "opt-5k" });

    await new UpdateEventParticipation(db as never, clock).execute("athlete", "p1", { optionId: "opt-5k", expectedVersion: 3 });

    const data = tx.athleteEventParticipation.updateMany.mock.calls[0][0];
    expect(data.where).toEqual({ id: "p1", version: 3 });
    expect(data.data.needsReviewSince).toEqual(NOW);
    expect(tx.participationRevision.create.mock.calls[0][0].data.changes).toEqual({ optionId: { from: "opt", to: "opt-5k" } });
  });

  it("versão desatualizada: conflito recuperável, nada sobrescrito (§21.5)", async () => {
    const tx = {
      athleteEventParticipation: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), findUniqueOrThrow: vi.fn() },
      participationRevision: { create: vi.fn() },
    };
    const db = makeDb({ $transaction: vi.fn().mockImplementation((fn: (client: unknown) => unknown) => fn(tx)) });
    db.athleteEventParticipation.findUnique.mockResolvedValue(current);
    await expect(new UpdateEventParticipation(db as never, clock).execute("athlete", "p1", { goalText: "x", expectedVersion: 2 }))
      .rejects.toMatchObject({ code: "PARTICIPATION_CONFLICT", status: 409 });
    expect(tx.participationRevision.create).not.toHaveBeenCalled();
  });

  it("atleta não define a prioridade pactuada", async () => {
    const db = makeDb();
    db.athleteEventParticipation.findUnique.mockResolvedValue(current);
    await expect(new UpdateEventParticipation(db as never, clock).execute("athlete", "p1", { agreedPriority: "SECONDARY", expectedVersion: 3 }))
      .rejects.toMatchObject({ status: 403 });
  });
});

describe("ListAthleteParticipations", () => {
  it("mostra contagem no fuso, evento passado e conflito entre duas principais sem cancelar nada", async () => {
    const event = (id: string, date: string) => ({
      id, name: `Prova ${id}`, edition: null, type: "COMPETITION", sportType: "run", environment: null,
      startLocalDate: date, endLocalDate: null, dateConfirmed: true, startAt: null, startTimeStatus: "TO_BE_CONFIRMED",
      timeZone: "America/Sao_Paulo", city: null, venue: null, status: "PLANNED", origin: "ATHLETE", visibility: "PRIVATE", version: 1,
    });
    const row = (id: string, date: string, priority: string) => ({
      id, status: "PLANNED", suggestedPriority: priority, agreedPriority: null, goalText: null, needsReviewSince: null, version: 1,
      event: event(`e-${id}`, date), option: null,
    });
    const db = makeDb();
    db.athleteEventParticipation.findMany.mockResolvedValue([
      row("a", "2026-11-15", "MAIN"), row("b", "2026-11-29", "MAIN"), row("c", "2026-08-01", "MAIN"),
    ]);
    const { participations } = await new ListAthleteParticipations(db as never, clock).execute("athlete", "athlete");
    expect(participations[0]!.daysUntil).toBe(43);
    expect(participations[0]!.otherMainEvents.map((other) => other.participationId)).toEqual(["b"]);
    expect(participations[2]!.past).toBe(true);
    expect(participations[2]!.otherMainEvents).toEqual([]);
  });
});
