/**
 * SAM-33 — prescrito × executado, derivado dos fatos já gravados.
 *
 * Uma prescrição (`WorkoutAssignment`) e uma execução (`WorkoutExecution`)
 * são registros distintos; o resultado abaixo é a leitura que o atleta, o
 * professor e a escola fazem dos dois juntos. Nenhuma coluna nova: tudo sai de
 * `WorkoutAssignment.status`, da execução casada (quando existe) e da
 * modalidade do treino × modalidade do que foi feito.
 *
 * Puro: sem I/O, sem Prisma.
 */
import { WorkoutAssignmentStatus } from "./enums";

export const PrescriptionOutcome = {
  /** Havia prescrição e nenhuma execução casada (agendado, disponível, não realizado ou justificado). */
  PLANNED_NOT_EXECUTED: "PLANNED_NOT_EXECUTED",
  /** Execução casada, mesma modalidade, concluída. */
  EXECUTED_AS_PLANNED: "EXECUTED_AS_PLANNED",
  /** Execução casada, mesma modalidade, concluída só em parte. */
  EXECUTED_PARTIALLY: "EXECUTED_PARTIALLY",
  /** Execução casada numa modalidade diferente da prescrita. */
  EXECUTED_DIFFERENTLY: "EXECUTED_DIFFERENTLY",
  /** Atividade (importada ou registrada pelo atleta) sem prescrição por trás. */
  UNPLANNED_ACTIVITY: "UNPLANNED_ACTIVITY",
} as const;
export type PrescriptionOutcome = (typeof PrescriptionOutcome)[keyof typeof PrescriptionOutcome];

/** A prescrição deixou de valer (cancelada/remarcada): não há "não executado" a cobrar. */
const WITHDRAWN_STATUSES: ReadonlySet<string> = new Set([
  WorkoutAssignmentStatus.CANCELLED,
  WorkoutAssignmentStatus.RESCHEDULED,
]);

export type PrescriptionOutcomeInput = {
  assignmentStatus: string;
  /** Modalidade canônica do treino prescrito; `null` quando a prescrição não tem treino. */
  workoutSportType: string | null;
  /** A execução que realmente pertence à prescrição (AUTO_MATCHED/CONFIRMED/OVERRIDDEN), ou `null`. */
  matchedExecution: { sportType: string } | null;
};

function sameSport(left: string | null, right: string): boolean {
  return left !== null && left.trim().toLowerCase() === right.trim().toLowerCase();
}

/**
 * Deriva o resultado de uma prescrição. `null` quando a prescrição foi
 * retirada (cancelada ou remarcada) — nesse caso não há o que comparar.
 */
export function derivePrescriptionOutcome(input: PrescriptionOutcomeInput): PrescriptionOutcome | null {
  if (input.assignmentStatus === WorkoutAssignmentStatus.UNPLANNED) {
    return PrescriptionOutcome.UNPLANNED_ACTIVITY;
  }
  if (WITHDRAWN_STATUSES.has(input.assignmentStatus)) {
    return null;
  }
  if (!input.matchedExecution) {
    return PrescriptionOutcome.PLANNED_NOT_EXECUTED;
  }
  if (!sameSport(input.workoutSportType, input.matchedExecution.sportType)) {
    return PrescriptionOutcome.EXECUTED_DIFFERENTLY;
  }
  if (input.assignmentStatus === WorkoutAssignmentStatus.PARTIALLY_COMPLETED) {
    return PrescriptionOutcome.EXECUTED_PARTIALLY;
  }
  return PrescriptionOutcome.EXECUTED_AS_PLANNED;
}
