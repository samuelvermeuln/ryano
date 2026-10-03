/**
 * SAM-80 — the product's own indicators (§24.1): use and reliability of the
 * platform, each with its definition, numerator, denominator and period on
 * the screen. Aggregates only — no coach or athlete is named, and nothing
 * here ranks people. Pure: rows in, indicators out.
 */
export type Period = { from: Date; to: Date };

export type IndicatorView = {
  key: string;
  title: string;
  definition: string;
  numerator: string;
  denominator: string;
  value: string;
  /** Raw numbers behind the value, for the tests and the tooltip. */
  numbers: Record<string, number | null>;
};

const pct = (part: number, whole: number) => (whole === 0 ? null : Math.round((1000 * part) / whole) / 10);
const fmtPct = (value: number | null) => (value === null ? "sem dados" : `${value.toLocaleString("pt-BR")}%`);
const hours = (seconds: number) => `${(seconds / 3600).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;

/** Median and 90th percentile of a sample (nearest-rank). */
export function quantiles(values: number[]) {
  if (values.length === 0) return { median: null, p90: null };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]!;
  return { median: at(0.5), p90: at(0.9) };
}

export type PreparationRow = { createdAt: Date; startedAt: Date | null; status: string; coachId: string | null; firstReviewLocalDate: string | null };
export type BatchRow = { createdAt: Date; updatedAt: Date; templateId: string | null; recipients: Array<{ status: string; overrides: unknown }> };
export type WorkoutRow = { templateId: string | null };
export type UnplannedRow = { noticed: boolean; linkedLater: boolean; reportedByAthlete: boolean };
export type ImportRow = { duplicates: number; failedWebhooks: number; failedPushes: number; failedRecipients: number; totalRecipients: number };
export type ParticipationRow = { eventPassed: boolean; hasResult: boolean; hasReview: boolean };

/** 1 — time from event registration to the first professional analysis (preparation started). */
export function timeToFirstAnalysis(rows: PreparationRow[]): IndicatorView {
  const analysed = rows.filter((row) => row.startedAt !== null);
  const seconds = analysed.map((row) => Math.max(0, (row.startedAt!.getTime() - row.createdAt.getTime()) / 1000));
  const { median, p90 } = quantiles(seconds);
  return {
    key: "first-analysis", title: "Tempo até a primeira análise",
    definition: "Do cadastro do evento até o professor assumir o acompanhamento (início da preparação).",
    numerator: "soma dos tempos das preparações iniciadas no período", denominator: "preparações iniciadas no período",
    value: median === null ? "sem dados" : `mediana ${hours(median)} · p90 ${hours(p90!)} (n=${analysed.length})`,
    numbers: { medianSeconds: median, p90Seconds: p90, analysed: analysed.length, registered: rows.length },
  };
}

/** 2 — share of open follow-ups with a responsible coach and with a next review date. */
export function followUpsCovered(rows: PreparationRow[]): IndicatorView {
  const open = rows.filter((row) => row.status !== "CLOSED");
  const withCoach = open.filter((row) => row.coachId !== null).length;
  const withReview = open.filter((row) => row.coachId !== null && row.firstReviewLocalDate !== null).length;
  return {
    key: "follow-ups", title: "Acompanhamentos com responsável e próxima revisão",
    definition: "Entre os acompanhamentos abertos, quantos têm professor responsável e, destes, quantos têm data de próxima revisão.",
    numerator: "abertos com responsável / abertos com responsável e revisão marcada", denominator: "acompanhamentos abertos",
    value: `${fmtPct(pct(withCoach, open.length))} com responsável · ${fmtPct(pct(withReview, open.length))} com revisão marcada (n=${open.length})`,
    numbers: { open: open.length, withCoach, withReview, coachPct: pct(withCoach, open.length), reviewPct: pct(withReview, open.length) },
  };
}

/** 3 — time to assign a session to a class: batch created → last recipient settled. */
export function timeToAssignBatch(rows: BatchRow[]): IndicatorView {
  const seconds = rows.map((row) => Math.max(0, (row.updatedAt.getTime() - row.createdAt.getTime()) / 1000));
  const { median, p90 } = quantiles(seconds);
  return {
    key: "batch-time", title: "Tempo de atribuição em turma",
    definition: "Da criação do lote de atribuição até a última atualização dos destinatários (publicação concluída).",
    numerator: "soma dos tempos dos lotes", denominator: "lotes publicados no período",
    value: median === null ? "sem dados" : `mediana ${Math.round(median)} s · p90 ${Math.round(p90!)} s (n=${rows.length})`,
    numbers: { medianSeconds: median, p90Seconds: p90, batches: rows.length },
  };
}

/** 4 — catalog use and the share of individual adaptations inside batches. */
export function catalogUsage(workouts: WorkoutRow[], batches: BatchRow[]): IndicatorView {
  const fromCatalog = workouts.filter((row) => row.templateId !== null).length;
  const recipients = batches.flatMap((row) => row.recipients);
  const adapted = recipients.filter((row) => row.overrides && typeof row.overrides === "object" && Object.keys(row.overrides as object).length > 0).length;
  return {
    key: "catalog", title: "Uso do catálogo e adaptações",
    definition: "Prescrições criadas a partir de um modelo do catálogo, e destinatários de lote com adaptação individual (data ou instrução própria).",
    numerator: "prescrições com modelo / destinatários adaptados", denominator: "prescrições publicadas / destinatários de lote",
    value: `${fmtPct(pct(fromCatalog, workouts.length))} das prescrições vêm do catálogo (n=${workouts.length}) · ${fmtPct(pct(adapted, recipients.length))} dos destinatários adaptados (n=${recipients.length})`,
    numbers: { workouts: workouts.length, fromCatalog, catalogPct: pct(fromCatalog, workouts.length), recipients: recipients.length, adapted, adaptedPct: pct(adapted, recipients.length) },
  };
}

/** 5 — unplanned activities shown to a coach × effectively handled (linked later or reported by the athlete). */
export function extrasReviewed(rows: UnplannedRow[]): IndicatorView {
  const visible = rows.filter((row) => row.noticed).length;
  const handled = rows.filter((row) => row.noticed && (row.linkedLater || row.reportedByAthlete)).length;
  return {
    key: "extras", title: "Atividades extras visíveis × tratadas",
    definition: "Atividades fora do plano que geraram aviso ao professor e que depois foram ligadas a uma sessão ou relatadas pelo aluno.",
    numerator: "extras tratadas", denominator: "extras com aviso ao professor",
    value: `${fmtPct(pct(handled, visible))} (${handled} de ${visible})`,
    numbers: { visible, handled, pct: pct(handled, visible) },
  };
}

/** 6 — import and publication failures or duplicates. */
export function importAndPublishFailures(row: ImportRow): IndicatorView {
  const failures = row.failedWebhooks + row.failedPushes + row.failedRecipients;
  return {
    key: "failures", title: "Falhas e duplicidades de importação/publicação",
    definition: "Atividades marcadas como espelho/reimportação, eventos de webhook com falha, envios ao relógio com falha e destinatários de lote com falha ou bloqueio.",
    numerator: "falhas (webhook + relógio + lote) e duplicidades", denominator: "destinatários de lote no período (para a taxa de lote)",
    value: `${row.duplicates} duplicidade(s) · ${row.failedWebhooks} webhook(s) · ${row.failedPushes} envio(s) ao relógio · ${row.failedRecipients} destinatário(s) (${fmtPct(pct(row.failedRecipients, row.totalRecipients))} do lote)`,
    numbers: { duplicates: row.duplicates, failures, failedRecipientsPct: pct(row.failedRecipients, row.totalRecipients) },
  };
}

/** 7 — past events with a recorded result and with a post-event review. */
export function eventsClosed(rows: ParticipationRow[]): IndicatorView {
  const passed = rows.filter((row) => row.eventPassed);
  const withResult = passed.filter((row) => row.hasResult).length;
  const withReview = passed.filter((row) => row.hasReview).length;
  return {
    key: "events", title: "Eventos com resultado e parecer",
    definition: "Entre as participações cujo evento já passou, quantas têm resultado registrado e quantas têm parecer pós-evento do professor.",
    numerator: "com resultado / com parecer", denominator: "participações de eventos já realizados",
    value: `${fmtPct(pct(withResult, passed.length))} com resultado · ${fmtPct(pct(withReview, passed.length))} com parecer (n=${passed.length})`,
    numbers: { passed: passed.length, withResult, withReview, resultPct: pct(withResult, passed.length), reviewPct: pct(withReview, passed.length) },
  };
}
