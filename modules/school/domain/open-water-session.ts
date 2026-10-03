/**
 * SAM-65 — open water as its own experience (§13.1, §13.3–13.9, §22.1,
 * AC15): what a session needs beyond the blocks — course, environment,
 * conditions WITH provenance, who is responsible, support and signals,
 * equipment and the local cancellation criterion — and the athlete's
 * technical feedback.
 *
 * - No "safety certificate" checkbox (§13.8): responsibility and support are
 *   written by the coach; a solo session in an unknown environment raises a
 *   warning to the coach, never an invented block.
 * - Unknown conditions stay unknown; a forecast is never a measurement
 *   (§13.3): every condition carries its provenance.
 * - Distance is an estimate or "sem previsão"; intensity is by time.
 */
import { z } from "zod";

const text = (max: number) => z.string().trim().max(max).nullish().transform((value) => (value ? value : null));

/** §13.4 — kinds of open-water sessions (catalog classification). */
export const OPEN_WATER_SESSION_KINDS = [
  "FAMILIARIZATION", "ORIENTATION", "BUOY_TURN", "START", "PACK_SWIMMING", "CONTINUOUS",
  "TIME_INTERVALS", "PACE_CHANGE", "FEEDING", "SIMULATION", "POOL_FOR_OPEN_WATER",
] as const;
export const OPEN_WATER_SESSION_KIND_LABELS: Record<(typeof OPEN_WATER_SESSION_KINDS)[number], string> = {
  FAMILIARIZATION: "Familiarização supervisionada",
  ORIENTATION: "Orientação/sighting",
  BUOY_TURN: "Contorno de boia",
  START: "Largada",
  PACK_SWIMMING: "Nado em grupo/vácuo (conforme regras)",
  CONTINUOUS: "Resistência contínua",
  TIME_INTERVALS: "Intervalado por tempo",
  PACE_CHANGE: "Mudança de ritmo",
  FEEDING: "Alimentação em movimento/parada",
  SIMULATION: "Simulado",
  POOL_FOR_OPEN_WATER: "Piscina para águas abertas",
};

export const OPEN_WATER_ENVIRONMENTS = ["SEA", "LAKE", "RIVER", "RESERVOIR", "POOL"] as const;
export const OPEN_WATER_ENVIRONMENT_LABELS: Record<(typeof OPEN_WATER_ENVIRONMENTS)[number], string> = {
  SEA: "Mar", LAKE: "Lago", RIVER: "Rio", RESERVOIR: "Represa", POOL: "Piscina (objetivo: águas abertas)",
};

export const CONDITION_VARIABLES = ["WATER_TEMPERATURE", "AIR_TEMPERATURE", "WIND", "WAVES", "CURRENT", "TIDE", "VISIBILITY"] as const;
export const CONDITION_VARIABLE_LABELS: Record<(typeof CONDITION_VARIABLES)[number], string> = {
  WATER_TEMPERATURE: "Temperatura da água", AIR_TEMPERATURE: "Temperatura do ar", WIND: "Vento", WAVES: "Ondulação",
  CURRENT: "Corrente", TIDE: "Maré", VISIBILITY: "Visibilidade",
};
/** §13.3 — where a condition came from; a forecast is never a measurement. */
export const CONDITION_PROVENANCES = ["MEASURED", "ORGANIZER", "FORECAST", "REPORT"] as const;
export const CONDITION_PROVENANCE_LABELS: Record<(typeof CONDITION_PROVENANCES)[number], string> = {
  MEASURED: "medido no local", ORGANIZER: "informado pelo organizador", FORECAST: "previsão", REPORT: "relato",
};

export const conditionSchema = z.strictObject({
  variable: z.enum(CONDITION_VARIABLES),
  value: z.string().trim().min(1).max(80),
  provenance: z.enum(CONDITION_PROVENANCES),
  source: text(120),
  place: text(120),
  at: text(40),
});
export type Condition = z.infer<typeof conditionSchema>;

export const openWaterSessionSchema = z.strictObject({
  sessionKind: z.enum(OPEN_WATER_SESSION_KINDS).nullish().transform((value) => value ?? null),
  course: z.strictObject({
    layout: z.enum(["POINT_TO_POINT", "CIRCUIT"]).nullish().transform((value) => value ?? null),
    laps: z.number().int().min(1).max(100).nullish().transform((value) => value ?? null),
    buoys: text(300),
    direction: z.enum(["CLOCKWISE", "COUNTERCLOCKWISE"]).nullish().transform((value) => value ?? null),
    visualReference: text(300),
    entryExit: text(300),
  }).default({ layout: null, laps: null, buoys: null, direction: null, visualReference: null, entryExit: null }),
  environment: z.strictObject({
    kind: z.enum(OPEN_WATER_ENVIRONMENTS).nullish().transform((value) => value ?? null),
    water: z.enum(["FRESH", "SALT"]).nullish().transform((value) => value ?? null),
    exposure: text(300),
    localNotes: text(1000),
    /** The athlete already knows this place (used only for the solo-session warning). */
    familiarToAthlete: z.boolean().nullish().transform((value) => value ?? null),
  }).default({ kind: null, water: null, exposure: null, localNotes: null, familiarToAthlete: null }),
  expectedConditions: z.array(conditionSchema).max(10).default([]),
  responsiblePerson: text(200),
  supportPlan: text(1000),
  communicationSignals: text(500),
  equipment: text(500),
  cancellationCriteria: text(1000),
  /** Marked by the coach: the athlete swims without on-site supervision. */
  solo: z.boolean().default(false),
  distance: z.strictObject({
    kind: z.enum(["ESTIMATED", "NONE"]).default("NONE"),
    estimatedMeters: z.number().int().min(1).max(100_000).nullish().transform((value) => value ?? null),
  }).default({ kind: "NONE", estimatedMeters: null }),
  /** Briefing and entry/exit check are recorded apart from the aquatic time (§13.6). */
  briefingNotes: text(1000),
});
export type OpenWaterSession = z.infer<typeof openWaterSessionSchema>;

/** §13.8 — a warning to the coach, never a block. */
export function openWaterWarnings(session: OpenWaterSession): string[] {
  const warnings: string[] = [];
  if (session.solo && session.environment.familiarToAthlete !== true && session.environment.kind !== "POOL") {
    warnings.push("Sessão solitária em ambiente desconhecido: evite prescrever assim (§13.8). Boia de sinalização não substitui supervisão.");
  }
  if (!session.responsiblePerson && session.environment.kind !== "POOL") {
    warnings.push("Sem responsável pela sessão registrado.");
  }
  return warnings;
}

/** §13.6 — technical feedback of an open-water session. */
export const openWaterFeedbackSchema = z.strictObject({
  orientation: z.number().int().min(1).max(5).nullish().transform((value) => value ?? null),
  environmentalDifficulty: z.number().int().min(1).max(5).nullish().transform((value) => value ?? null),
  confidence: z.number().int().min(1).max(5).nullish().transform((value) => value ?? null),
  equipment: text(500),
  observedConditions: text(500),
  feeding: text(300),
  incident: text(1000),
});
export type OpenWaterFeedback = z.infer<typeof openWaterFeedbackSchema>;

export const OPEN_WATER_SPORT = "open-water";
