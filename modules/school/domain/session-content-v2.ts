/**
 * SAM-69 — session content v2 (§11, §12.3, §14.2, §15.2, §16.7, AC16, AC17).
 *
 * Named blocks of the §11.1 types holding steps and NESTED sets; rest with an
 * explicit position (between reps / between sets / after all), standing or
 * active, counted or not; a send-off interval distinct from a fixed rest;
 * steps by time, distance or manual end; intensity as text, RPE, pace, speed,
 * HR, power or zone — one primary plus secondary references that never have
 * to coincide; pool length and unit (m or yd, never interchanged).
 *
 * Totals (AC17): effort, planned recovery and total duration separated; the
 * total is EXACT only when every part has a known duration — a distance step
 * without pace, a manual end, a "full recovery" without a value or a send-off
 * make it an estimate. A title that declares another total is flagged.
 *
 * v1 snapshots are never rewritten: `fromV1` reads them, `flattenToV1` keeps
 * the block rows every v1 reader (compliance, lap alignment) understands.
 */
import { z } from "zod";

export const SESSION_SCHEMA_VERSION = 2;

/** §11.1 */
export const V2_BLOCK_TYPES = ["WARMUP", "TECHNIQUE", "PREPARATION", "MAIN", "RECOVERY", "COMPLEMENTARY", "STRENGTH", "TRANSITION", "SIMULATION", "COOLDOWN", "CUSTOM"] as const;
export const V2_BLOCK_TYPE_LABELS: Record<(typeof V2_BLOCK_TYPES)[number], string> = {
  WARMUP: "Aquecimento", TECHNIQUE: "Técnica/educativos", PREPARATION: "Preparação", MAIN: "Principal", RECOVERY: "Recuperação",
  COMPLEMENTARY: "Complementar", STRENGTH: "Força", TRANSITION: "Transição", SIMULATION: "Simulado", COOLDOWN: "Volta à calma", CUSTOM: "Personalizado",
};

const text = (max: number) => z.string().trim().max(max).nullish().transform((value) => (value ? value : null));

export const intensitySchema = z.strictObject({
  kind: z.enum(["TEXT", "RPE", "PACE", "SPEED", "HEART_RATE", "POWER", "ZONE"]),
  /** Free text for TEXT; otherwise a min–max range in the unit of the kind (pace s/km or s/100, speed km/h, bpm, W, zone number). */
  text: text(300),
  min: z.number().min(0).nullish().transform((value) => value ?? null),
  max: z.number().min(0).nullish().transform((value) => value ?? null),
  /** "Usar a referência da ficha" — resolved per athlete at assignment (SAM-60). */
  relative: z.boolean().default(false),
});

const durationSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("TIME"), seconds: z.number().int().min(1).max(86_400) }),
  /** In the session's pool unit for pool swims, otherwise meters. */
  z.strictObject({ type: z.literal("DISTANCE"), value: z.number().min(1).max(1_000_000) }),
  z.strictObject({ type: z.literal("MANUAL") }),
]);

export const restSchema = z.strictObject({
  position: z.enum(["BETWEEN_REPS", "BETWEEN_SETS", "AFTER_ALL"]).default("BETWEEN_REPS"),
  /** null = "recuperação completa" without a value: the total stops being exact. */
  seconds: z.number().int().min(1).max(3600).nullable(),
  active: z.boolean().default(false),
  countsInTotal: z.boolean().default(true),
});

export const stepSchema = z.strictObject({
  kind: z.literal("STEP"),
  name: text(120),
  duration: durationSchema,
  intensity: z.strictObject({ primary: intensitySchema.nullish().transform((value) => value ?? null), secondary: z.array(intensitySchema).max(4).default([]) })
    .default({ primary: null, secondary: [] }),
  notes: text(1000),
  /** §12.3 — pool details; breathing only as the coach writes it (no generic apnea/hyperventilation requirement). */
  swim: z.strictObject({ stroke: text(40), equipment: text(120), singleArm: text(40), breathing: text(120), strokeCount: z.number().int().min(1).max(200).nullish(), technicalNotes: text(500) }).nullish().transform((value) => value ?? null),
  /** §15.2 — optional cadence and the power source. */
  bike: z.strictObject({ cadenceMin: z.number().int().min(20).max(200).nullish(), cadenceMax: z.number().int().min(20).max(200).nullish(), powerSource: text(80), terrain: text(200) }).nullish().transform((value) => value ?? null),
  /** §14.2 — terrain/incline for hills and trail. */
  run: z.strictObject({ terrain: text(200), incline: text(60) }).nullish().transform((value) => value ?? null),
  /** §16.7 — strength/mobility exercise; does not change the main sport. */
  strength: z.strictObject({ exercise: z.string().trim().min(1).max(120), sets: z.number().int().min(1).max(50), reps: z.number().int().min(1).max(500).nullish(), load: text(60) }).nullish().transform((value) => value ?? null),
  /** §11.4 — a drill has purpose, execution and guidance; a video is support only. */
  drill: z.strictObject({ purpose: z.string().trim().min(1).max(300), execution: text(500), guidance: text(500), videoUrl: z.string().trim().url().max(500).nullish() }).nullish().transform((value) => value ?? null),
});
export type SessionStep = z.infer<typeof stepSchema>;

export type SessionSet = {
  kind: "SET";
  name: string | null;
  repetitions: number;
  children: Array<SessionStep | SessionSet>;
  rest: z.infer<typeof restSchema> | null;
  /** "Saindo a cada 2:00": the start of each rep, so the rest depends on the time swum. */
  sendOffSeconds: number | null;
};

export const setSchema: z.ZodType<SessionSet> = z.lazy(() => z.strictObject({
  kind: z.literal("SET"),
  name: text(120),
  repetitions: z.number().int().min(1).max(200),
  children: z.array(z.union([stepSchema, setSchema])).min(1).max(40),
  rest: restSchema.nullish().transform((value) => value ?? null),
  sendOffSeconds: z.number().int().min(1).max(3600).nullish().transform((value) => value ?? null),
})) as unknown as z.ZodType<SessionSet>;

export const v2BlockSchema = z.strictObject({
  type: z.enum(V2_BLOCK_TYPES),
  name: z.string().trim().min(1).max(120),
  children: z.array(z.union([stepSchema, setSchema])).min(1).max(40),
  notes: text(1000),
});
export type SessionBlock = z.infer<typeof v2BlockSchema>;

export const sessionContentV2Schema = z.strictObject({
  schemaVersion: z.literal(SESSION_SCHEMA_VERSION),
  /** §12.3, AC16 — pool sessions: length and unit; yards are never converted to meters. */
  pool: z.strictObject({ length: z.number().min(10).max(100), unit: z.enum(["m", "yd"]) }).nullish().transform((value) => value ?? null),
  blocks: z.array(v2BlockSchema).min(1).max(30),
  /** §16.7 — the coach's nutrition/hydration text for this session; never an automatic dose. */
  nutrition: text(2000),
});
export type SessionContentV2 = z.infer<typeof sessionContentV2Schema>;

// ---------------------------------------------------------------------------
// Totals (AC17)
// ---------------------------------------------------------------------------

export type SessionTotals = {
  /** Time spent in steps with a known duration. */
  effortSeconds: number;
  /** Planned recovery counted in the total. */
  recoverySeconds: number;
  /** Effort + recovery + send-off estimates; exact only when nothing is open. */
  totalSeconds: number;
  durationExact: boolean;
  /** Why the duration is not exact (shown to the coach). */
  durationNotes: string[];
  distance: number;
  distanceUnit: "m" | "yd";
  /** Distance from distance steps only; time-only steps make it partial. */
  distancePartial: boolean;
};

type Acc = { effort: number; recovery: number; estimate: number; distance: number; open: Set<string>; timeOnly: boolean };

function stepTotals(step: SessionStep, acc: Acc) {
  if (step.duration.type === "TIME") {
    acc.effort += step.duration.seconds;
    acc.timeOnly = true;
  } else if (step.duration.type === "DISTANCE") {
    acc.distance += step.duration.value;
    acc.open.add("passos por distância: a duração depende do ritmo de quem executa");
  } else {
    acc.open.add("término manual");
  }
}

function nodeTotals(node: SessionStep | SessionSet, acc: Acc) {
  if (node.kind === "STEP") return stepTotals(node, acc);
  const once: Acc = { effort: 0, recovery: 0, estimate: 0, distance: 0, open: acc.open, timeOnly: false };
  for (const child of node.children) nodeTotals(child, once);
  const reps = node.repetitions;
  acc.distance += once.distance * reps;
  acc.timeOnly ||= once.timeOnly;
  if (node.sendOffSeconds) {
    // Each rep starts every send-off: the series lasts about reps × send-off; the rest is what is left.
    acc.estimate += reps * node.sendOffSeconds + once.recovery * reps;
    acc.open.add("intervalo de saída: o descanso depende do tempo executado");
  } else {
    acc.effort += once.effort * reps;
    acc.recovery += once.recovery * reps;
    acc.estimate += once.estimate * reps;
  }
  if (node.rest && !node.sendOffSeconds) {
    const pauses = node.rest.position === "AFTER_ALL" ? reps : reps - 1;
    if (node.rest.seconds === null) acc.open.add("recuperação completa sem valor");
    else if (node.rest.countsInTotal) acc.recovery += pauses * node.rest.seconds;
  }
}

export function sessionTotals(content: SessionContentV2): SessionTotals {
  const acc: Acc = { effort: 0, recovery: 0, estimate: 0, distance: 0, open: new Set(), timeOnly: false };
  for (const block of content.blocks) for (const child of block.children) nodeTotals(child, acc);
  return {
    effortSeconds: acc.effort,
    recoverySeconds: acc.recovery,
    totalSeconds: acc.effort + acc.recovery + acc.estimate,
    durationExact: acc.open.size === 0,
    durationNotes: [...acc.open],
    distance: acc.distance,
    distanceUnit: content.pool?.unit ?? "m",
    distancePartial: acc.timeOnly && acc.distance > 0,
  };
}

/** Pauses between reps of a set (§11.2): "6 × 100 com 20 s" = 5; with a rest after the last, 6. */
export function pauseCount(set: Pick<SessionSet, "repetitions" | "rest" | "sendOffSeconds">): number {
  if (!set.rest || set.sendOffSeconds) return 0;
  return set.rest.position === "AFTER_ALL" ? set.repetitions : set.repetitions - 1;
}

// ---------------------------------------------------------------------------
// Title × total (§11.3)
// ---------------------------------------------------------------------------

/** A total the title declares ("1.400 m", "2,6 km", "40 min") that differs from the sum. */
export function titleDivergence(title: string, totals: SessionTotals): string | null {
  const distance = title.match(/(\d{1,3}(?:\.\d{3})+|\d+(?:,\d+)?)\s*(km|m|yd)\b/i);
  if (distance && totals.distance > 0) {
    const raw = distance[1]!.replace(/\./g, "").replace(",", ".");
    const unit = distance[2]!.toLowerCase();
    const declared = unit === "km" ? Number(raw) * 1000 : Number(raw);
    const declaredUnit = unit === "yd" ? "yd" : "m";
    if (declaredUnit !== totals.distanceUnit) return `O título fala em ${declaredUnit === "yd" ? "jardas" : "metros"} e a sessão está em ${totals.distanceUnit === "yd" ? "jardas" : "metros"}; não converto sem método.`;
    if (Math.abs(declared - totals.distance) > 0.5) {
      return `O título declara ${declared.toLocaleString("pt-BR")} ${declaredUnit}, mas os blocos somam ${totals.distance.toLocaleString("pt-BR")} ${totals.distanceUnit}.`;
    }
  }
  const minutes = title.match(/(\d+)\s*min\b/i);
  if (minutes && totals.durationExact) {
    const declared = Number(minutes[1]) * 60;
    if (declared !== totals.totalSeconds) return `O título declara ${minutes[1]} min, mas os blocos somam ${Math.round(totals.totalSeconds / 60)} min.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// v1 compatibility
// ---------------------------------------------------------------------------

type V1Row = { blockType: string; title?: string | null; durationS: number | null; distanceM: number | null; repetitions: number | null; restDurationS?: number | null };

const V1_TO_V2: Record<string, (typeof V2_BLOCK_TYPES)[number]> = {
  WARMUP: "WARMUP", INTERVAL: "MAIN", STEADY: "MAIN", RECOVERY: "RECOVERY", COOLDOWN: "COOLDOWN", DRILL: "TECHNIQUE", FREE: "CUSTOM", CUSTOM: "CUSTOM",
};

/** Reads a v1 block list as v2 (display and totals); the stored v1 snapshot is untouched. */
export function fromV1(rows: readonly V1Row[]): SessionContentV2 {
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    pool: null,
    nutrition: null,
    blocks: rows.map((row) => {
      const step: SessionStep = {
        kind: "STEP", name: null,
        duration: row.durationS ? { type: "TIME", seconds: row.durationS } : row.distanceM ? { type: "DISTANCE", value: row.distanceM } : { type: "MANUAL" },
        intensity: { primary: null, secondary: [] }, notes: null, swim: null, bike: null, run: null, strength: null, drill: null,
      };
      const reps = row.repetitions ?? 1;
      const child: SessionStep | SessionSet = reps > 1 || row.restDurationS
        ? { kind: "SET", name: null, repetitions: reps, children: [step], rest: row.restDurationS ? { position: "BETWEEN_REPS", seconds: row.restDurationS, active: false, countsInTotal: true } : null, sendOffSeconds: null }
        : step;
      return { type: V1_TO_V2[row.blockType] ?? "CUSTOM", name: row.title ?? V2_BLOCK_TYPE_LABELS[V1_TO_V2[row.blockType] ?? "CUSTOM"], children: [child], notes: null };
    }),
  };
}

const V2_TO_V1: Record<(typeof V2_BLOCK_TYPES)[number], string> = {
  WARMUP: "WARMUP", TECHNIQUE: "DRILL", PREPARATION: "STEADY", MAIN: "STEADY", RECOVERY: "RECOVERY", COMPLEMENTARY: "CUSTOM",
  STRENGTH: "CUSTOM", TRANSITION: "CUSTOM", SIMULATION: "STEADY", COOLDOWN: "COOLDOWN", CUSTOM: "CUSTOM",
};

/**
 * The flat block rows v1 readers understand (compliance, lap alignment): a set
 * of one step becomes one repeated block with its rest; anything richer is
 * expanded in order, so totals stay the same.
 */
export function flattenToV1(content: SessionContentV2) {
  const rows: Array<{ blockType: string; title: string | null; durationS: number | null; distanceM: number | null; repetitions: number | null; restDurationS: number | null }> = [];
  const pushStep = (blockType: string, title: string | null, step: SessionStep, repetitions: number | null, restDurationS: number | null) => {
    rows.push({
      blockType, title: step.name ?? title,
      durationS: step.duration.type === "TIME" ? step.duration.seconds : null,
      distanceM: step.duration.type === "DISTANCE" && content.pool?.unit !== "yd" ? step.duration.value : null,
      repetitions, restDurationS,
    });
  };
  const walk = (blockType: string, title: string, node: SessionStep | SessionSet) => {
    if (node.kind === "STEP") return pushStep(blockType, title, node, null, null);
    const restSeconds = node.rest && node.rest.position !== "AFTER_ALL" && node.rest.countsInTotal ? node.rest.seconds : null;
    if (node.children.length === 1 && node.children[0]!.kind === "STEP" && !node.sendOffSeconds) {
      return pushStep(blockType, title, node.children[0] as SessionStep, node.repetitions, restSeconds);
    }
    for (let rep = 0; rep < node.repetitions; rep += 1) for (const child of node.children) walk(blockType, title, child);
  };
  for (const block of content.blocks) for (const child of block.children) walk(V2_TO_V1[block.type], block.name, child);
  return rows;
}
