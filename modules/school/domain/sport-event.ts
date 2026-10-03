/**
 * SAM-51 — sports event, its distance/stage options and the athlete's
 * participation (§5.1–5.3, §5.5, §21.5 of
 * docs/ryvano_treinos_eventos_acompanhamento.md).
 *
 * Three things the document keeps apart and so does this model:
 * - **Evento**: the race or meeting (name, edition, place, organizer, date).
 *   Twenty athletes in one event share ONE event row.
 * - **Opção**: a distance, stage, heat or segment of that event.
 * - **Participação**: one athlete's intention (option, status, the priority
 *   the athlete suggested and the one agreed with the coach, availability…).
 * The coach's work around a participation (responsible, phases, milestones)
 * is the preparation — SAM-54 — not here.
 *
 * Dates (§21.5): a whole-day event is a LOCAL date "YYYY-MM-DD" in the event's
 * IANA zone, never midnight UTC; a start time, when known, is an instant plus
 * that zone. A start time "a confirmar" is not invented, and a date not yet
 * confirmed gets no exact countdown.
 */
import { z } from "zod";
import { RYVANO_SPORT_TYPES } from "@/modules/shared/activities/sport-types";
import { SPORT_ENVIRONMENTS } from "./athlete-sport-level";
import { isValidLocalDate, isValidTimeZone, todayLocalDate, type LocalDate } from "./local-date";

export const SPORT_EVENT_TYPES = ["COMPETITION", "ORGANIZED_CROSSING", "PERSONAL_CHALLENGE", "RECREATIONAL", "SIMULATION", "ASSESSMENT"] as const;
export const SPORT_EVENT_TYPE_LABELS: Record<(typeof SPORT_EVENT_TYPES)[number], string> = {
  COMPETITION: "Competição",
  ORGANIZED_CROSSING: "Travessia organizada",
  PERSONAL_CHALLENGE: "Desafio pessoal",
  RECREATIONAL: "Evento recreativo",
  SIMULATION: "Simulado",
  ASSESSMENT: "Avaliação",
};

export const SPORT_EVENT_STATUSES = ["PLANNED", "CONFIRMED", "POSTPONED", "CANCELLED"] as const;
export const SPORT_EVENT_STATUS_LABELS: Record<(typeof SPORT_EVENT_STATUSES)[number], string> = {
  PLANNED: "Previsto", CONFIRMED: "Confirmado", POSTPONED: "Adiado", CANCELLED: "Cancelado",
};
export const SPORT_EVENT_ORIGINS = ["ATHLETE", "COACH", "SCHOOL", "SHARED_CATALOG"] as const;
/** PRIVATE = only its creator and the athletes/coaches of its participations; never enters a public catalog by itself (§5.2). */
export const SPORT_EVENT_VISIBILITIES = ["PRIVATE", "SCHOOL", "PUBLIC"] as const;
export const START_TIME_STATUSES = ["CONFIRMED", "TO_BE_CONFIRMED"] as const;
export const DISTANCE_UNITS = ["m", "km", "yd", "mi"] as const;

export const PARTICIPATION_STATUSES = ["INTEREST", "PLANNED", "REGISTERED", "CANCELLED", "ATTENDED"] as const;
export const PARTICIPATION_STATUS_LABELS: Record<(typeof PARTICIPATION_STATUSES)[number], string> = {
  INTEREST: "Interesse", PLANNED: "Participação planejada", REGISTERED: "Inscrito", CANCELLED: "Participação cancelada", ATTENDED: "Comparecimento confirmado",
};
export const EVENT_PRIORITIES = ["MAIN", "SECONDARY", "EXPERIENCE"] as const;
export const EVENT_PRIORITY_LABELS: Record<(typeof EVENT_PRIORITIES)[number], string> = {
  MAIN: "Principal", SECONDARY: "Secundária", EXPERIENCE: "Experiência",
};

const optionalText = (max: number) =>
  z.string().trim().max(max).nullish().transform((value) => (value && value.length > 0 ? value : null));
const optionalUrl = z.string().trim().url().max(500).nullish().transform((value) => value ?? null);
const localDate = z.string().refine((value) => isValidLocalDate(value), "Data inválida (AAAA-MM-DD).");

export const sportEventOptionInputSchema = z.strictObject({
  label: z.string().trim().min(1, "Informe a distância ou etapa.").max(120),
  distanceValue: z.number().positive().max(1_000_000).nullish().transform((value) => value ?? null),
  distanceUnit: z.enum(DISTANCE_UNITS).nullish().transform((value) => value ?? null),
  /** Segment, stage, heat or final — free text the organizer uses. */
  segment: optionalText(120),
  /** Cut-off: total and per stage, plus where it starts counting (§5.2 "Cortes"). */
  cutoffTotalMinutes: z.number().int().positive().max(100_000).nullish().transform((value) => value ?? null),
  cutoffNotes: optionalText(500),
  courseUrl: optionalUrl,
  elevationGainM: z.number().int().min(0).max(100_000).nullish().transform((value) => value ?? null),
  /** Per-modality fields, validated by SAM-52. */
  details: z.record(z.string(), z.unknown()).nullish().transform((value) => value ?? null),
}).superRefine((option, ctx) => {
  if ((option.distanceValue === null) !== (option.distanceUnit === null)) {
    ctx.addIssue({ code: "custom", path: ["distanceUnit"], message: "Distância precisa de valor e unidade." });
  }
});

export const sportEventInputSchema = z.strictObject({
  name: z.string().trim().min(2, "Informe o nome do evento.").max(200),
  edition: optionalText(60),
  type: z.enum(SPORT_EVENT_TYPES),
  sportType: z.enum(RYVANO_SPORT_TYPES as unknown as [string, ...string[]]),
  environment: z.enum(SPORT_ENVIRONMENTS).nullish().transform((value) => value ?? null),
  startLocalDate: localDate,
  endLocalDate: localDate.nullish().transform((value) => value ?? null),
  /** False = the organizer has not confirmed the date yet: draft, no exact countdown (§5.5). */
  dateConfirmed: z.boolean().default(true),
  /** "HH:mm" in the event zone, only when the organizer confirmed it. */
  startTimeLocal: z.string().regex(/^\d{2}:\d{2}$/).nullish().transform((value) => value ?? null),
  timeZone: z.string().refine((value) => isValidTimeZone(value), "Fuso horário inválido."),
  city: optionalText(120),
  venue: optionalText(300),
  organizer: optionalText(200),
  officialUrl: optionalUrl,
  regulationUrl: optionalUrl,
  regulationConsultedOn: localDate.nullish().transform((value) => value ?? null),
  regulationVersion: optionalText(60),
  status: z.enum(SPORT_EVENT_STATUSES).default("PLANNED"),
  visibility: z.enum(SPORT_EVENT_VISIBILITIES).default("PRIVATE"),
  details: z.record(z.string(), z.unknown()).nullish().transform((value) => value ?? null),
}).superRefine((event, ctx) => {
  if (event.endLocalDate && event.endLocalDate < event.startLocalDate) {
    ctx.addIssue({ code: "custom", path: ["endLocalDate"], message: "O fim não pode ser antes do início." });
  }
  if (event.startTimeLocal && !event.dateConfirmed) {
    ctx.addIssue({ code: "custom", path: ["startTimeLocal"], message: "Horário de largada só com a data confirmada." });
  }
});

export type SportEventInput = z.infer<typeof sportEventInputSchema>;
export type SportEventOptionInput = z.infer<typeof sportEventOptionInputSchema>;

const participationFields = {
  category: optionalText(120),
  relayRole: optionalText(120),
  /** First textual goal; structured desired × agreed goals are SAM-53. */
  goalText: optionalText(2000),
  availabilityUntilEvent: optionalText(1000),
  travelNotes: optionalText(1000),
  /** Proof of registration (link). Marking presence here is NOT registration with the organizer (§5.3). */
  registrationProofUrl: optionalUrl,
};

export const participationInputSchema = z.strictObject({
  status: z.enum(PARTICIPATION_STATUSES).default("PLANNED"),
  suggestedPriority: z.enum(EVENT_PRIORITIES).default("MAIN"),
  ...participationFields,
});
export type ParticipationInput = z.infer<typeof participationInputSchema>;

/**
 * Fields an update may change, with the version the caller read. Built
 * without defaults on purpose: a partial patch must never "change" a field
 * the caller did not send (zod keeps defaults under `.partial()`).
 */
export const participationPatchSchema = z.strictObject({
  status: z.enum(PARTICIPATION_STATUSES).optional(),
  suggestedPriority: z.enum(EVENT_PRIORITIES).optional(),
  ...Object.fromEntries(Object.entries(participationFields).map(([key, schema]) => [key, schema.optional()])) as {
    [K in keyof typeof participationFields]: z.ZodOptional<(typeof participationFields)[K]>;
  },
  optionId: z.string().min(1).max(256).nullish(),
  agreedPriority: z.enum(EVENT_PRIORITIES).nullish(),
  expectedVersion: z.number().int().min(1),
  reason: optionalText(500),
});

/** Name/date/place key used to suggest that an event already exists (§5.2). */
export function eventDuplicateKey(event: { name: string; startLocalDate: string; city: string | null }): string {
  const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
  return `${normalize(event.name)}|${event.startLocalDate}|${normalize(event.city ?? "")}`;
}

/**
 * Days until the event in ITS zone (§2.2 "calcular dias até a prova"); null
 * when the date is not confirmed (no exact countdown, §5.5). Negative = past.
 */
export function daysUntilEvent(event: { startLocalDate: LocalDate; dateConfirmed: boolean; timeZone: string }, now: Date): number | null {
  if (!event.dateConfirmed) return null;
  const today = todayLocalDate(now, event.timeZone);
  const toUtcDay = (value: string) => Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)));
  return Math.round((toUtcDay(event.startLocalDate) - toUtcDay(today)) / 86_400_000);
}

export function isPastEvent(event: { startLocalDate: LocalDate; endLocalDate: LocalDate | null; timeZone: string }, now: Date): boolean {
  return (event.endLocalDate ?? event.startLocalDate) < todayLocalDate(now, event.timeZone);
}

/** Field → { from, to } for the participation/event fields that differ (revision rows). */
export function diffFields(previous: Record<string, unknown>, next: Record<string, unknown>): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) continue;
    const before = previous[key] instanceof Date ? (previous[key] as Date).toISOString() : previous[key] ?? null;
    const after = value instanceof Date ? value.toISOString() : value ?? null;
    if (JSON.stringify(before) !== JSON.stringify(after)) changes[key] = { from: before, to: after };
  }
  return changes;
}

/** Changes that ask the responsible coach to review goals and future sessions (§5.5, AC04). */
export const REVIEW_TRIGGERING_FIELDS = ["optionId", "startLocalDate", "endLocalDate", "goalText", "status", "courseUrl"] as const;
