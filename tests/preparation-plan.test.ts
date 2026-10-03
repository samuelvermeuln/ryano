/**
 * SAM-71 — phases and verifiable milestones of a preparation (§8, §22.4).
 */
import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import { recordMilestoneEvidence } from "@/modules/school/application/milestone-evidence";
import { SetMilestoneStatus } from "@/modules/school/application/preparation-plan";
import {
  goalAsOf, ILLUSTRATIVE_SCHEDULE_TEXT, milestoneInputSchema, phaseInputSchema, sessionTotalsAcrossEvents, shiftLocalDate, statusAfterEvidence,
} from "@/modules/school/domain/preparation-plan";

describe("fases definidas pelo professor (§8.1)", () => {
  it("aceita preparação sem fase de base e com fases sobrepostas; nenhuma proporção é verificada", () => {
    const desenvolvimento = phaseInputSchema.parse({ type: "DEVELOPMENT", startLocalDate: "2026-10-05", endLocalDate: "2026-10-25" });
    const especifico = phaseInputSchema.parse({ type: "SPECIFIC", startLocalDate: "2026-10-20", endLocalDate: "2026-11-08", protocolNotes: "redução conforme o atleta responder" });
    expect([desenvolvimento.type, especifico.type]).toEqual(["DEVELOPMENT", "SPECIFIC"]);
    expect(especifico.startLocalDate < desenvolvimento.endLocalDate).toBe(true);
  });

  it("fase personalizada precisa de nome; fim antes do início é recusado", () => {
    expect(phaseInputSchema.safeParse({ type: "CUSTOM", startLocalDate: "2026-10-05", endLocalDate: "2026-10-06" }).success).toBe(false);
    expect(phaseInputSchema.safeParse({ type: "CUSTOM", customName: "Polimento técnico", startLocalDate: "2026-10-05", endLocalDate: "2026-10-06" }).success).toBe(true);
    expect(phaseInputSchema.safeParse({ type: "BASE", startLocalDate: "2026-10-06", endLocalDate: "2026-10-05" }).success).toBe(false);
  });

  it("o cronograma ilustrativo é só texto para copiar e avisa que não é suficiente para qualquer prova", () => {
    expect(ILLUSTRATIVE_SCHEDULE_TEXT).toContain("não indica que 12 semanas bastem");
  });
});

describe("marcos verificáveis (§8.3)", () => {
  it("marco exige dizer o que será observado", () => {
    expect(milestoneInputSchema.safeParse({ title: "Simulado", criterion: "", dueLocalDate: "2026-11-12", evidenceType: "MANUAL" }).success).toBe(false);
  });

  it("evidência leva de planejado/em andamento a 'evidência recebida' e nunca decide o marco", () => {
    expect(statusAfterEvidence("PLANNED")).toBe("EVIDENCE_RECEIVED");
    expect(statusAfterEvidence("IN_PROGRESS")).toBe("EVIDENCE_RECEIVED");
    expect(statusAfterEvidence("IN_REVIEW")).toBe("IN_REVIEW");
    expect(statusAfterEvidence("ACHIEVED")).toBe("ACHIEVED");
  });

  it("'atingido' e 'evidência recebida' não podem ser marcados à mão (só a decisão do professor)", async () => {
    const db = { preparationMilestone: { findUnique: vi.fn() } };
    for (const status of ["ACHIEVED", "EVIDENCE_RECEIVED", "PARTIALLY_ACHIEVED"]) {
      await expect(new SetMilestoneStatus(db as never).execute("coach-user", "m1", status)).rejects.toBeInstanceOf(ZodError);
    }
    expect(db.preparationMilestone.findUnique).not.toHaveBeenCalled();
  });

  it("execução ligada move o marco para 'evidência recebida' e avisa o professor responsável uma vez", async () => {
    const now = new Date("2026-11-10T12:00:00Z");
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      workoutAssignmentEventLink: {
        findMany: vi.fn().mockResolvedValue([
          { milestone: { id: "m1", title: "Simulado até 12/11", status: "PLANNED", preparation: { coachId: "coach", schoolId: null, coach: { userId: "coach-user" }, participation: { id: "p1", athleteId: "a1" } } } },
          { milestone: { id: "m2", title: "Já decidido", status: "ACHIEVED", preparation: { coachId: "coach", schoolId: null, coach: { userId: "coach-user" }, participation: { id: "p1", athleteId: "a1" } } } },
        ]),
      },
      preparationMilestone: { updateMany },
      followUpPolicy: { findUnique: vi.fn().mockResolvedValue(null) },
      userNotification: { createMany },
    };
    await recordMilestoneEvidence(tx as never, "as1", now);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "m1", status: "PLANNED" }, data: expect.objectContaining({ status: "EVIDENCE_RECEIVED", evidenceAt: now }) }));
    expect(createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ userId: "coach-user", kind: "MILESTONE_EVIDENCE_RECEIVED", dedupeKey: "milestone-evidence:m1", href: "/professor/independente/atletas/a1/eventos/p1" })],
      skipDuplicates: true,
    }));
  });
});

describe("vários eventos e troca de prova-alvo (§8.4)", () => {
  it("sessão ligada a dois eventos conta para cada evento e uma vez no total do aluno; dois principais = conflito visível", () => {
    const totals = sessionTotalsAcrossEvents([
      { assignmentId: "s1", participationId: "maratona", durationSeconds: 3600, mainEvent: true },
      { assignmentId: "s1", participationId: "meia", durationSeconds: 3600, mainEvent: false },
      { assignmentId: "s2", participationId: "maratona", durationSeconds: 1800, mainEvent: true },
      { assignmentId: "s3", participationId: "maratona", durationSeconds: 1200, mainEvent: true },
      { assignmentId: "s3", participationId: "triathlon", durationSeconds: 1200, mainEvent: true },
    ]);
    expect(totals.perEvent.maratona).toEqual({ sessions: 3, seconds: 6600 });
    expect(totals.perEvent.meia).toEqual({ sessions: 1, seconds: 3600 });
    expect(totals.athlete).toEqual({ sessions: 3, seconds: 6600 });
    expect(totals.sharedSessions).toEqual(["s1", "s3"]);
    expect(totals.mainEventConflicts).toEqual(["s3"]);
  });

  it("o objetivo continua consultável como era na data antiga depois de trocar a prova-alvo", () => {
    const current = { id: "g1", participationId: "meia", description: "Completar a meia abaixo de 2h", dueLocalDate: "2027-03-01" };
    const revisions = [
      { changedAt: new Date("2026-09-01T10:00:00Z"), changes: { description: { from: "Completar a maratona", to: "Completar a maratona abaixo de 4h30" } } },
      { changedAt: new Date("2026-10-01T10:00:00Z"), changes: { participationId: { from: "maratona", to: "meia" }, description: { from: "Completar a maratona abaixo de 4h30", to: "Completar a meia abaixo de 2h" }, dueLocalDate: { from: "2026-11-20", to: "2027-03-01" } } },
    ];
    expect(goalAsOf(current, revisions, new Date("2026-09-15T00:00:00Z"))).toEqual({
      id: "g1", participationId: "maratona", description: "Completar a maratona abaixo de 4h30", dueLocalDate: "2026-11-20",
    });
    expect(goalAsOf(current, revisions, new Date("2026-08-01T00:00:00Z")).description).toBe("Completar a maratona");
    expect(goalAsOf(current, revisions, new Date("2026-10-02T00:00:00Z"))).toEqual(current);
  });

  it("mover o bloco desloca a data local mantendo o horário", () => {
    expect(shiftLocalDate("2026-11-28", 7)).toBe("2026-12-05");
    expect(shiftLocalDate("2026-03-01", -1)).toBe("2026-02-28");
  });
});
