/**
 * SAM-77 — v2 export plan by provider capability (§11.4, §21.6).
 */
import { describe, expect, it } from "vitest";

import { sessionContentV2Schema, type SessionContentV2 } from "@/modules/school/domain/session-content-v2";
import { getProviderDefinition } from "@/modules/shared/integrations/catalog";
import { flatSteps, planExport } from "@/modules/shared/integrations/planned-workout-v2";

const dist = (value: number, extra: Record<string, unknown> = {}) => ({ kind: "STEP", duration: { type: "DISTANCE", value }, ...extra });
const set = (repetitions: number, children: unknown[], rest: Record<string, unknown> | null = null, extra: Record<string, unknown> = {}) => ({ kind: "SET", repetitions, children, rest, ...extra });
const session = (blocks: unknown[], pool?: { length: number; unit: "m" | "yd" }, extra: Record<string, unknown> = {}): SessionContentV2 => sessionContentV2Schema.parse({ schemaVersion: 2, pool, blocks, ...extra });

const NAT_PISC_001 = session([
  { type: "WARMUP", name: "Aquecimento", children: [dist(200), dist(100)] },
  { type: "TECHNIQUE", name: "Técnica", children: [set(4, [dist(50)])] },
  { type: "MAIN", name: "Principal", children: [set(6, [dist(100, { intensity: { primary: { kind: "HEART_RATE", min: 140, max: 155 }, secondary: [{ kind: "TEXT", text: "forte" }] } })], { position: "BETWEEN_REPS", seconds: 20 })] },
  { type: "COOLDOWN", name: "Soltura", children: [dist(100)] },
], { length: 25, unit: "m" }, { nutrition: "água entre as séries" });

const NONE = { plannedWorkoutPush: true };
const FULL = { plannedWorkoutPush: true, plannedWorkoutRepeatGroups: true, plannedWorkoutSendOff: true, plannedWorkoutManualEnd: true, plannedWorkoutPoolLength: true, plannedWorkoutYards: true };

describe("NAT-PISC-001 v2 (§11.4)", () => {
  it("sem capabilities finas: séries desenroladas com 5 descansos, FC em faixa, secundária/piscina/nutrição listadas", () => {
    const plan = planExport(NAT_PISC_001, NONE);
    const steps = flatSteps(plan);
    // 2 + 4 + (6 efforts + 5 rests) + 1 = 18
    expect(steps).toHaveLength(18);
    expect(steps.filter((step) => step.stepType === "RECOVERY")).toHaveLength(5);
    expect(steps.find((step) => step.stepType === "INTERVAL")!.target).toEqual({ heartRateMin: 140, heartRateMax: 155 });
    expect(plan.notes.map((note) => `${note.kind}:${note.item}`)).toEqual(expect.arrayContaining([
      "converted:4 repetições", "converted:6 repetições", "omitted:Referência secundária (forte)", "omitted:Piscina de 25 m", "omitted:Nutrição/hidratação",
    ]));
    expect(plan.pool).toBeNull();
    expect(plan.unsupported).toBeNull();
  });

  it("com grupos de repetição e piscina verificados: grupos com o descanso dentro, piscina enviada, nada desenrolado", () => {
    const plan = planExport(NAT_PISC_001, FULL);
    const main = plan.steps.find((item) => "kind" in item && item.kind === "REPEAT" && item.repetitions === 6);
    expect(main).toBeDefined();
    expect((main as { steps: unknown[] }).steps).toHaveLength(2);
    expect(plan.pool).toEqual({ length: 25, unit: "m" });
    expect(plan.notes.some((note) => note.kind === "converted")).toBe(false);
    expect(flatSteps(plan).filter((step) => step.stepType === "RECOVERY")).toHaveLength(6);
  });
});

describe("posição do descanso, saída, término manual e jardas", () => {
  it("após cada = 6 descansos; entre séries = 1; saída a cada e término manual omitidos com motivo sem capability", () => {
    const after = session([{ type: "MAIN", name: "P", children: [set(6, [dist(100)], { position: "AFTER_ALL", seconds: 20 })] }]);
    expect(flatSteps(planExport(after, NONE)).filter((step) => step.stepType === "RECOVERY")).toHaveLength(6);
    const between = session([{ type: "MAIN", name: "P", children: [set(3, [dist(100)], { position: "BETWEEN_SETS", seconds: 60 })] }]);
    const betweenSteps = flatSteps(planExport(between, NONE));
    expect(betweenSteps.filter((step) => step.stepType === "RECOVERY")).toHaveLength(1);
    expect(betweenSteps[betweenSteps.length - 1]!.stepType).toBe("RECOVERY");
    const sendOff = planExport(session([{ type: "MAIN", name: "P", children: [set(6, [dist(100)], null, { sendOffSeconds: 120 })] }]), NONE);
    expect(sendOff.notes).toContainEqual(expect.objectContaining({ kind: "omitted", item: "Saída a cada 120 s" }));
    const manual = planExport(session([{ type: "MAIN", name: "P", children: [{ kind: "STEP", name: "Tiro", duration: { type: "MANUAL" } }] }]), NONE);
    expect(manual.unsupported).toContain("Nenhum passo");
    expect(manual.notes).toContainEqual(expect.objectContaining({ kind: "omitted", item: 'Passo "Tiro" com término manual' }));
    expect(flatSteps(planExport(session([{ type: "MAIN", name: "P", children: [{ kind: "STEP", name: "Tiro", duration: { type: "MANUAL" } }] }]), FULL))).toHaveLength(1);
  });

  it("piscina de 25 jd sem capability: distâncias omitidas, nunca convertidas (AC16)", () => {
    const yards = session([{ type: "MAIN", name: "P", children: [set(4, [dist(100)])] }], { length: 25, unit: "yd" });
    const plan = planExport(yards, NONE);
    expect(flatSteps(plan)).toHaveLength(0);
    expect(plan.notes).toContainEqual(expect.objectContaining({ item: "100 jd", reason: expect.stringContaining("não converte") }));
    expect(plan.unsupported).not.toBeNull();
  });
});

describe("nunca inventa valor; provedor sem capability", () => {
  it("FC com um limite só, potência em faixa e ritmo não viram alvo; o motivo é listado", () => {
    const plan = planExport(session([{ type: "MAIN", name: "P", children: [
      dist(100, { intensity: { primary: { kind: "HEART_RATE", min: 140, max: null } } }),
      dist(100, { intensity: { primary: { kind: "POWER", min: 200, max: 220 } } }),
      dist(100, { intensity: { primary: { kind: "PACE", min: 300, max: 320 } } }),
    ] }]), NONE);
    expect(flatSteps(plan).every((step) => !step.target || Object.keys(step.target).length === 0)).toBe(true);
    expect(plan.notes.filter((note) => note.kind === "omitted")).toHaveLength(3);
  });

  it("provedor sem plannedWorkoutPush: nada vai e a razão é dada; o catálogo não declara capability fina não verificada", () => {
    expect(planExport(NAT_PISC_001, { plannedWorkoutPush: false }).unsupported).toContain("não recebe treinos planejados");
    const garmin = getProviderDefinition("GARMIN")!.capabilities;
    expect(garmin.plannedWorkoutPush).toBe(true);
    expect(garmin.plannedWorkoutRepeatGroups ?? false).toBe(false);
    expect(getProviderDefinition("STRAVA")!.capabilities.plannedWorkoutPush ?? false).toBe(false);
  });
});
