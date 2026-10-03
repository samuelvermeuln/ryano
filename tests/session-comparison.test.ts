/**
 * SAM-63 — transparent session and week comparison (§17.1, §17.2, §17.4, §17.6, AC11, AC12).
 */
import { describe, expect, it } from "vitest";

import { deriveExecutionState, REST_DAY_SPORT } from "@/modules/school/domain/execution-state";
import { weeklyRegularity } from "@/modules/school/domain/weekly-regularity";
import { sessionComparison, sessionRpeLoad, type SessionComparisonInput } from "@/modules/school/presentation/session-comparison";

const base: SessionComparisonInput = {
  state: "LINKED",
  prescribed: { sportType: "run", durationSeconds: 40 * 60, distanceMeters: 8000 },
  realized: { sportType: "run", durationSeconds: 44 * 60, distanceMeters: null, source: "GARMIN", method: "AUTO" },
  feedback: { completion: "FULL", rpe: 6, rpeScale: "CR10", difficulty: 3, painReported: false, comment: "ok" },
  coachNote: null,
  complianceScore: 82,
  loadMethod: null,
};

describe("comparativo da sessão", () => {
  it("40 min prescritos e 44 realizados = 110%, com fórmula e denominador; acima de 100% não é 'melhor'", () => {
    const comparison = sessionComparison(base);
    expect(comparison.time).toMatchObject({ status: "compared", percent: 110, aboveTarget: true });
    expect(comparison.time.status === "compared" && comparison.time.formula).toBe("100 × 44 min realizados (tempo decorrido) ÷ 40 min prescritos (tempo total, com descansos)");
  });

  it("sem distância medida: 'não medido', nunca 0% (AC11); outra modalidade não compara distância", () => {
    expect(sessionComparison(base).distance).toEqual({ status: "not-measured", label: "não medido" });
    const otherSport = sessionComparison({ ...base, realized: { ...base.realized!, sportType: "ride", distanceMeters: 20000 } });
    expect(otherSport.distance.status).toBe("other-sport");
    expect(otherSport.otherSport).toBe(true);
    expect(sessionComparison({ ...base, realized: null, state: "NO_RECORD" }).time.status).toBe("no-record");
    expect(sessionComparison({ ...base, prescribed: { ...base.prescribed, distanceMeters: null } }).distance.status).toBe("not-prescribed");
  });

  it("cinco perguntas separadas; compliance só como leitura secundária", () => {
    const comparison = sessionComparison(base);
    expect(comparison.presence).toBe("Sim — atividade associada");
    expect(comparison.execution.label).toContain("não é % concluído");
    expect(comparison.response).toMatchObject({ rpe: 6, difficulty: 3 });
    expect(comparison.goal).toContain("Sem relação registrada");
    expect(sessionComparison({ ...base, realized: { ...base.realized!, source: "manual", method: null } }).presence).toBe("Sim — registro manual do aluno");
  });

  it("sRPE só com o método escolhido: 40 min × RPE 6 = 240 UA; sem RPE é 'não medido'", () => {
    expect(sessionComparison(base).load).toBeNull();
    expect(sessionRpeLoad(40 * 60, 6, "SRPE")).toMatchObject({ status: "computed", value: 240, formula: "40 min × RPE 6 = 240 UA" });
    expect(sessionRpeLoad(40 * 60, null, "SRPE")).toEqual({ status: "not-measured", label: "não medido" });
    expect(sessionComparison({ ...base, loadMethod: "SRPE" }).load).toMatchObject({ status: "computed", value: 44 * 6 });
  });
});

describe("regularidade semanal (AC12)", () => {
  const now = new Date("2026-10-03T12:00:00Z");
  const past = new Date("2026-09-29T09:00:00Z");
  const state = (overrides: Partial<Parameters<typeof deriveExecutionState>[0]>) =>
    deriveExecutionState({ status: "SCHEDULED", scheduledAt: past, hasMatchedExecution: false, completion: null, now, ...overrides });

  it("1 integral, 1 parcial, 1 sem registro, 1 justificada e 1 cancelada: 4 no denominador, grupos separados", () => {
    const week = weeklyRegularity([
      state({ hasMatchedExecution: true }),
      state({ completion: "PARTIAL" }),
      state({}),
      state({ status: "JUSTIFIED" }),
      state({ status: "CANCELLED" }),
    ]);
    expect(week).toMatchObject({ full: 1, partial: 1, noRecord: 1, notDoneConfirmed: 1, justified: 1, denominator: 4, originalPlan: 5 });
    expect(week.outside.cancelled).toBe(1);
  });

  it("descanso prescrito e indisponibilidade registrada não entram no denominador nem viram falta", () => {
    const rest = state({ sportType: REST_DAY_SPORT });
    const unavailable = state({ unavailable: true });
    expect([rest, unavailable]).toEqual(["REST", "UNAVAILABLE"]);
    const week = weeklyRegularity([rest, unavailable, state({ hasMatchedExecution: true })]);
    expect(week).toMatchObject({ denominator: 1, noRecord: 0, outside: { rest: 1, unavailable: 1 } });
  });

  it("aguardando registro e futuras ficam fora até virarem fato", () => {
    const week = weeklyRegularity([
      state({ scheduledAt: new Date("2026-10-03T08:00:00Z") }),
      state({ scheduledAt: new Date("2026-10-04T08:00:00Z") }),
    ]);
    expect(week).toMatchObject({ denominator: 0, outside: { awaitingRecord: 1, future: 1 } });
  });
});
