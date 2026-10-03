/**
 * SAM-65 — open water: session context, technical feedback and limited comparison (§13.3–13.9, AC15).
 */
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { writeWorkoutVersion } from "@/modules/school/application/prescribe-workout-to-athlete";
import { openWaterFeedbackSchema, openWaterSessionSchema, openWaterWarnings } from "@/modules/school/domain/open-water-session";
import { gpsQuality, openWaterComparability, technicalTaskStatus } from "@/modules/school/presentation/open-water-analysis";

const NAT_AA_001 = openWaterSessionSchema.parse({
  sessionKind: "ORIENTATION",
  course: { layout: "CIRCUIT", laps: 2, buoys: "3 boias amarelas", direction: "CLOCKWISE", visualReference: "torre do salva-vidas", entryExit: "rampa do clube" },
  environment: { kind: "LAKE", water: "FRESH", familiarToAthlete: true },
  expectedConditions: [{ variable: "WIND", value: "fraco", provenance: "FORECAST", source: "previsão local" }],
  responsiblePerson: "Ricardo, na margem",
  supportPlan: "caiaque de apoio",
  communicationSignals: "braço levantado = parar",
  distance: { kind: "ESTIMATED", estimatedMeters: 2000 },
  briefingNotes: "briefing de 10 min na margem",
});

describe("contexto da sessão", () => {
  it("guarda percurso, ambiente, condições com proveniência, responsável e apoio; não existe 'certificado de segurança'", () => {
    expect(NAT_AA_001.expectedConditions[0]).toMatchObject({ variable: "WIND", provenance: "FORECAST" });
    expect(() => openWaterSessionSchema.parse({ safetyCertificate: true })).toThrow();
    expect(() => openWaterSessionSchema.parse({ expectedConditions: [{ variable: "WIND", value: "forte" }] })).toThrow();
    expect(openWaterWarnings(NAT_AA_001)).toEqual([]);
  });

  it("sessão solitária em ambiente desconhecido gera aviso ao professor, sem bloquear", () => {
    const solo = openWaterSessionSchema.parse({ ...NAT_AA_001, solo: true, environment: { kind: "SEA" } });
    expect(openWaterWarnings(solo)[0]).toContain("Sessão solitária em ambiente desconhecido");
  });

  it("a prescrição grava o contexto junto da versão (imutável)", async () => {
    const update = vi.fn().mockResolvedValue({});
    const tx = {
      workout: { create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(data)), update },
      // The row as Postgres returns it: JSON null sentinels come back as null.
      workoutBlock: { create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(Object.fromEntries(Object.entries({ ...data, createdAt: new Date(), updatedAt: new Date() }).map(([key, value]) => [key, (value as unknown) === Prisma.JsonNull ? null : value])))) },
    };
    await writeWorkoutVersion(tx as never, {
      context: { coachId: "coach-r", schoolId: null },
      input: { title: "NAT-AA-001", description: null, sportType: "open-water", templateId: null, templateVersion: null, openWater: NAT_AA_001, blocks: [{ blockType: "STEADY", title: "Início", durationS: 480, distanceM: null, repetitions: null, target: null, rest: null, restDurationS: null }] as never },
      scheduledAt: new Date("2026-10-03T10:00:00Z"),
      now: new Date("2026-10-03T09:00:00Z"),
    });
    expect(update.mock.calls[0]![0].data.sessionContext).toMatchObject({ responsiblePerson: "Ricardo, na margem", supportPlan: "caiaque de apoio" });
  });
});

describe("análise específica (§13.9)", () => {
  it("GPS incoerente mostra a limitação e não calcula ritmo; sem distância lê pelo tempo", () => {
    const incoherent = gpsQuality({ durationSeconds: 46 * 60, distanceMeters: 9000 });
    expect(incoherent).toMatchObject({ status: "INCOHERENT" });
    expect(incoherent && "pacePer100mSeconds" in incoherent).toBe(false);
    expect(gpsQuality({ durationSeconds: 46 * 60, distanceMeters: null })?.status).toBe("NO_DISTANCE");
    expect(gpsQuality({ durationSeconds: 46 * 60, distanceMeters: 2300 })).toMatchObject({ status: "ESTIMATE", pacePer100mSeconds: 120 });
  });

  it("duas sessões em condições diferentes: 'comparação limitada', sem dizer que melhorou", () => {
    const previous = { context: NAT_AA_001, observedConditions: "mar calmo", durationSeconds: 50 * 60 };
    const current = { context: NAT_AA_001, observedConditions: "vento forte", durationSeconds: 46 * 60 };
    const result = openWaterComparability(current, previous)!;
    expect(result.comparable).toBe(false);
    expect(result.sentence).toBe("Tempo menor em condições diferentes (condições) — comparação limitada.");
    expect(result.sentence).not.toMatch(/melhor/);
    expect(openWaterComparability({ ...current, observedConditions: "mar calmo" }, previous)!.comparable).toBe(true);
    expect(openWaterComparability(current, null)).toBeNull();
  });

  it("feedback técnico validado; tarefa técnica fica pendente até a revisão do professor", () => {
    expect(openWaterFeedbackSchema.parse({ orientation: 2, environmentalDifficulty: 4, confidence: 3 })).toMatchObject({ orientation: 2, equipment: null });
    expect(() => openWaterFeedbackSchema.parse({ orientation: 6 })).toThrow();
    expect(technicalTaskStatus({ hasExecutionOrReport: true, reviewed: false })).toBe("Tarefa técnica pendente de revisão");
    expect(technicalTaskStatus({ hasExecutionOrReport: true, reviewed: true })).toBe("Tarefa técnica revisada pelo professor");
  });
});
