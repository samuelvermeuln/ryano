/**
 * SAM-16 — agenda semanal: conversão parede↔UTC no fuso da escola, semana ISO,
 * agrupamento por (dia, HH:mm) e escopo de autorização do caso de uso.
 */
import { describe, expect, it, vi } from "vitest";
import { GetCoachWeeklyAgenda } from "@/modules/school/application/get-coach-weekly-agenda";
import { RescheduleWorkout } from "@/modules/school/application/reschedule-workout";
import { SchoolError } from "@/modules/school/domain/errors";
import {
  formatIsoWeek,
  isoWeekOf,
  isValidTimeZone,
  localDateTimeToUtc,
  mondayOfIsoWeek,
  utcToLocalDateTime,
} from "@/modules/school/domain/local-date";
import {
  buildWeeklyAgenda,
  DEFAULT_AGENDA_HOURS,
  describeAgendaSlot,
  type AgendaItem,
} from "@/modules/school/presentation/weekly-agenda";

const SP = "America/Sao_Paulo";

describe("localDateTimeToUtc / utcToLocalDateTime", () => {
  it("06:00 em São Paulo (UTC-3, sem horário de verão) vira 09:00Z — o bug corrigido", () => {
    expect(localDateTimeToUtc("2026-10-06T06:00", SP).toISOString()).toBe("2026-10-06T09:00:00.000Z");
    expect(localDateTimeToUtc("2026-10-06T22:30", SP).toISOString()).toBe("2026-10-07T01:30:00.000Z");
  });

  it("volta ao mesmo relógio de parede", () => {
    const instant = localDateTimeToUtc("2026-10-06T06:00", SP);
    expect(utcToLocalDateTime(instant, SP)).toEqual({ date: "2026-10-06", time: "06:00", minutesOfDay: 360 });
    // 01:30Z do dia 7 é ainda dia 6 às 22:30 em São Paulo.
    expect(utcToLocalDateTime(new Date("2026-10-07T01:30:00.000Z"), SP).date).toBe("2026-10-06");
  });

  it("aplica o offset do dia certo em zona com horário de verão (New York)", () => {
    // 2026-03-08 é o dia de "spring forward" em America/New_York (GMT-5 -> GMT-4).
    expect(localDateTimeToUtc("2026-03-07T06:00", "America/New_York").toISOString()).toBe("2026-03-07T11:00:00.000Z");
    expect(localDateTimeToUtc("2026-03-09T06:00", "America/New_York").toISOString()).toBe("2026-03-09T10:00:00.000Z");
    // 02:30 não existe nesse dia: resolve para depois do salto, sem lançar.
    const gap = localDateTimeToUtc("2026-03-08T02:30", "America/New_York");
    expect(utcToLocalDateTime(gap, "America/New_York").time).toBe("03:30");
  });

  it("rejeita formato inválido, data inexistente e hora fora do intervalo", () => {
    expect(() => localDateTimeToUtc("2026-10-06 06:00", SP)).toThrow(RangeError);
    expect(() => localDateTimeToUtc("2026-02-30T06:00", SP)).toThrow(RangeError);
    expect(() => localDateTimeToUtc("2026-10-06T24:00", SP)).toThrow(RangeError);
  });

  it("valida o nome da zona antes de usá-la", () => {
    expect(isValidTimeZone(SP)).toBe(true);
    expect(isValidTimeZone("Marte/Olympus")).toBe(false);
  });
});

describe("semana ISO (?semana=YYYY-Www)", () => {
  it("calcula a semana e volta à segunda-feira dela", () => {
    expect(isoWeekOf("2026-10-06")).toEqual({ year: 2026, week: 41 });
    expect(formatIsoWeek("2026-10-06")).toBe("2026-W41");
    expect(mondayOfIsoWeek("2026-W41")).toBe("2026-10-05");
  });

  it("trata a virada de ano: 1º de janeiro pode pertencer à última semana do ano anterior", () => {
    expect(formatIsoWeek("2027-01-01")).toBe("2026-W53");
    expect(mondayOfIsoWeek("2026-W53")).toBe("2026-12-28");
    expect(formatIsoWeek("2024-12-30")).toBe("2025-W01");
  });

  it("rejeita semana inexistente ou malformada", () => {
    expect(mondayOfIsoWeek("2025-W53")).toBeNull(); // 2025 tem 52 semanas
    expect(mondayOfIsoWeek("2026-W00")).toBeNull();
    expect(mondayOfIsoWeek("semana-41")).toBeNull();
  });
});

function item(overrides: Partial<Omit<AgendaItem, "scheduledAt">> & { assignmentId: string; scheduledAt: string }): AgendaItem {
  return {
    kind: "prescription",
    activityId: null,
    athlete: { id: `a-${overrides.assignmentId}`, name: `Atleta ${overrides.assignmentId}` },
    title: "Rodagem",
    sportType: "run",
    team: null,
    coach: { id: "coach", name: "Carlos" },
    status: "SCHEDULED",
    outcome: "PLANNED_NOT_EXECUTED",
    dueAt: null,
    durationSeconds: null,
    distanceMeters: null,
    canReschedule: true,
    ...overrides,
    scheduledAt: new Date(overrides.scheduledAt),
  };
}

describe("buildWeeklyAgenda — prescrito × executado e não planejadas (SAM-36)", () => {
  it("totaliza o período: só o que aconteceu conta como volume; o chip diz quando o slot é não planejado", () => {
    const week = buildWeeklyAgenda([
      item({ assignmentId: "1", scheduledAt: "2026-10-06T09:00:00.000Z" }), // planejado, não executado
      item({ assignmentId: "2", scheduledAt: "2026-10-07T09:00:00.000Z", status: "COMPLETED", outcome: "EXECUTED_AS_PLANNED", durationSeconds: 2700, distanceMeters: 21000 }),
      item({ assignmentId: "3", scheduledAt: "2026-10-07T12:00:00.000Z", kind: "unplanned-import", activityId: "act-1", status: "UNPLANNED", outcome: "UNPLANNED_ACTIVITY", durationSeconds: 1477, distanceMeters: 672, canReschedule: false, coach: null, athlete: { id: "a-2", name: "Atleta 2" } }),
      item({ assignmentId: "4", scheduledAt: "2026-10-08T22:00:00.000Z", kind: "unplanned-self", status: "UNPLANNED", outcome: "UNPLANNED_ACTIVITY", durationSeconds: 1800, canReschedule: false, coach: null }),
    ], "2026-10-05", SP);

    // Atletas distintos: a-1, a-2 (itens 2 e 3) e a-4.
    expect(week.totals).toEqual({
      items: 4, prescriptions: 2, executed: 1, notExecuted: 1, unplanned: 2, athletes: 3,
      durationSeconds: 2700 + 1477 + 1800, distanceMeters: 21000 + 672,
    });
    const swim = week.days[2].slots.find((slot) => slot.time === "09:00")!;
    expect(swim.kinds).toEqual(["unplanned-import"]);
    expect(describeAgendaSlot(swim, () => "Natação")).toEqual({ time: "09:00", who: "Atleta 2", detail: "Natação · não planejada" });
  });
});

describe("buildWeeklyAgenda — agrupamento por slot", () => {
  it("N atletas no mesmo horário local viram UM slot com contagem; horários diferentes ficam separados", () => {
    const week = buildWeeklyAgenda([
      item({ assignmentId: "1", scheduledAt: "2026-10-06T09:00:00.000Z", athlete: { id: "b", name: "Bruno" } }),
      item({ assignmentId: "2", scheduledAt: "2026-10-06T09:00:00.000Z", athlete: { id: "a", name: "Ana" }, team: { id: "t", name: "Manhã" } }),
      item({ assignmentId: "3", scheduledAt: "2026-10-06T09:00:00.000Z", athlete: { id: "c", name: "Caio" }, sportType: "swim" }),
      item({ assignmentId: "4", scheduledAt: "2026-10-06T10:30:00.000Z" }),
    ], "2026-10-05", SP);

    const tuesday = week.days[1];
    expect(tuesday.date).toBe("2026-10-06");
    expect(tuesday.slots.map((slot) => slot.time)).toEqual(["06:00", "07:30"]);
    const six = tuesday.slots[0];
    expect(six.entries).toHaveLength(3);
    expect(six.entries.map((entry) => entry.athlete.name)).toEqual(["Ana", "Bruno", "Caio"]);
    expect(six.teams).toEqual(["Manhã"]);
    expect(six.sportTypes).toEqual(["run", "swim"]);
    expect(six.hour).toBe(6);
    expect(week.hours).toEqual([6, 7]);
  });

  it("posiciona pelo relógio da escola: 01:30Z de quarta é terça 22:30 em São Paulo", () => {
    const week = buildWeeklyAgenda([
      item({ assignmentId: "1", scheduledAt: "2026-10-07T01:30:00.000Z" }),
    ], "2026-10-05", SP);
    expect(week.days[1].slots[0].time).toBe("22:30");
    expect(week.days[2].slots).toHaveLength(0);
  });

  it("descarta itens fora da semana e devolve as faixas padrão quando vazia", () => {
    const week = buildWeeklyAgenda([
      item({ assignmentId: "1", scheduledAt: "2026-10-13T09:00:00.000Z" }),
    ], "2026-10-05", SP);
    expect(week.days.every((day) => day.slots.length === 0)).toBe(true);
    expect(week.hours).toEqual(DEFAULT_AGENDA_HOURS);
  });

  it("descreve o chip: horário · N atletas · turma · modalidade", () => {
    const week = buildWeeklyAgenda([
      item({ assignmentId: "1", scheduledAt: "2026-10-06T09:00:00.000Z", team: { id: "t", name: "Manhã" } }),
      item({ assignmentId: "2", scheduledAt: "2026-10-06T09:00:00.000Z", team: { id: "t", name: "Manhã" } }),
      item({ assignmentId: "3", scheduledAt: "2026-10-08T09:00:00.000Z", athlete: { id: "z", name: "Zé" } }),
    ], "2026-10-05", SP);
    const label = (sport: string) => (sport === "run" ? "Corrida" : null);
    expect(describeAgendaSlot(week.days[1].slots[0], label)).toEqual({ time: "06:00", who: "2 atletas", detail: "Manhã · Corrida" });
    expect(describeAgendaSlot(week.days[3].slots[0], label)).toEqual({ time: "06:00", who: "Zé", detail: "Corrida" });
  });
});

/**
 * O caso de uso: professor comum vê só os atletas atribuídos a ele; OWNER/ADMIN
 * vê a escola inteira; professor sem vínculo com a escola não vê nada.
 */
function makeDb(options: { manages?: boolean; membership?: boolean } = {}) {
  const findManyAssignments = vi.fn().mockResolvedValue([
    {
      id: "as-1", athleteId: "ath-1", status: "SCHEDULED", scheduledAt: new Date("2026-10-06T09:00:00.000Z"), dueAt: null,
      sourceLabel: null, coachId: "coach", teamId: null,
      workout: { title: "Rodagem", sportType: "run" }, workoutTemplate: null,
      athlete: { name: "Ana", email: null }, team: null, coach: { displayName: "Carlos", user: { name: "C" } },
    },
    {
      id: "as-2", athleteId: "ath-2", status: "SCHEDULED", scheduledAt: new Date("2026-10-06T09:00:00.000Z"), dueAt: null,
      sourceLabel: null, coachId: "other", teamId: null,
      workout: { title: "Natação", sportType: "swim" }, workoutTemplate: null,
      athlete: { name: "Bruno", email: null }, team: null, coach: { displayName: "Marina", user: { name: "M" } },
    },
  ]);
  const readable = vi.fn().mockImplementation((args: { where: Record<string, unknown> }) => {
    const scoped = "athlete" in args.where;
    return Promise.resolve(scoped
      ? [{ athlete: { id: "ath-1", name: "Ana", email: null } }]
      : [{ athlete: { id: "ath-1", name: "Ana", email: null } }, { athlete: { id: "ath-2", name: "Bruno", email: null } }]);
  });
  const db = {
    school: { findUnique: vi.fn().mockResolvedValue({ id: "school", name: "Alpha", status: "ACTIVE", timezone: SP }) },
    coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach", status: "ACTIVE" }) },
    coachSchoolMembership: { findFirst: vi.fn().mockResolvedValue(options.membership === false ? null : { id: "m" }) },
    schoolMembership: {
      findFirst: vi.fn().mockResolvedValue(options.manages
        ? { id: "sm", schoolId: "school", userId: "user", status: "ACTIVE", endedAt: null }
        : null),
    },
    schoolMembershipRole: { findMany: vi.fn().mockResolvedValue(options.manages ? [{ membershipId: "sm", role: "ADMIN" }] : []) },
    schoolAthleteMembership: { findMany: readable },
    workoutAssignment: { findMany: findManyAssignments },
    team: { findMany: vi.fn().mockResolvedValue([{ id: "t", name: "Manhã" }]) },
    // SAM-36 — what happened: matched executions (any scope) and imported activities.
    workoutExecution: { findMany: vi.fn().mockResolvedValue([]) },
    activity: { findMany: vi.fn().mockResolvedValue([]) },
    coachAthleteAssignment: { findMany: vi.fn().mockResolvedValue([{ athlete: { id: "ath-1", name: "Ana", email: null } }]) },
    notificationPreference: { findUnique: vi.fn().mockResolvedValue({ timezone: "America/Fortaleza" }) },
  };
  return { db, findManyAssignments };
}

describe("GetCoachWeeklyAgenda — calendário prescrito × executado (SAM-36)", () => {
  it("independente: atletas do vínculo ACTIVE, escopo `{ schoolId: null, coachId }`, fuso do professor, sem turmas", async () => {
    const { db, findManyAssignments } = makeDb();
    const result = await new GetCoachWeeklyAgenda(db as never, () => new Date("2026-10-01T12:00:00.000Z"))
      .execute("user", { kind: "independent" }, { weekStart: "2026-10-05" });

    expect(result.scope).toEqual({ kind: "independent" });
    expect(result.schoolId).toBeNull();
    expect(result.timeZone).toBe("America/Fortaleza");
    expect(result.teams).toEqual([]);
    expect(db.school.findUnique).not.toHaveBeenCalled();
    expect(db.coachAthleteAssignment.findMany.mock.calls[0][0].where).toMatchObject({ coachId: "coach", schoolId: null, status: "ACTIVE", endedAt: null });
    expect(findManyAssignments.mock.calls[0][0].where).toMatchObject({ schoolId: null, coachId: "coach", athleteId: { in: ["ath-1"] } });
    // Fortaleza (UTC-3) at 00:00 Monday.
    expect(findManyAssignments.mock.calls[0][0].where.scheduledAt.gte).toEqual(new Date("2026-10-05T03:00:00.000Z"));
  });

  it("uma atividade importada sem execução vira item 'não planejada'; a casada dá o resultado à prescrição", async () => {
    const { db, findManyAssignments } = makeDb();
    findManyAssignments.mockResolvedValue([{
      id: "as-1", athleteId: "ath-1", status: "AVAILABLE", scheduledAt: new Date("2026-10-06T09:00:00.000Z"), dueAt: null,
      sourceLabel: null, coachId: "coach", teamId: null,
      workout: { title: "Bike 45", sportType: "bike" }, workoutTemplate: null,
      athlete: { name: "Ana", email: null }, team: null, coach: { displayName: "Carlos", user: { name: "C" } },
      executions: [{ sportType: "bike", durationSeconds: 2700, distanceMeters: 21000, activityId: "act-bike" }],
    }]);
    db.workoutExecution.findMany.mockResolvedValue([
      { id: "e1", athleteId: "ath-1", activityId: "act-bike", source: "GARMIN", externalId: "g-bike", sportType: "bike", startedAt: new Date("2026-10-06T09:10:00.000Z"), durationSeconds: 2700, distanceMeters: 21000, assignment: { id: "as-1", status: "AVAILABLE", workout: { title: "Bike 45" } } },
      { id: "e2", athleteId: "ath-1", activityId: null, source: "self-report", externalId: "x", sportType: "gym", startedAt: new Date("2026-10-07T22:00:00.000Z"), durationSeconds: 1800, distanceMeters: null, assignment: { id: "as-self", status: "UNPLANNED", workout: { title: "Atividade registrada" } } },
    ]);
    db.activity.findMany.mockResolvedValue([
      { id: "act-bike", userId: "ath-1", name: "Bike", provider: "GARMIN", externalId: "g-bike", sportType: "bike", startedAt: new Date("2026-10-06T09:10:00.000Z"), durationSeconds: 2700, movingSeconds: null, distanceMeters: 21000 },
      { id: "act-swim", userId: "ath-1", name: "Serra Natação", provider: "GARMIN", externalId: "g-swim", sportType: "open-water", startedAt: new Date("2026-10-06T13:00:00.000Z"), durationSeconds: 1477, movingSeconds: 1400, distanceMeters: 672 },
    ]);

    const result = await new GetCoachWeeklyAgenda(db as never).execute("user", "school", { weekStart: "2026-10-05" });

    expect(result.items.map((i) => [i.kind, i.assignmentId ?? i.activityId, i.outcome])).toEqual([
      ["prescription", "as-1", "EXECUTED_AS_PLANNED"],
      ["unplanned-import", "act-swim", "UNPLANNED_ACTIVITY"],
      ["unplanned-self", "as-self", "UNPLANNED_ACTIVITY"],
    ]);
    expect(result.items[1]).toMatchObject({ title: "Serra Natação", durationSeconds: 1400, distanceMeters: 672, canReschedule: false, athlete: { name: "Ana" } });
    expect(result.sportTypes).toEqual(["bike", "gym", "open-water"]);
  });

  it("filtro de tipo 'só prescrições' não consulta atividades; filtro de turma também não", async () => {
    const { db } = makeDb();
    await new GetCoachWeeklyAgenda(db as never).execute("user", "school", { weekStart: "2026-10-05", kinds: ["prescription"] });
    expect(db.activity.findMany).not.toHaveBeenCalled();
    expect(db.workoutExecution.findMany).not.toHaveBeenCalled();
    await new GetCoachWeeklyAgenda(db as never).execute("user", "school", { weekStart: "2026-10-05", teamId: "t" });
    expect(db.activity.findMany).not.toHaveBeenCalled();
  });

  it("várias semanas (visão mensal) leem uma janela só", async () => {
    const { db, findManyAssignments } = makeDb();
    const result = await new GetCoachWeeklyAgenda(db as never).execute("user", "school", { weekStart: "2026-09-28", weeks: 5 });
    expect(result.weekEnd).toBe("2026-11-02");
    expect(findManyAssignments.mock.calls[0][0].where.scheduledAt).toEqual({
      gte: new Date("2026-09-28T03:00:00.000Z"), lt: new Date("2026-11-02T03:00:00.000Z"),
    });
  });
});

describe("GetCoachWeeklyAgenda — escopo", () => {
  it("professor comum consulta só os atletas atribuídos a ele e só pode remarcar os seus", async () => {
    const { db, findManyAssignments } = makeDb();
    const result = await new GetCoachWeeklyAgenda(db as never, () => new Date("2026-10-01T12:00:00.000Z"))
      .execute("user", "school", { weekStart: "2026-10-05" });

    expect(result.seesWholeSchool).toBe(false);
    expect(result.athletes.map((a) => a.id)).toEqual(["ath-1"]);
    const where = findManyAssignments.mock.calls[0][0].where;
    expect(where.athleteId).toEqual({ in: ["ath-1"] });
    // Janela = segunda 00:00 a domingo 24:00 no fuso da escola, em UTC.
    expect(where.scheduledAt).toEqual({
      gte: new Date("2026-10-05T03:00:00.000Z"), lt: new Date("2026-10-12T03:00:00.000Z"),
    });
    expect(result.items.map((i) => i.canReschedule)).toEqual([true, false]);
    expect(result.timeZone).toBe(SP);
  });

  it("OWNER/ADMIN vê a escola inteira", async () => {
    const { db, findManyAssignments } = makeDb({ manages: true });
    const result = await new GetCoachWeeklyAgenda(db as never).execute("user", "school", { weekStart: "2026-10-05" });
    expect(result.seesWholeSchool).toBe(true);
    expect(findManyAssignments.mock.calls[0][0].where.athleteId).toEqual({ in: ["ath-1", "ath-2"] });
  });

  it("filtro por atleta fora do escopo não amplia o conjunto", async () => {
    const { db, findManyAssignments } = makeDb();
    await new GetCoachWeeklyAgenda(db as never).execute("user", "school", { weekStart: "2026-10-05", athleteId: "ath-2" });
    expect(findManyAssignments.mock.calls[0][0].where.athleteId).toEqual({ in: [] });
  });

  it("professor sem vínculo com a escola é recusado (escola B não aparece)", async () => {
    const { db, findManyAssignments } = makeDb({ membership: false });
    await expect(new GetCoachWeeklyAgenda(db as never).execute("user", "school", { weekStart: "2026-10-05" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(findManyAssignments).not.toHaveBeenCalled();
  });

  it("semana inválida é rejeitada antes de qualquer consulta", async () => {
    const { db } = makeDb();
    await expect(new GetCoachWeeklyAgenda(db as never).execute("user", "school", { weekStart: "2026-13-01" }))
      .rejects.toBeInstanceOf(Error);
    expect(db.school.findUnique).not.toHaveBeenCalled();
  });
});

describe("RescheduleWorkout — horário de parede no fuso da escola", () => {
  function makeTx(assignment: Record<string, unknown>) {
    const update = vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...assignment, ...data }));
    const create = vi.fn().mockResolvedValue({});
    const tx = {
      workoutAssignment: { findUnique: vi.fn().mockResolvedValue(assignment), update },
      workoutAssignmentHistory: { create },
      coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach" }) },
      school: { findUnique: vi.fn().mockResolvedValue({ timezone: SP }) },
      // SAM-36 — outside a school the wall clock is the athlete's own zone.
      notificationPreference: { findUnique: vi.fn().mockResolvedValue({ timezone: "America/Manaus" }) },
    };
    const db = { $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(tx) };
    return { db, update, create, tx };
  }

  it("SAM-36 — prescrição sem escola lê o relógio de parede no fuso do atleta, não num fixo", async () => {
    const { db, update, tx } = makeTx({
      id: "as-1", coachId: "coach", schoolId: null, athleteId: "ath-1", status: "SCHEDULED",
      scheduledAt: new Date("2026-10-06T09:00:00.000Z"), dueAt: null,
    });
    await new RescheduleWorkout(db as never).execute("user", { assignmentId: "as-1", scheduledAtLocal: "2026-10-06T07:00" });
    // Manaus é UTC-4: 07:00 local = 11:00Z (em São Paulo seria 10:00Z).
    expect(update.mock.calls[0][0].data.scheduledAt).toEqual(new Date("2026-10-06T11:00:00.000Z"));
    expect(tx.notificationPreference.findUnique).toHaveBeenCalledWith({ where: { userId: "ath-1" }, select: { timezone: true } });
    expect(tx.school.findUnique).not.toHaveBeenCalled();
  });

  it("grava o instante UTC de '07:00' em São Paulo e registra o histórico", async () => {
    const { db, update, create } = makeTx({
      id: "as-1", coachId: "coach", schoolId: "school", status: "SCHEDULED",
      scheduledAt: new Date("2026-10-06T09:00:00.000Z"), dueAt: null,
    });
    const result = await new RescheduleWorkout(db as never, () => new Date("2026-10-01T00:00:00.000Z"))
      .execute("user", { assignmentId: "as-1", scheduledAtLocal: "2026-10-06T07:00", reason: "chuva" });

    expect(update.mock.calls[0][0].data.scheduledAt).toEqual(new Date("2026-10-06T10:00:00.000Z"));
    expect(result.status).toBe("RESCHEDULED");
    expect(create.mock.calls[0][0].data.payload).toMatchObject({
      previousScheduledAt: "2026-10-06T09:00:00.000Z", newScheduledAt: "2026-10-06T10:00:00.000Z", reason: "chuva",
    });
  });

  it("um treino já remarcado pode ser remarcado de novo", async () => {
    const { db } = makeTx({
      id: "as-1", coachId: "coach", schoolId: "school", status: "RESCHEDULED",
      scheduledAt: new Date("2026-10-06T09:00:00.000Z"), dueAt: null,
    });
    await expect(new RescheduleWorkout(db as never).execute("user", { assignmentId: "as-1", scheduledAtLocal: "2026-10-07T07:00" }))
      .resolves.toMatchObject({ status: "RESCHEDULED" });
  });

  it("exige exatamente uma forma de data (instante OU parede)", async () => {
    const { db } = makeTx({ id: "as-1", coachId: "coach", status: "SCHEDULED" });
    await expect(new RescheduleWorkout(db as never).execute("user", { assignmentId: "as-1" })).rejects.toBeInstanceOf(Error);
    await expect(new RescheduleWorkout(db as never).execute("user", {
      assignmentId: "as-1", scheduledAt: "2026-10-06T10:00:00.000Z", scheduledAtLocal: "2026-10-06T07:00",
    })).rejects.toBeInstanceOf(Error);
  });

  it("outro professor não remarca", async () => {
    const { db } = makeTx({ id: "as-1", coachId: "other", schoolId: "school", status: "SCHEDULED" });
    await expect(new RescheduleWorkout(db as never).execute("user", { assignmentId: "as-1", scheduledAtLocal: "2026-10-06T07:00" }))
      .rejects.toBeInstanceOf(SchoolError);
  });
});
