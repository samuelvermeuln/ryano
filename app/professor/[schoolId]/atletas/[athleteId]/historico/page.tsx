/**
 * SAM-11 — Histórico do atleta (visão do professor).
 *
 * The interaction trail: prescriptions created and rescheduled, change requests
 * opened and answered, coach evaluations, and the athlete's own feedback.
 *
 * Scope is the athlete's current membership period (`context.periodStart`), and
 * feedback entries additionally depend on `CanReadAthleteHistory`. The screen
 * states both limits: a coach who cannot see an earlier spell — or a withheld
 * feedback — is told that, rather than shown a short trail that looks complete.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import {
  GetCoachAthleteTimeline,
  type TimelineEntryKind,
} from "@/modules/school/application/get-coach-athlete-timeline";
import { SchoolError } from "@/modules/school/domain/errors";
import {
  ASSIGNMENT_EVENT_LABELS,
  CHANGE_REQUEST_STATUS_LABELS,
  TIMELINE_ENTRY_LABELS,
} from "@/modules/school/presentation/workout-labels";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { AthleteHubShell, athleteHubHref, WithheldNotice } from "../athlete-hub-shell";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ schoolId: string; athleteId: string }>;
  searchParams: Promise<{ limite?: string }>;
};

const timeline = new GetCoachAthleteTimeline(prisma);

const KIND_TONES: Record<TimelineEntryKind, "neutral" | "success" | "warning" | "danger"> = {
  "assignment-event": "neutral",
  "change-request": "warning",
  "change-resolution": "success",
  evaluation: "success",
  feedback: "neutral",
};

function dateTimeLabel(value: Date): string {
  return value.toLocaleString("pt-BR", { timeZone: "UTC", dateStyle: "short", timeStyle: "short" });
}

/**
 * `subject` is machine-readable (an event type, a request status, an "RPE 7").
 * Known vocabularies get their label; anything else is shown as itself so a new
 * event type appears in the trail instead of vanishing.
 */
function subjectLabel(kind: TimelineEntryKind, subject: string): string {
  if (kind === "assignment-event") return ASSIGNMENT_EVENT_LABELS[subject] ?? subject;
  if (kind === "change-request" || kind === "change-resolution") {
    return CHANGE_REQUEST_STATUS_LABELS[subject] ?? subject;
  }
  return subject;
}

export default async function AthleteHistoryPage({ params, searchParams }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId, athleteId } = await params;
  const { limite } = await searchParams;

  let data: Awaited<ReturnType<typeof timeline.execute>>;
  try {
    data = await timeline.execute(session.user.id, schoolId, athleteId, limite ? { limit: limite } : {});
  } catch (error) {
    if (error instanceof SchoolError) notFound();
    throw error;
  }

  const { context, entries } = data;

  return (
    <AthleteHubShell
      schoolId={schoolId}
      athlete={context.athlete}
      teams={context.teams}
      currentCoach={context.currentCoach}
      isResponsibleCoach={context.isResponsibleCoach}
      active="historico"
    >
      <WithheldNotice>
        {`Este histórico cobre o vínculo atual do atleta com a escola, a partir de `
          + `${context.periodStart.toLocaleDateString("pt-BR", { timeZone: "UTC" })}. `
          + "Períodos anteriores dependem de autorização de histórico concedida pelo próprio atleta."}
      </WithheldNotice>

      {data.feedbackWithheld > 0 && (
        <WithheldNotice>
          {`${data.feedbackWithheld} feedback(s) do atleta não aparecem nesta trilha: a leitura desse dado `
            + "depende de uma autorização de histórico que cobre a data do treino."}
        </WithheldNotice>
      )}

      <SectionCard
        title="Histórico de interações"
        description="Prescrições, pedidos de alteração, avaliações e feedback, do mais recente ao mais antigo."
      >
        {entries.length === 0 ? (
          <EmptyState
            title="Nenhum evento registrado"
            description="Quando houver prescrições, pedidos de alteração ou avaliações neste vínculo, eles aparecem aqui."
          />
        ) : (
          <>
            <ol className="space-y-3">
              {entries.map((entry) => (
                <li key={`${entry.kind}-${entry.id}`}>
                  <Link
                    href={`${athleteHubHref(schoolId, athleteId, "treinos")}/${entry.assignmentId}`}
                    aria-label={`Abrir treino ${entry.workoutTitle}`}
                    className="flex flex-col gap-1.5 rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 transition-colors hover:bg-white/10 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <span className="min-w-0 space-y-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={KIND_TONES[entry.kind]}>
                          {TIMELINE_ENTRY_LABELS[entry.kind] ?? entry.kind}
                        </StatusBadge>
                        <span className="text-sm font-medium">
                          {subjectLabel(entry.kind, entry.subject)}
                        </span>
                      </span>
                      <span className="block truncate text-xs text-foreground/60">{entry.workoutTitle}</span>
                      {entry.note && (
                        <span className="block whitespace-pre-line text-xs leading-6 text-foreground/65">
                          {entry.note}
                        </span>
                      )}
                      {entry.actorName && (
                        <span className="block text-xs text-foreground/45">por {entry.actorName}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-foreground/45">
                      {dateTimeLabel(entry.occurredAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>

            {data.hasMore && (
              <div className="mt-4">
                <Link
                  href={`${athleteHubHref(schoolId, athleteId, "historico")}?limite=${Math.min(data.limit * 2, 200)}`}
                  className="glass-button inline-block rounded-full px-4 py-2 text-xs font-medium"
                >
                  Carregar mais
                </Link>
              </div>
            )}
          </>
        )}
      </SectionCard>
    </AthleteHubShell>
  );
}
