/**
 * SAM-50 — the athlete's level per modality AND environment (§4.1–4.2 of
 * docs/ryvano_treinos_eventos_acompanhamento.md).
 *
 * "Um nadador avançado em piscina pode ser iniciante em mar; um ciclista
 * experiente pode ser iniciante na corrida." So the level is not one value per
 * sheet: it is one row per (canonical modality, environment), assessed by a
 * professional on a date, with the athlete's event experience, recent history
 * and current condition kept apart (historical experience ≠ current state).
 *
 * Never derived from kilometres or hours (§4.2: "Não vincular nível a
 * quantidade fixa de quilômetros ou horas"), and it changes nothing by itself —
 * it is information for the coach's decisions (ADR-010).
 *
 * Rows hang off the technical sheet, so they live in the same coaching
 * relationship (school or independent) and under the same authorization; a
 * second "athlete profile" competing with the sheet is exactly what §26.4
 * forbids.
 */
import { z } from "zod";
import { RYVANO_SPORT_TYPES } from "@/modules/shared/activities/sport-types";

/**
 * Environment / discipline (§4.1 "Ambiente/disciplina"): piscina curta/longa;
 * mar/lago/rio; rua/pista/trail; estrada/MTB/gravel/indoor. A closed list so
 * the same environment is never spelled two ways; OTHER covers the rest with
 * the notes.
 */
export const SPORT_ENVIRONMENTS = [
  "POOL_SHORT", "POOL_LONG", "POOL_OTHER",
  "SEA", "LAKE", "RIVER", "RESERVOIR",
  "ROAD", "TRACK", "TRAIL", "CROSS_COUNTRY", "TREADMILL",
  "ROAD_BIKE", "MTB", "GRAVEL", "INDOOR_BIKE",
  "OTHER",
] as const;
export type SportEnvironment = (typeof SPORT_ENVIRONMENTS)[number];

export const SPORT_ENVIRONMENT_LABELS: Record<SportEnvironment, string> = {
  POOL_SHORT: "Piscina curta (25 m/yd)",
  POOL_LONG: "Piscina longa (50 m)",
  POOL_OTHER: "Piscina (outra medida)",
  SEA: "Mar",
  LAKE: "Lago",
  RIVER: "Rio",
  RESERVOIR: "Represa",
  ROAD: "Rua",
  TRACK: "Pista",
  TRAIL: "Trail",
  CROSS_COUNTRY: "Cross-country",
  TREADMILL: "Esteira",
  ROAD_BIKE: "Estrada",
  MTB: "MTB",
  GRAVEL: "Gravel",
  INDOOR_BIKE: "Indoor",
  OTHER: "Outro",
};

/** §4.2 — Iniciante, Intermediário, Avançado, Profissional/elite. */
export const SPORT_LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "PROFESSIONAL"] as const;
export type SportLevel = (typeof SPORT_LEVELS)[number];

export const SPORT_LEVEL_LABELS: Record<SportLevel, string> = {
  BEGINNER: "Iniciante",
  INTERMEDIATE: "Intermediário",
  ADVANCED: "Avançado",
  PROFESSIONAL: "Profissional/elite",
};

const optionalText = (max: number) =>
  z.string().trim().max(max).nullish().transform((value) => (value && value.length > 0 ? value : null));

export const athleteSportLevelInputSchema = z.strictObject({
  sportType: z.enum(RYVANO_SPORT_TYPES as unknown as [string, ...string[]]),
  environment: z.enum(SPORT_ENVIRONMENTS),
  level: z.enum(SPORT_LEVELS),
  /** Day of the assessment; the assessor is the user who saves it. */
  assessedAt: z.union([z.iso.date(), z.date()]).nullish().transform((value) => (value ? new Date(value) : null)),
  eventExperience: optionalText(1000),
  recentHistory: optionalText(1000),
  /** Current condition, kept apart from historical experience (§4.2). */
  currentCondition: optionalText(1000),
  notes: optionalText(1000),
});

export type AthleteSportLevelInput = z.infer<typeof athleteSportLevelInputSchema>;

/** The whole list a save replaces; one row per (modality, environment). */
export const athleteSportLevelsInputSchema = z.array(athleteSportLevelInputSchema).max(40).superRefine((rows, ctx) => {
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const key = `${row.sportType}:${row.environment}`;
    if (seen.has(key)) {
      ctx.addIssue({ code: "custom", path: [index, "environment"], message: "Esta modalidade e ambiente já têm um nível na ficha." });
    }
    seen.add(key);
  });
});

/** The level fields that matter for the revision trail, in a stable shape. */
export type SportLevelSnapshot = {
  sportType: string;
  environment: string;
  level: string;
  assessedAt: string | null;
};

export function sportLevelSnapshot(rows: ReadonlyArray<{ sportType: string; environment: string; level: string; assessedAt: Date | null }>): SportLevelSnapshot[] {
  return rows
    .map((row) => ({
      sportType: row.sportType,
      environment: row.environment,
      level: row.level,
      assessedAt: row.assessedAt ? row.assessedAt.toISOString().slice(0, 10) : null,
    }))
    .sort((a, b) => `${a.sportType}:${a.environment}`.localeCompare(`${b.sportType}:${b.environment}`));
}

/** True when the set of (modality, environment, level, date) changed. */
export function sportLevelsChanged(before: SportLevelSnapshot[], after: SportLevelSnapshot[]): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}
