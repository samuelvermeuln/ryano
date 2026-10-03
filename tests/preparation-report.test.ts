/**
 * SAM-76 — evolution report in objective states; no readiness claim (§17.7, §2.3).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { assertNoReadinessClaims, hasReadinessClaims, milestoneCompletionLabel, milestoneReportState, REPORT_STATE_LABELS } from "@/modules/school/domain/preparation-report";

describe("estados objetivos dos marcos (§17.7)", () => {
  it("1 atingido, 1 faltam evidências, 1 aguardando avaliação → '1 de 3 — conclusão administrativa, não aptidão'", () => {
    const today = "2026-11-15";
    const states = [
      milestoneReportState({ status: "ACHIEVED", dueLocalDate: "2026-11-01", sessions: [] }, today),
      milestoneReportState({ status: "PLANNED", dueLocalDate: "2026-11-10", sessions: [{ executed: false, reviewed: false }] }, today),
      milestoneReportState({ status: "EVIDENCE_RECEIVED", dueLocalDate: "2026-11-20", sessions: [{ executed: true, reviewed: false }] }, today),
    ];
    expect(states).toEqual(["ACHIEVED", "MISSING_EVIDENCE", "AWAITING_ASSESSMENT"]);
    expect(states.map((state) => REPORT_STATE_LABELS[state])).toEqual(["marco atingido", "faltam evidências", "aguardando avaliação"]);
    expect(milestoneCompletionLabel(1, 3)).toBe("1 de 3 marco(s) concluído(s) — conclusão administrativa, não aptidão.");
  });

  it("sessão de referência executada e sem parecer → precisa de revisão; futuro sem evidência → planejado", () => {
    expect(milestoneReportState({ status: "IN_PROGRESS", dueLocalDate: "2026-12-01", sessions: [{ executed: true, reviewed: false }] }, "2026-11-15")).toBe("NEEDS_REVIEW");
    expect(milestoneReportState({ status: "PLANNED", dueLocalDate: "2026-12-01", sessions: [] }, "2026-11-15")).toBe("PLANNED");
    expect(milestoneReportState({ status: "PARTIALLY_ACHIEVED", dueLocalDate: "2026-11-01", sessions: [] }, "2026-11-15")).toBe("NOT_ACHIEVED");
  });
});

describe("nenhum percentual de prontidão (§2.3)", () => {
  it("o guarda rejeita '87% pronto', aptidão, segurança, garantia e probabilidade de sucesso; aceita o rótulo administrativo", () => {
    expect(hasReadinessClaims("87% pronto para a prova")).toBe(true);
    expect(hasReadinessClaims("aptidão confirmada")).toBe(true);
    expect(hasReadinessClaims("treino com segurança garantida")).toBe(true);
    expect(hasReadinessClaims("probabilidade de sucesso alta")).toBe(true);
    expect(() => assertNoReadinessClaims("1 de 3 marco(s) concluído(s) — conclusão administrativa, não aptidão.")).toThrow();
    expect(hasReadinessClaims("aderência 75% / cobertura 66,7%")).toBe(false);
    expect(hasReadinessClaims("marco atingido · precisa de revisão · faltam evidências · aguardando avaliação")).toBe(false);
  });

  it("os textos fixos do relatório não fazem nenhuma dessas afirmações (exceto a negação explícita 'não aptidão')", () => {
    const source = readFileSync("components/events/preparation-report.tsx", "utf-8");
    const strings = [...source.matchAll(/["'`]([^"'`\n]{4,})["'`]/g)].map((match) => match[1]!).filter((text) => !text.includes("não aptidão"));
    const offending = strings.filter((text) => hasReadinessClaims(text));
    expect(offending).toEqual([]);
    expect(source).not.toMatch(/\bpronto\b/i);
  });
});
