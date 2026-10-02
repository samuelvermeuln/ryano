/**
 * SAM-33 — prescrito × executado derivado dos fatos gravados.
 */
import { describe, expect, it } from "vitest";
import { derivePrescriptionOutcome, PrescriptionOutcome } from "@/modules/school/domain/prescription-outcome";
import { PRESCRIPTION_OUTCOME_LABELS } from "@/modules/school/presentation/workout-labels";

describe("derivePrescriptionOutcome", () => {
  it("prescrição sem execução casada é 'planejado, não executado' em todo estado aberto ou perdido", () => {
    for (const status of ["SCHEDULED", "AVAILABLE", "MISSED", "JUSTIFIED"]) {
      expect(derivePrescriptionOutcome({ assignmentStatus: status, workoutSportType: "bike", matchedExecution: null }))
        .toBe(PrescriptionOutcome.PLANNED_NOT_EXECUTED);
    }
  });

  it("prescrição cancelada ou remarcada não tem resultado a cobrar", () => {
    expect(derivePrescriptionOutcome({ assignmentStatus: "CANCELLED", workoutSportType: "bike", matchedExecution: null })).toBeNull();
    expect(derivePrescriptionOutcome({ assignmentStatus: "RESCHEDULED", workoutSportType: "bike", matchedExecution: { sportType: "bike" } })).toBeNull();
  });

  it("natação executada no dia da bike prescrita é 'diferente do planejado', nunca 'conforme'", () => {
    expect(derivePrescriptionOutcome({ assignmentStatus: "COMPLETED", workoutSportType: "bike", matchedExecution: { sportType: "swim" } }))
      .toBe(PrescriptionOutcome.EXECUTED_DIFFERENTLY);
  });

  it("mesma modalidade: concluído é 'conforme', parcial é 'parcialmente'", () => {
    expect(derivePrescriptionOutcome({ assignmentStatus: "COMPLETED", workoutSportType: "run", matchedExecution: { sportType: "run" } }))
      .toBe(PrescriptionOutcome.EXECUTED_AS_PLANNED);
    expect(derivePrescriptionOutcome({ assignmentStatus: "PARTIALLY_COMPLETED", workoutSportType: "run", matchedExecution: { sportType: "RUN" } }))
      .toBe(PrescriptionOutcome.EXECUTED_PARTIALLY);
    // Execução casada mas o status ainda não fechou (AVAILABLE): conta como conforme.
    expect(derivePrescriptionOutcome({ assignmentStatus: "AVAILABLE", workoutSportType: "run", matchedExecution: { sportType: "run" } }))
      .toBe(PrescriptionOutcome.EXECUTED_AS_PLANNED);
  });

  it("assignment UNPLANNED é atividade não planejada", () => {
    expect(derivePrescriptionOutcome({ assignmentStatus: "UNPLANNED", workoutSportType: "gym", matchedExecution: { sportType: "gym" } }))
      .toBe(PrescriptionOutcome.UNPLANNED_ACTIVITY);
  });

  it("todo resultado tem rótulo", () => {
    for (const outcome of Object.values(PrescriptionOutcome)) {
      expect(PRESCRIPTION_OUTCOME_LABELS[outcome]).toBeTruthy();
    }
  });
});
