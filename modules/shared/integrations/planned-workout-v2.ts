/**
 * SAM-77 — what a v2 session becomes on a watch (§11.4, §21.6).
 *
 * `planExport(session, capabilities)` is pure and provider-agnostic: it reads
 * the fine `plannedWorkout*` capabilities the provider DECLARES (nested
 * repeat groups, rest by position, send-off intervals, manual ends, pool
 * length, yards) and emits only the contract shape the provider verified.
 * Everything the device cannot take is listed as omitted or converted with
 * the reason — never silently dropped, never invented:
 *
 * - nested sets → repeat groups when declared, else unrolled in sequence (converted);
 * - rest by position → between repetitions / after each / between sets as rest steps;
 * - send-off interval → kept when declared, else omitted (the rest depends on the swum time);
 * - manual end → lap button when declared, else omitted with the reason;
 * - primary intensity → one band in the metric; secondaries listed as omitted;
 * - pool length/unit → sent when declared; yards never converted to metres.
 *
 * The Garmin Training API specification is available only to approved
 * developer-program members (developer.garmin.com/gc-developer-program/
 * training-api, consulted 03/10/2026): Garmin declares none of the fine
 * capabilities here until that shape is verified, so its export unrolls and
 * reports, exactly as the v1 path does.
 */
import type { SessionBlock, SessionContentV2, SessionSet, SessionStep } from "@/modules/school/domain/session-content-v2";
import type { ProviderCapabilities } from "./capabilities";
import type { PlannedWorkoutStep } from "./contracts";

export type ExportNote = { block: number; kind: "omitted" | "converted"; item: string; reason: string };

/** A repeat group, emitted only when `plannedWorkoutRepeatGroups` is declared. */
export type PlannedRepeatGroup = { kind: "REPEAT"; repetitions: number; steps: PlannedWorkoutStep[] };

export type ExportPlan = {
  steps: Array<PlannedWorkoutStep | PlannedRepeatGroup>;
  notes: ExportNote[];
  /** Pool length in the declared unit, when the provider takes it. */
  pool: { length: number; unit: "m" | "yd" } | null;
  /** Nothing exportable (every step omitted): the button is hidden with this reason. */
  unsupported: string | null;
};

type Caps = Pick<ProviderCapabilities, "plannedWorkoutPush" | "plannedWorkoutRepeatGroups" | "plannedWorkoutSendOff" | "plannedWorkoutManualEnd" | "plannedWorkoutPoolLength" | "plannedWorkoutYards">;

const STEP_TYPE: Record<SessionBlock["type"], PlannedWorkoutStep["stepType"]> = {
  WARMUP: "WARMUP", TECHNIQUE: "DRILL", PREPARATION: "STEADY", MAIN: "INTERVAL", RECOVERY: "RECOVERY", COMPLEMENTARY: "STEADY",
  STRENGTH: "CUSTOM", TRANSITION: "RECOVERY", SIMULATION: "INTERVAL", COOLDOWN: "COOLDOWN", CUSTOM: "CUSTOM",
};

function targetOf(step: SessionStep, block: number, notes: ExportNote[]): PlannedWorkoutStep["target"] {
  const primary = step.intensity.primary;
  for (const secondary of step.intensity.secondary) {
    notes.push({ block, kind: "omitted", item: `Referência secundária (${secondary.text ?? secondary.kind})`, reason: "o relógio recebe um alvo por passo; só a métrica principal foi enviada" });
  }
  if (!primary) return null;
  const band = primary.min !== null && primary.max !== null;
  switch (primary.kind) {
    case "HEART_RATE":
      if (band) return { heartRateMin: primary.min, heartRateMax: primary.max };
      notes.push({ block, kind: "omitted", item: "FC com um só limite", reason: "o relógio recebe uma faixa; a Ryvano não inventa o outro limite" });
      return null;
    case "POWER":
      // The contract carries a single power value; the provider decides (and reports) what it can do with it.
      if (band && primary.min === primary.max) return { power: primary.min };
      notes.push({ block, kind: "omitted", item: band ? `Potência ${primary.min}–${primary.max} W` : "Potência", reason: "o contrato de exportação só leva um valor de potência; a faixa fica no roteiro" });
      return null;
    case "PACE":
      notes.push({ block, kind: "omitted", item: band ? `Ritmo ${primary.min}–${primary.max}` : "Ritmo", reason: "o relógio recebe uma faixa de velocidade; a conversão de ritmo em velocidade não é feita sem o formato verificado" });
      return null;
    case "SPEED":
      notes.push({ block, kind: "omitted", item: "Velocidade", reason: "faixa de velocidade ainda não verificada no formato do relógio" });
      return null;
    case "ZONE":
      if (primary.min !== null) return { zone: primary.min };
      return null;
    case "RPE":
      if (primary.min !== null) return { rpe: primary.min };
      return null;
    default:
      if (primary.text) notes.push({ block, kind: "omitted", item: `Intensidade "${primary.text}"`, reason: "texto do professor não é um alvo que o relógio mede; fica no roteiro" });
      return null;
  }
}

function stepOf(step: SessionStep, type: PlannedWorkoutStep["stepType"], block: number, caps: Caps, pool: SessionContentV2["pool"], notes: ExportNote[]): PlannedWorkoutStep | null {
  const title = step.name ?? null;
  const target = targetOf(step, block, notes);
  if (step.duration.type === "TIME") return { stepType: type, title, durationSeconds: step.duration.seconds, distanceMeters: null, target };
  if (step.duration.type === "DISTANCE") {
    if (pool?.unit === "yd" && !caps.plannedWorkoutYards) {
      notes.push({ block, kind: "omitted", item: `${step.duration.value} jd`, reason: "o relógio não recebe jardas neste provedor e a Ryvano não converte jardas em metros" });
      return null;
    }
    return { stepType: type, title, durationSeconds: null, distanceMeters: step.duration.value, target };
  }
  if (caps.plannedWorkoutManualEnd) return { stepType: type, title, durationSeconds: null, distanceMeters: null, target };
  notes.push({ block, kind: "omitted", item: title ? `Passo "${title}" com término manual` : "Passo com término manual", reason: "término pelo botão de volta não está verificado neste provedor" });
  return null;
}

function restStep(seconds: number | null, active: boolean, block: number, notes: ExportNote[]): PlannedWorkoutStep | null {
  if (seconds === null) {
    notes.push({ block, kind: "omitted", item: "Recuperação completa sem valor", reason: "o relógio precisa de um tempo de descanso" });
    return null;
  }
  if (active) notes.push({ block, kind: "converted", item: `Descanso ativo ${seconds} s`, reason: "enviado como descanso sem alvo; o que fazer no descanso fica no roteiro" });
  return { stepType: "RECOVERY", title: active ? "Descanso ativo" : "Descanso", durationSeconds: seconds, distanceMeters: null };
}

function expand(children: Array<SessionStep | SessionSet>, type: PlannedWorkoutStep["stepType"], block: number, caps: Caps, pool: SessionContentV2["pool"], notes: ExportNote[]): Array<PlannedWorkoutStep | PlannedRepeatGroup> {
  const out: Array<PlannedWorkoutStep | PlannedRepeatGroup> = [];
  for (const child of children) {
    if (child.kind === "STEP") {
      const step = stepOf(child, type, block, caps, pool, notes);
      if (step) out.push(step);
      continue;
    }
    const inner = expand(child.children, type, block, caps, pool, notes);
    const flat = inner.flatMap((item) => ("kind" in item && item.kind === "REPEAT" ? item.steps : [item as PlannedWorkoutStep]));
    if (flat.length === 0) continue;
    if (child.sendOffSeconds !== null && !caps.plannedWorkoutSendOff) {
      notes.push({ block, kind: "omitted", item: `Saída a cada ${child.sendOffSeconds} s`, reason: "intervalo de saída não está verificado neste provedor; o descanso depende do tempo executado" });
    }
    const rest = child.rest ? restStep(child.rest.seconds, child.rest.active, block, notes) : null;
    const position = child.rest?.position ?? "BETWEEN_REPS";
    if (caps.plannedWorkoutRepeatGroups && inner.every((item) => !("kind" in item && item.kind === "REPEAT"))) {
      const groupSteps = position === "BETWEEN_SETS" || !rest ? flat : [...flat, rest];
      out.push({ kind: "REPEAT", repetitions: child.repetitions, steps: groupSteps });
      if (position === "BETWEEN_SETS" && rest) out.push(rest);
      continue;
    }
    if (child.repetitions > 1) notes.push({ block, kind: "converted", item: `${child.repetitions} repetições`, reason: "enviadas como passos em sequência; o relógio executa igual" });
    for (let repetition = 1; repetition <= child.repetitions; repetition += 1) {
      out.push(...flat);
      if (rest && (position === "AFTER_ALL" || (position === "BETWEEN_REPS" && repetition < child.repetitions))) out.push(rest);
    }
    if (rest && position === "BETWEEN_SETS") out.push(rest);
  }
  return out;
}

export function planExport(session: SessionContentV2, capabilities: Caps): ExportPlan {
  const notes: ExportNote[] = [];
  if (!capabilities.plannedWorkoutPush) return { steps: [], notes, pool: null, unsupported: "Este provedor não recebe treinos planejados." };
  const steps = session.blocks.flatMap((block, index) => expand(block.children, STEP_TYPE[block.type], index + 1, capabilities, session.pool, notes));
  let pool: ExportPlan["pool"] = null;
  if (session.pool) {
    if (capabilities.plannedWorkoutPoolLength && (session.pool.unit === "m" || capabilities.plannedWorkoutYards)) pool = session.pool;
    else notes.push({ block: 0, kind: "omitted", item: `Piscina de ${session.pool.length} ${session.pool.unit}`, reason: "comprimento da piscina não está verificado neste provedor; confira no relógio" });
  }
  if (session.nutrition) notes.push({ block: 0, kind: "omitted", item: "Nutrição/hidratação", reason: "texto do professor; fica no roteiro" });
  return { steps, notes, pool, unsupported: steps.length === 0 ? "Nenhum passo desta sessão pode ir ao relógio neste provedor; o roteiro continua no aplicativo." : null };
}

/** The flat contract steps (repeat groups unrolled) — what the current providers take. */
export function flatSteps(plan: ExportPlan): PlannedWorkoutStep[] {
  return plan.steps.flatMap((item) => ("kind" in item && item.kind === "REPEAT" ? Array.from({ length: item.repetitions }, () => item.steps).flat() : [item as PlannedWorkoutStep]));
}
