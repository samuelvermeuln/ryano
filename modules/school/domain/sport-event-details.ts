/**
 * SAM-52 — per-modality fields of an event and of its options (§12.1, §12.6,
 * §13.2–13.3, §13.7, §14.5, §15.1, §15.5, §16.1, §16.6 of
 * docs/ryvano_treinos_eventos_acompanhamento.md).
 *
 * Stored in `SportEvent.details` / `SportEventOption.details` (JSON with
 * `schemaVersion`), validated here by the event's modality. Rules:
 * - every field is optional and an unknown field stays UNKNOWN — it is shown
 *   as "desconhecido", never as zero and never copied from another field (the
 *   air temperature never fills the water temperature, §13.3);
 * - environmental conditions carry provenance (measured, organizer, forecast,
 *   report) with source, place and time — a forecast is not a measurement;
 * - no universal number (water temperature, wetsuit, drafting) is coded here:
 *   rules are text taken from the edition's regulation (§13.8), shown with the
 *   regulation link and consultation date already on the event;
 * - the format is never deduced from the name ("travessia", "olímpico"): a
 *   triathlon's format is only a label, its distances are the segments.
 */
import { z } from "zod";

export const EVENT_DETAILS_SCHEMA_VERSION = 1;

export type EventDetailsFamily = "pool" | "openWater" | "run" | "bike" | "multisport";

const FAMILY_BY_SPORT: Record<string, EventDetailsFamily> = {
  swim: "pool",
  "open-water": "openWater",
  run: "run",
  "trail-run": "run",
  bike: "bike",
  mtb: "bike",
  triathlon: "multisport",
  duathlon: "multisport",
  aquathlon: "multisport",
};

/** Modalities without specific fields keep only generic notes. */
export function eventDetailsFamily(sportType: string): EventDetailsFamily | null {
  return FAMILY_BY_SPORT[sportType] ?? null;
}

const text = (max = 500) => z.string().trim().min(1).max(max).optional();
const minutes = z.number().int().positive().max(100_000).optional();
const distanceUnit = z.enum(["m", "km", "yd", "mi"]);

// --- Conditions with provenance (§13.3) -------------------------------------

export const CONDITION_SOURCES = ["MEASURED", "ORGANIZER", "FORECAST", "REPORT"] as const;
export const CONDITION_SOURCE_LABELS: Record<(typeof CONDITION_SOURCES)[number], string> = {
  MEASURED: "medição", ORGANIZER: "organizador", FORECAST: "previsão", REPORT: "relato",
};

const condition = z.strictObject({
  /** Numeric reading (temperatures, wind, swell…) or a short description (tide, visibility). */
  value: z.union([z.number().min(-100).max(1_000), z.string().trim().min(1).max(120)]),
  unit: z.string().trim().max(12).optional(),
  source: z.enum(CONDITION_SOURCES),
  /** Who measured/informed it (organizer, buoy, forecast service…). */
  sourceName: text(120),
  location: text(120),
  /** When it was measured/informed or the time the forecast refers to. */
  observedAt: z.iso.datetime({ offset: true }).optional(),
});
export type EventCondition = z.infer<typeof condition>;

export const OPEN_WATER_CONDITION_KEYS = ["waterTemperature", "airTemperature", "wind", "swell", "current", "tide", "visibility"] as const;
export const OPEN_WATER_CONDITION_LABELS: Record<(typeof OPEN_WATER_CONDITION_KEYS)[number], string> = {
  waterTemperature: "Temperatura da água",
  airTemperature: "Temperatura do ar",
  wind: "Vento",
  swell: "Ondulação",
  current: "Corrente",
  tide: "Maré",
  visibility: "Visibilidade",
};

// --- Event-level details by family -----------------------------------------

const poolEvent = z.strictObject({
  warmupAvailable: z.boolean().optional(),
  callRoomNotes: text(),
  minutesBetweenRaces: minutes,
});

export const OPEN_WATER_CLASSIFICATIONS = [
  "POINT_TO_POINT", "BUOY_CIRCUIT", "RECREATIONAL", "DISTANCE_COMPETITION", "SUPPORTED_PERSONAL_CHALLENGE", "ULTRA_OR_STAGES", "RELAY", "TRIATHLON_SWIM_LEG",
] as const;
export const OPEN_WATER_CLASSIFICATION_LABELS: Record<(typeof OPEN_WATER_CLASSIFICATIONS)[number], string> = {
  POINT_TO_POINT: "Ponto a ponto",
  BUOY_CIRCUIT: "Circuito de boias com voltas",
  RECREATIONAL: "Recreativo",
  DISTANCE_COMPETITION: "Competição por distância/categoria",
  SUPPORTED_PERSONAL_CHALLENGE: "Desafio pessoal com apoio",
  ULTRA_OR_STAGES: "Ultradistância/etapas",
  RELAY: "Revezamento",
  TRIATHLON_SWIM_LEG: "Etapa aquática de triathlon",
};

const openWaterEvent = z.strictObject({
  water: z.enum(["SALT", "FRESH"]).optional(),
  exposure: text(200),
  conditions: z.strictObject(
    Object.fromEntries(OPEN_WATER_CONDITION_KEYS.map((key) => [key, condition.optional()])) as {
      [K in (typeof OPEN_WATER_CONDITION_KEYS)[number]]: z.ZodOptional<typeof condition>;
    },
  ).optional(),
  /** Operational safety of the event — information, never a "safety certificate". */
  safety: z.strictObject({
    responsible: text(200),
    support: text(),
    communication: text(),
    exitPoints: text(),
    cancellationCriteria: text(),
  }).optional(),
  equipment: z.strictObject({
    /** As written in the edition's regulation; no universal temperature is coded. */
    wetsuitRule: text(),
    signalBuoy: text(200),
    notes: text(),
  }).optional(),
  feeding: z.strictObject({ stations: text(), contactRules: text() }).optional(),
  logistics: z.strictObject({ transport: text(), accreditation: text(), start: text(), rescue: text() }).optional(),
});

const runEvent = z.strictObject({ surface: text(200), aidStations: text() });
const bikeEvent = z.strictObject({ support: text(), feeding: text(), stageDays: z.number().int().positive().max(60).optional() });
const multisportEvent = z.strictObject({
  /** Rules come from the edition's regulation (link + date on the event). */
  draftingRule: text(),
  wetsuitRule: text(),
  bikeAllowed: text(200),
  transitionArea: text(),
  startType: text(200),
});

const EVENT_SCHEMAS = { pool: poolEvent, openWater: openWaterEvent, run: runEvent, bike: bikeEvent, multisport: multisportEvent } as const;

// --- Option-level details by family ----------------------------------------

export const POOL_STROKES = ["FREESTYLE", "BACKSTROKE", "BREASTSTROKE", "BUTTERFLY", "MEDLEY"] as const;
export const POOL_STROKE_LABELS: Record<(typeof POOL_STROKES)[number], string> = {
  FREESTYLE: "Livre", BACKSTROKE: "Costas", BREASTSTROKE: "Peito", BUTTERFLY: "Borboleta", MEDLEY: "Medley",
};

const poolOption = z.strictObject({
  stroke: z.enum(POOL_STROKES).optional(),
  /** 25 m, 50 m, 25 yd or another value — short and long course are never compared or converted. */
  poolLength: z.strictObject({ value: z.number().positive().max(1_000), unit: z.enum(["m", "yd"]) }).optional(),
  timing: z.enum(["MANUAL", "ELECTRONIC"]).optional(),
  start: z.enum(["BLOCK", "WALL", "WATER"]).optional(),
  heatOrFinal: text(60),
  relay: z.boolean().optional(),
});

const openWaterOption = z.strictObject({
  classification: z.enum(OPEN_WATER_CLASSIFICATIONS).optional(),
  laps: z.number().int().positive().max(1_000).optional(),
  buoys: text(200),
  direction: z.enum(["CLOCKWISE", "COUNTERCLOCKWISE", "STRAIGHT"]).optional(),
  start: text(200),
  finish: text(200),
  visualReference: text(200),
});

export const RUN_DISCIPLINES = ["ROAD", "TRACK", "CROSS", "TRAIL", "STAGES"] as const;
const runOption = z.strictObject({
  discipline: z.enum(RUN_DISCIPLINES).optional(),
  elevationLossM: z.number().int().min(0).max(100_000).optional(),
  surface: text(200),
  aidStations: text(),
  trail: z.strictObject({ technicality: text(200), requiredEquipment: text(), autonomy: text() }).optional(),
});

export const BIKE_DISCIPLINES = ["ROAD", "TIME_TRIAL", "MTB", "GRAVEL", "INDOOR", "GRAN_FONDO", "STAGES"] as const;
const bikeOption = z.strictObject({
  discipline: z.enum(BIKE_DISCIPLINES).optional(),
  bikeType: text(120),
  terrain: text(200),
  requiredEquipment: text(),
  /** Electric assistance allowed/used — flagged, never mixed silently with unassisted riding (§15.5). */
  electricAssist: z.boolean().optional(),
});

export const MULTISPORT_SEGMENT_KINDS = ["SWIM", "T1", "BIKE", "T2", "RUN"] as const;
export const MULTISPORT_SEGMENT_LABELS: Record<(typeof MULTISPORT_SEGMENT_KINDS)[number], string> = {
  SWIM: "Natação", T1: "T1", BIKE: "Ciclismo", T2: "T2", RUN: "Corrida",
};
export const MULTISPORT_FORMATS = ["SPRINT", "OLYMPIC", "MIDDLE", "LONG", "CUSTOM"] as const;

const segment = z.strictObject({
  kind: z.enum(MULTISPORT_SEGMENT_KINDS),
  distanceValue: z.number().positive().max(1_000_000).optional(),
  distanceUnit: distanceUnit.optional(),
  cutoffMinutes: minutes,
  notes: text(),
}).superRefine((value, ctx) => {
  if ((value.distanceValue === undefined) !== (value.distanceUnit === undefined)) {
    ctx.addIssue({ code: "custom", path: ["distanceUnit"], message: "Distância do segmento precisa de valor e unidade." });
  }
  if ((value.kind === "T1" || value.kind === "T2") && value.distanceValue !== undefined) {
    ctx.addIssue({ code: "custom", path: ["distanceValue"], message: "Transição não tem distância." });
  }
});

const multisportOption = z.strictObject({
  /** Commercial label only; the distances are the segments. */
  format: z.enum(MULTISPORT_FORMATS).optional(),
  relay: z.boolean().optional(),
  segments: z.array(segment).max(20).optional(),
});

const OPTION_SCHEMAS = { pool: poolOption, openWater: openWaterOption, run: runOption, bike: bikeOption, multisport: multisportOption } as const;

const generic = z.strictObject({ notes: text(1000) });

function parseWith(schema: z.ZodType, raw: Record<string, unknown> | null): Record<string, unknown> | null {
  if (raw === null) return null;
  const { schemaVersion, ...rest } = raw;
  if (schemaVersion !== undefined && schemaVersion !== EVENT_DETAILS_SCHEMA_VERSION) {
    throw new z.ZodError([{ code: "custom", path: ["details", "schemaVersion"], message: "Versão de campos não suportada.", input: schemaVersion }]);
  }
  const parsed = schema.parse(rest) as Record<string, unknown>;
  return Object.keys(parsed).length === 0 ? null : { schemaVersion: EVENT_DETAILS_SCHEMA_VERSION, ...parsed };
}

/** Validates the event's modality fields; unknown keys or another modality's fields are refused. */
export function parseEventDetails(sportType: string, raw: Record<string, unknown> | null): Record<string, unknown> | null {
  const family = eventDetailsFamily(sportType);
  return parseWith(family ? EVENT_SCHEMAS[family].extend({ notes: text(1000) }) : generic, raw);
}

export function parseOptionDetails(sportType: string, raw: Record<string, unknown> | null): Record<string, unknown> | null {
  const family = eventDetailsFamily(sportType);
  return parseWith(family ? OPTION_SCHEMAS[family].extend({ notes: text(1000) }) : generic, raw);
}

// --- Presentation ------------------------------------------------------------

export type DetailRow = { label: string; value: string; provenance: string | null };

const UNKNOWN = "desconhecida";

function formatCondition(value: EventCondition | undefined, timeZone: string): Omit<DetailRow, "label"> {
  if (!value) return { value: UNKNOWN, provenance: null };
  const reading = typeof value.value === "number"
    ? `${value.value.toLocaleString("pt-BR")}${value.unit ? ` ${value.unit}` : ""}`
    : value.value;
  const when = value.observedAt
    ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone }).format(new Date(value.observedAt))
    : null;
  const provenance = [CONDITION_SOURCE_LABELS[value.source], value.sourceName, value.location, when].filter(Boolean).join(", ");
  return { value: reading, provenance };
}

/**
 * Rows for the event detail. For open water every condition is listed —
 * the ones nobody informed read "desconhecida" (AC of SAM-52).
 */
export function describeEventConditions(sportType: string, details: unknown, timeZone: string): DetailRow[] {
  if (eventDetailsFamily(sportType) !== "openWater") return [];
  const conditions = (details as { conditions?: Partial<Record<(typeof OPEN_WATER_CONDITION_KEYS)[number], EventCondition>> } | null)?.conditions ?? {};
  return OPEN_WATER_CONDITION_KEYS.map((key) => ({ label: OPEN_WATER_CONDITION_LABELS[key], ...formatCondition(conditions[key], timeZone) }));
}

/** Multisport segments in order; distances are per segment and never summed across sports. */
export function describeSegments(details: unknown): DetailRow[] {
  const segments = (details as { segments?: Array<z.infer<typeof segment>> } | null)?.segments ?? [];
  return segments.map((item) => ({
    label: MULTISPORT_SEGMENT_LABELS[item.kind],
    value: [
      item.distanceValue !== undefined ? `${item.distanceValue.toLocaleString("pt-BR")} ${item.distanceUnit}` : null,
      item.cutoffMinutes !== undefined ? `corte ${item.cutoffMinutes} min` : null,
    ].filter(Boolean).join(" · ") || "—",
    provenance: null,
  }));
}
