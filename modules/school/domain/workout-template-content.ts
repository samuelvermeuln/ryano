/**
 * SAM-58 — content and classification of a catalog template (§9.1–9.4 of
 * docs/ryvano_treinos_eventos_acompanhamento.md).
 *
 * The blocks use the SAME format as a prescription (`prescriptionBlockSchema`):
 * one builder, one schema. A version's content is immutable once saved; the
 * summary is computed by `plannedTotals` — distance exact, duration exact or
 * estimated, and the parts without duration are named with the reason.
 */
import { z } from "zod";
import { openWaterSessionSchema } from "./open-water-session";
import { sessionContentV2Schema } from "./session-content-v2";
import { prescriptionBlockSchema } from "./prescription-block";
import { SPORT_ENVIRONMENTS } from "./athlete-sport-level";
import { plannedTotals } from "./workout-structure";

export const TEMPLATE_CONTENT_SCHEMA_VERSION = 1;
export const TEMPLATE_CONTENT_KINDS = ["EXERCISE", "SESSION", "PLAN"] as const;
export const TEMPLATE_CONTENT_KIND_LABELS: Record<(typeof TEMPLATE_CONTENT_KINDS)[number], string> = {
  EXERCISE: "Exercício/educativo", SESSION: "Sessão completa", PLAN: "Conjunto/plano autoral",
};
export const TEMPLATE_LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "PROFESSIONAL"] as const;

const text = (max: number) => z.string().trim().max(max).nullish().transform((value) => (value && value.length > 0 ? value : null));
const tagList = z.array(z.string().trim().min(1).max(40)).max(20).default([]).transform((items) => [...new Set(items.map((item) => item.toLowerCase()))]);

export const templateMetaSchema = z.strictObject({
  title: z.string().trim().min(2, "Informe o título.").max(200),
  code: text(40),
  contentKind: z.enum(TEMPLATE_CONTENT_KINDS).default("SESSION"),
  sportType: z.string().trim().min(1, "Escolha a modalidade.").max(100),
  environment: z.enum(SPORT_ENVIRONMENTS).nullish().transform((value) => value ?? null),
  sessionType: text(80),
  capabilities: tagList,
  level: z.enum(TEMPLATE_LEVELS).nullish().transform((value) => value ?? null),
  phase: text(80),
  tags: tagList,
  folder: text(80),
  description: text(5000),
  status: z.enum(["DRAFT", "ACTIVE"]).default("ACTIVE"),
});
export type TemplateMeta = z.infer<typeof templateMetaSchema>;

const material = z.strictObject({
  url: z.string().trim().url().max(500),
  description: z.string().trim().min(1).max(300),
  /** Who made it (own video, federation, third party…). */
  origin: z.string().trim().min(1).max(200),
  /** Usage rights as the coach declares them (§26.5) — never assumed. */
  usageRights: z.string().trim().min(1).max(200),
});

export const templateContentSchema = z.strictObject({
  objective: text(1000),
  instructions: text(5000),
  blocks: z.array(prescriptionBlockSchema).max(40).default([]),
  recovery: text(1000),
  cooldownNotes: text(1000),
  prerequisites: z.strictObject({
    skills: text(500), equipment: text(500), location: text(300), supervision: text(300), assessments: text(500),
  }).partial().default({}),
  /** ABSOLUTE = values as written; RELATIVE = resolved per athlete at assignment (SAM-60). */
  parametrization: z.enum(["ABSOLUTE", "RELATIVE"]).default("ABSOLUTE"),
  followUp: z.strictObject({ successCriteria: text(500), desiredFeedback: text(500), priorityMetrics: text(300) }).partial().default({}),
  materials: z.array(material).max(10).default([]),
  /** SAM-65 — open-water session context carried by "usar este modelo" (§13.3/§13.6). */
  openWater: openWaterSessionSchema.nullish().transform((value) => value ?? null),
  /** SAM-69 — v2 structure (nested sets, rest positions, send-off, pool unit); the same builder as the prescription. */
  session: sessionContentV2Schema.nullish().transform((value) => value ?? null),
});
export type TemplateContent = z.infer<typeof templateContentSchema>;
type ContentBlock = TemplateContent["blocks"][number];

export type TemplateSummary = {
  durationSeconds: number | null;
  distanceMeters: number | null;
  durationIsPartial: boolean;
  distanceIsPartial: boolean;
  /** "Partes sem duração e motivo" (§9.2). */
  partsWithoutDuration: Array<{ position: number; title: string | null; reason: string }>;
};

/** The block rows `plannedTotals` reads (rest between repetitions in `restPayload.durationS`). */
export function rowsOfContentBlocks(blocks: readonly ContentBlock[]) {
  return blocks.map((block) => ({
    blockType: block.blockType,
    durationS: block.durationS,
    distanceM: block.distanceM,
    repetitions: block.repetitions,
    targetPayload: block.target ?? null,
    restPayload: block.restDurationS ? { durationS: block.restDurationS } : null,
  }));
}

export function summarizeTemplate(content: Pick<TemplateContent, "blocks">): TemplateSummary {
  const totals = plannedTotals(rowsOfContentBlocks(content.blocks));
  return {
    durationSeconds: totals.durationSeconds,
    distanceMeters: totals.distanceMeters,
    durationIsPartial: totals.durationIsPartial,
    distanceIsPartial: totals.distanceIsPartial,
    partsWithoutDuration: content.blocks.flatMap((block, index) => block.durationS
      ? []
      : [{ position: index + 1, title: block.title, reason: block.distanceM ? "duração depende do ritmo de quem executa" : "sem duração nem distância informadas" }]),
  };
}

/** Accent-free, lower-case: "Orientação" and "orientacao" match the same text. */
export function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Free-text search corpus: title, code, tags, capabilities, objective, instructions, block names and the author (§9.3). */
export function templateSearchText(meta: Pick<TemplateMeta, "title" | "code" | "tags" | "capabilities" | "sessionType" | "phase" | "description">, content: Pick<TemplateContent, "objective" | "instructions" | "blocks">, authorName: string | null): string {
  return normalizeSearch([
    meta.title, meta.code, meta.sessionType, meta.phase, meta.description, ...meta.tags, ...meta.capabilities,
    content.objective, content.instructions, ...content.blocks.map((block) => block.title), authorName,
  ].filter(Boolean).join(" ")).slice(0, 20_000);
}

export function searchTerms(query: string): string[] {
  return normalizeSearch(query).split(" ").filter((term) => term.length > 0).slice(0, 8);
}

/**
 * §9.4 "Salvar adaptação individual como modelo": what came from the athlete's
 * individual parameters (absolute heart rate, pace, power) is removed; the
 * relative intensity (zone, RPE), structure and rest stay.
 */
export function blocksWithoutPersonalData(blocks: readonly ContentBlock[]): ContentBlock[] {
  const keepRelative = (target: ContentBlock["target"]) => {
    if (!target) return undefined;
    const relative = Object.fromEntries(Object.entries(target).filter(([key]) => key === "zone" || key === "rpe"));
    return Object.keys(relative).length > 0 ? relative : undefined;
  };
  return blocks.map((block) => ({ ...block, target: keepRelative(block.target), rest: keepRelative(block.rest) }));
}
