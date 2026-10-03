/**
 * SAM-70 — an assessment with its protocol (§18.1).
 *
 * CSS and FTP depend on the protocol, and a value from one vendor is not
 * comparable with another's (§12.3, §15.6), so the result travels with who
 * assessed, how, under which conditions, from which source and with which
 * limitations. Promoting it to the technical sheet is an explicit act of the
 * coach — never automatic — and leaves the trail on the sheet revision.
 * No protocol comes pre-registered: the name is the coach's (§18.4, §26.3).
 */
import { z } from "zod";

import { isValidLocalDate } from "./local-date";

export const ASSESSMENT_REFERENCES = ["FTP", "CSS", "THRESHOLD_PACE", "THRESHOLD_HR", "MAX_HR", "RESTING_HR", "OTHER"] as const;
export type AssessmentReference = (typeof ASSESSMENT_REFERENCES)[number];

export const ASSESSMENT_SOURCES = ["IN_PERSON", "DEVICE", "ESTIMATE"] as const;
export type AssessmentSource = (typeof ASSESSMENT_SOURCES)[number];

export const ASSESSMENT_SOURCE_LABELS: Record<AssessmentSource, string> = {
  IN_PERSON: "Teste presencial",
  DEVICE: "Relógio/fornecedor",
  ESTIMATE: "Estimativa",
};

/** The sheet parameter each reference can be promoted to, with its unit. */
export const ASSESSMENT_REFERENCE_META: Record<AssessmentReference, { label: string; unit: string; field: SheetParameterField | null; time: boolean }> = {
  FTP: { label: "FTP", unit: "W", field: "ftpWatts", time: false },
  CSS: { label: "CSS", unit: "s/100 m", field: "cssSecPer100m", time: true },
  THRESHOLD_PACE: { label: "Ritmo de limiar", unit: "s/km", field: "thresholdPaceSecPerKm", time: true },
  THRESHOLD_HR: { label: "FC de limiar", unit: "bpm", field: "thresholdHeartRate", time: false },
  MAX_HR: { label: "FC máxima", unit: "bpm", field: "maxHeartRate", time: false },
  RESTING_HR: { label: "FC de repouso", unit: "bpm", field: "restingHeartRate", time: false },
  OTHER: { label: "Outro", unit: "", field: null, time: false },
};

export type SheetParameterField = "ftpWatts" | "cssSecPer100m" | "thresholdPaceSecPerKm" | "thresholdHeartRate" | "maxHeartRate" | "restingHeartRate";

/** "1:45" → 105; "250" → 250. */
export function parseResultValue(raw: string): number | null {
  const text = raw.trim().replace(",", ".");
  const clock = /^(\d{1,2}):([0-5]\d)$/.exec(text);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function formatResult(reference: AssessmentReference, value: number, unit: string) {
  const meta = ASSESSMENT_REFERENCE_META[reference];
  if (meta.time) {
    const seconds = Math.round(value);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} ${meta.unit.replace("s/", "/")}`;
  }
  return `${Number(value.toFixed(3)).toLocaleString("pt-BR")} ${unit || meta.unit}`.trim();
}

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional().transform((value) => value || null);
const localDate = z.string().refine((value) => isValidLocalDate(value), "Data inválida.");

export const assessmentInputSchema = z.strictObject({
  sportType: z.string().trim().min(1).max(100),
  environment: optionalText(30),
  assessedLocalDate: localDate,
  protocol: z.string().trim().min(1).max(300),
  protocolCode: optionalText(60),
  assessorName: optionalText(200),
  reference: z.enum(ASSESSMENT_REFERENCES),
  resultValue: z.union([z.number(), z.string()]).transform((value, ctx) => {
    const parsed = typeof value === "number" ? value : parseResultValue(value);
    if (parsed === null || parsed <= 0) {
      ctx.addIssue({ code: "custom", message: "Resultado inválido." });
      return z.NEVER;
    }
    return parsed;
  }),
  resultUnit: optionalText(20),
  conditions: optionalText(1000),
  source: z.enum(ASSESSMENT_SOURCES),
  sourceDetail: optionalText(200),
  limitations: optionalText(1000),
  nextReviewLocalDate: localDate.nullable().optional().or(z.literal("")).transform((value) => value || null),
}).superRefine((value, ctx) => {
  if (value.reference === "OTHER" && !value.resultUnit) {
    ctx.addIssue({ code: "custom", message: "Informe a unidade do resultado.", path: ["resultUnit"] });
  }
}).transform((value) => ({
  ...value,
  resultUnit: value.reference === "OTHER" ? value.resultUnit! : ASSESSMENT_REFERENCE_META[value.reference].unit,
}));
export type AssessmentInput = z.infer<typeof assessmentInputSchema>;

/** "FTP 240 W (avaliação de 10/09/2026)" — how a frozen reference is cited. */
export function citeAssessment(reference: AssessmentReference, value: number, unit: string, assessedLocalDate: string) {
  const [year, month, day] = assessedLocalDate.split("-");
  return `${ASSESSMENT_REFERENCE_META[reference].label} ${formatResult(reference, value, unit)} (avaliação de ${day}/${month}/${year})`;
}
