/**
 * SAM-66 — the result of one prova (§5.3, §12.6, §16.6, AC25).
 *
 * - Finished, did not start, did not finish, disqualified, event cancelled or
 *   pending; abandoning keeps the effort recorded (nothing here touches
 *   activities, so they stay in the load history).
 * - Official and reported times coexist, each with its origin.
 * - The goal is shown next to the result without an automatic "sucesso" or
 *   "fracasso": a personal best alone does not prove the preparation, a slower
 *   time also needs context (§12.6).
 */
import { z } from "zod";

export const RESULT_STATUSES = ["FINISHED", "DNS", "DNF", "DSQ", "EVENT_CANCELLED", "PENDING"] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];
export const RESULT_STATUS_LABELS: Record<ResultStatus, string> = {
  FINISHED: "Concluiu",
  DNS: "Não largou",
  DNF: "Abandonou",
  DSQ: "Desclassificado",
  EVENT_CANCELLED: "Evento cancelado",
  PENDING: "Resultado pendente",
};

export const SPLIT_KINDS = ["SEGMENT", "TRANSITION", "SPLIT", "REACTION"] as const;
export const splitSchema = z.strictObject({
  label: z.string().trim().min(1).max(60),
  seconds: z.number().min(0).max(7 * 24 * 3600),
  kind: z.enum(SPLIT_KINDS).default("SPLIT"),
});

const text = (max: number) => z.string().trim().max(max).nullish().transform((value) => (value ? value : null));
const seconds = z.number().int().min(1).max(7 * 24 * 3600).nullish().transform((value) => value ?? null);

export const participationResultInputSchema = z.strictObject({
  status: z.enum(RESULT_STATUSES),
  officialTimeSeconds: seconds,
  /** Where the official time came from (organizer's results page, timing company…). */
  officialTimeSource: text(200),
  reportedTimeSeconds: seconds,
  placement: text(120),
  category: text(120),
  splits: z.array(splitSchema).max(40).default([]),
  abandonSegment: text(120),
  abandonReason: text(1000),
  feedingReport: text(1000),
  strategyExecution: text(2000),
  dayConditions: text(1000),
  officialResultUrl: z.string().trim().url().max(500).nullish().transform((value) => value ?? null),
  /** The athlete's own perception — only the athlete writes it (AC24). */
  athletePerception: text(2000),
}).superRefine((input, ctx) => {
  const finished = input.status === "FINISHED" || input.status === "DSQ";
  if (!finished && (input.officialTimeSeconds !== null || input.reportedTimeSeconds !== null)) {
    ctx.addIssue({ code: "custom", path: ["officialTimeSeconds"], message: "Tempo final só para quem concluiu (ou foi desclassificado após concluir)." });
  }
  if (input.officialTimeSeconds !== null && !input.officialTimeSource) {
    ctx.addIssue({ code: "custom", path: ["officialTimeSource"], message: "Informe a origem do tempo oficial." });
  }
  if (input.status !== "DNF" && (input.abandonSegment || input.abandonReason)) {
    ctx.addIssue({ code: "custom", path: ["abandonSegment"], message: "Segmento e motivo de abandono só para quem abandonou." });
  }
});
export type ParticipationResultInput = z.infer<typeof participationResultInputSchema>;

/** "1:02:03" or "62:03" or "45" (minutes) → seconds; null when empty or unreadable. */
export function parseDurationText(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
  if (parts.length === 1) return Math.round(parts[0]! * 60);
  if (parts.length === 2) return Math.round(parts[0]! * 60 + parts[1]!);
  if (parts.length === 3) return Math.round(parts[0]! * 3600 + parts[1]! * 60 + parts[2]!);
  return null;
}

export function formatResultTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.round(totalSeconds % 60);
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

export const RESULT_CONTEXT_NOTE = "Um recorde pessoal não comprova sozinho a preparação; um tempo pior também exige contexto.";

/** Goal × result, side by side, never labelled success/failure (§12.6). */
export function goalVersusResult(goalText: string | null, result: { status: string; officialTimeSeconds: number | null; reportedTimeSeconds: number | null } | null) {
  const status = result ? RESULT_STATUS_LABELS[result.status as ResultStatus] ?? result.status : "Resultado ainda não registrado";
  const time = result?.officialTimeSeconds
    ? ` em ${formatResultTime(result.officialTimeSeconds)} (oficial)`
    : result?.reportedTimeSeconds ? ` em ${formatResultTime(result.reportedTimeSeconds)} (relatado)` : "";
  return { goal: goalText ?? "Sem objetivo registrado", result: `${status}${time}`, note: RESULT_CONTEXT_NOTE };
}
