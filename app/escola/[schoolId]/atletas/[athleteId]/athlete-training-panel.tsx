"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { StatusBadge } from "@/components/status-badge";
import {
  formatComplianceScore,
  PrescribedVsExecuted,
  SectionTitle,
  WorkoutStructureSection,
  type WorkoutExecutionSummary,
  type WorkoutStructureBlock,
} from "@/components/school/workout-structure";
import { formatDistance, formatDuration } from "@/lib/format";
import {
  ASSIGNMENT_STATUS_LABELS,
  CHANGE_REQUEST_STATUS_LABELS,
} from "@/modules/school/presentation/workout-labels";
import { CancelChangeRequestButton, RequestChangeForm } from "../../professores/coach-actions";

/**
 * Plain, already-formatted data only. Dates arrive as strings formatted on the
 * server: this panel is rendered on both sides, and formatting a timestamp with
 * the browser's time zone would not match the server-rendered HTML.
 */
export type TrainingBlock = WorkoutStructureBlock;

export type TrainingChangeRequest = {
  id: string;
  status: string;
  reason: string;
  resolutionNote: string | null;
  requesterName: string;
  createdLabel: string;
  /** "Resolvida por X em data" — só quando a solicitação foi fechada. */
  resolvedLabel?: string | null;
};

export type TrainingExecution = WorkoutExecutionSummary;

/** SAM-5 — quem prescreveu, quando, e se a prescrição mudou depois disso. */
export type TrainingTraceability = {
  prescribedByName: string | null;
  prescribedLabel: string;
  lastChangedLabel: string | null;
  /** A prescrição foi alterada depois de criada (edição do treino ou adaptação). */
  changedAfterPrescription: boolean;
  version: number;
  events: { label: string; actorName: string | null; dateLabel: string }[];
};

/** SAM-5 — resumo derivado dos blocos (ver `modules/school/presentation/workout-summary`). */
export type TrainingSummary = {
  estimatedDurationSeconds: number | null;
  plannedDistanceMeters: number | null;
  intensityTargets: string[];
  highIntensity: boolean;
};

export type TrainingItem = {
  id: string;
  dateLabel: string;
  title: string;
  sportLabel: string | null;
  status: string;
  overdue: boolean;
  team: string | null;
  coach: { id: string; name: string } | null;
  description: string | null;
  /** Null when the prescription has no structured workout (e.g. a plan session not yet instantiated). */
  blocks: TrainingBlock[] | null;
  sourceLabel: string | null;
  targetDurationSeconds: number | null;
  targetDistanceMeters: number | null;
  execution: TrainingExecution | null;
  changeRequests: TrainingChangeRequest[];
  summary?: TrainingSummary | null;
  traceability?: TrainingTraceability | null;
};

/** Cuidados declarados pelo profissional na ficha técnica desta escola (nota, não diagnóstico). */
export type AthleteSafetyNotes = { restrictions: string; updatedLabel: string } | null;

type Tone = "neutral" | "success" | "warning" | "danger";

const OPEN_REQUEST_STATUSES = new Set(["PENDING", "ACKNOWLEDGED"]);

function statusTone(item: TrainingItem): Tone {
  if (item.overdue) return "warning";
  if (item.status === "COMPLETED" || item.status === "PARTIALLY_COMPLETED") return "success";
  if (item.status === "MISSED") return "danger";
  return "neutral";
}

function statusLabel(item: TrainingItem): string {
  if (item.overdue) return "Atrasado";
  return ASSIGNMENT_STATUS_LABELS[item.status] ?? item.status;
}

function openRequest(item: TrainingItem): TrainingChangeRequest | null {
  return item.changeRequests.find((request) => OPEN_REQUEST_STATUSES.has(request.status)) ?? null;
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-foreground/45">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-semibold text-foreground/90">{value}</dd>
    </div>
  );
}

function summarizeExecution(execution: TrainingExecution): string {
  const parts = [
    execution.distanceMeters != null ? formatDistance(execution.distanceMeters) : null,
    execution.durationSeconds != null ? formatDuration(execution.durationSeconds) : null,
    execution.complianceScore != null ? formatComplianceScore(execution.complianceScore) : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : "Executado";
}

export function AthleteTrainingPanel({
  schoolId,
  items,
  safetyNotes = null,
}: {
  schoolId: string;
  items: TrainingItem[];
  safetyNotes?: AthleteSafetyNotes;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find((item) => item.id === selectedId) ?? null;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-foreground/50">
              <th className="py-3 pr-4 font-medium">Data</th>
              <th className="py-3 pr-4 font-medium">Treino</th>
              <th className="py-3 pr-4 font-medium">Professor</th>
              <th className="py-3 pr-4 font-medium">Situação</th>
              <th className="py-3 pr-4 font-medium">Realizado</th>
              <th className="py-3 font-medium"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {items.map((item) => {
              const pending = openRequest(item);
              return (
                <tr key={item.id} className="align-top transition-colors hover:bg-white/5">
                  <td className="whitespace-nowrap py-3 pr-4 text-xs tabular-nums text-foreground/70">
                    {item.dateLabel}
                  </td>
                  <td className="py-3 pr-4">
                    <span className="font-medium">{item.title}</span>
                    <span className="block text-xs text-foreground/50">
                      {[item.sportLabel, item.team].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-foreground/70">{item.coach?.name ?? "—"}</td>
                  <td className="py-3 pr-4">
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge tone={statusTone(item)}>{statusLabel(item)}</StatusBadge>
                      {pending && (
                        <StatusBadge tone="warning">
                          {`Alteração: ${CHANGE_REQUEST_STATUS_LABELS[pending.status] ?? pending.status}`}
                        </StatusBadge>
                      )}
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-xs text-foreground/70">
                    {item.execution ? summarizeExecution(item.execution) : "—"}
                  </td>
                  <td className="py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      aria-label={`Ver treino ${item.title}`}
                      className="whitespace-nowrap text-xs font-medium text-foreground/70 underline-offset-4 hover:text-foreground hover:underline"
                    >
                      Ver treino
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <Modal title={selected.title} size="lg" onClose={() => setSelectedId(null)}>
          <WorkoutDetail schoolId={schoolId} item={selected} safetyNotes={safetyNotes} />
        </Modal>
      )}
    </>
  );
}

/**
 * SAM-5 — modal de detalhe do treino. Ordem: o essencial primeiro (situação,
 * quando, modalidade, quem prescreveu, quanto), depois orientações, estrutura,
 * cuidados, realizado, rastreabilidade (recolhível) e o pedido de alteração.
 * Só renderiza o que a prescrição realmente tem: nada de campo vazio para
 * preencher espaço.
 */
function WorkoutDetail({
  schoolId,
  item,
  safetyNotes,
}: {
  schoolId: string;
  item: TrainingItem;
  safetyNotes: AthleteSafetyNotes;
}) {
  const hasOpenRequest = openRequest(item) !== null;
  const summary = item.summary ?? null;
  const distance = summary?.plannedDistanceMeters ?? item.targetDistanceMeters;
  const duration = summary?.estimatedDurationSeconds ?? item.targetDurationSeconds;
  const hasBlocks = Boolean(item.blocks && item.blocks.length > 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-foreground/60">
        <StatusBadge tone={statusTone(item)}>{statusLabel(item)}</StatusBadge>
        <span>{item.dateLabel}</span>
        {item.sportLabel && <span>{item.sportLabel}</span>}
        {item.team && <span>Turma: {item.team}</span>}
        {item.traceability?.changedAfterPrescription && (
          <StatusBadge tone="warning">Alterado após a prescrição</StatusBadge>
        )}
      </div>

      {/* Resumo — o que importa antes de treinar. */}
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="workout-summary">
        <SummaryTile label="Professor responsável" value={item.coach?.name ?? "Sem professor"} />
        {distance != null && <SummaryTile label="Distância prevista" value={formatDistance(distance)} />}
        {duration != null && (
          <SummaryTile
            label={summary?.estimatedDurationSeconds != null ? "Tempo estimado" : "Duração prevista"}
            value={formatDuration(duration)}
          />
        )}
        {summary && summary.intensityTargets.length > 0 && (
          <SummaryTile label="Intensidade" value={summary.intensityTargets.slice(0, 3).join(" · ")} />
        )}
      </dl>

      {summary?.highIntensity && (
        <p className="theme-panel-warning rounded-xl border px-3 py-2 text-xs" role="note">
          Treino de intensidade alta. Respeite os intervalos de recuperação e os cuidados registrados
          para este atleta.
        </p>
      )}

      {item.description && (
        <section className="space-y-1">
          <SectionTitle>Orientações do professor</SectionTitle>
          <p className="whitespace-pre-line text-sm text-foreground/80">{item.description}</p>
        </section>
      )}

      {hasBlocks || item.sourceLabel ? (
        <WorkoutStructureSection blocks={item.blocks} sourceLabel={item.sourceLabel} />
      ) : (
        <section className="space-y-2">
          <SectionTitle>Estrutura do treino</SectionTitle>
          <p className="text-sm text-foreground/50">
            O treinador não adicionou blocos detalhados para este treino. Os dados acima são tudo o que
            foi prescrito.
          </p>
        </section>
      )}

      {safetyNotes && (
        <section className="space-y-1.5 rounded-xl border border-white/10 bg-white/5 p-3" data-testid="safety-notes">
          <SectionTitle>Cuidados registrados pelo professor</SectionTitle>
          <p className="whitespace-pre-line text-sm text-foreground/80">{safetyNotes.restrictions}</p>
          <p className="text-xs text-foreground/45">
            Anotação profissional da ficha técnica (atualizada em {safetyNotes.updatedLabel}). Não é
            orientação médica.
          </p>
        </section>
      )}

      {item.execution && (
        <PrescribedVsExecuted
          targetDurationSeconds={item.targetDurationSeconds}
          targetDistanceMeters={item.targetDistanceMeters}
          execution={item.execution}
        />
      )}

      {item.traceability && (
        <details className="rounded-xl border border-white/10 bg-white/5 px-3 py-2" data-testid="traceability">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-foreground/50">
            Rastreabilidade da prescrição
          </summary>
          <dl className="mt-2 space-y-1 text-xs text-foreground/70">
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-foreground/45">Prescrito por</dt>
              <dd>
                {item.traceability.prescribedByName ?? item.coach?.name ?? "—"} · {item.traceability.prescribedLabel}
              </dd>
            </div>
            {item.traceability.lastChangedLabel && (
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-foreground/45">Última alteração</dt>
                <dd>{item.traceability.lastChangedLabel}</dd>
              </div>
            )}
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-foreground/45">Versão</dt>
              <dd>{item.traceability.version + 1}</dd>
            </div>
          </dl>
          {item.traceability.events.length > 0 && (
            <ul className="mt-2 space-y-1 border-t border-white/10 pt-2 text-xs text-foreground/60">
              {item.traceability.events.map((event, index) => (
                <li key={`${event.label}-${index}`}>
                  {event.dateLabel} · {event.label}
                  {event.actorName ? ` · ${event.actorName}` : ""}
                </li>
              ))}
            </ul>
          )}
        </details>
      )}

      <section className="space-y-3 border-t border-white/10 pt-4">
        <SectionTitle>Solicitações de alteração</SectionTitle>
        <p className="text-xs text-foreground/50">
          A escola pede; quem altera a prescrição é o professor responsável. Uma solicitação nunca muda
          o treino por si só.
        </p>

        {item.changeRequests.length > 0 && (
          <ul className="space-y-2">
            {item.changeRequests.map((request) => {
              const isOpen = OPEN_REQUEST_STATUSES.has(request.status);
              return (
                <li key={request.id} className="space-y-1.5 rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <StatusBadge tone={isOpen ? "warning" : "neutral"}>
                      {CHANGE_REQUEST_STATUS_LABELS[request.status] ?? request.status}
                    </StatusBadge>
                    <span className="text-xs text-foreground/45">
                      {request.requesterName} · {request.createdLabel}
                    </span>
                  </div>
                  <p className="text-foreground/75">{request.reason}</p>
                  {request.resolutionNote && (
                    <p className="text-xs text-foreground/55">Resposta: {request.resolutionNote}</p>
                  )}
                  {request.resolvedLabel && (
                    <p className="text-xs text-foreground/45">{request.resolvedLabel}</p>
                  )}
                  {isOpen && <CancelChangeRequestButton schoolId={schoolId} requestId={request.id} />}
                </li>
              );
            })}
          </ul>
        )}

        {item.coach ? (
          <RequestChangeForm
            schoolId={schoolId}
            workoutAssignmentId={item.id}
            hasOpenRequest={hasOpenRequest}
          />
        ) : (
          <p className="text-xs text-foreground/50">
            Este treino não tem professor responsável, então não há a quem pedir alteração.
          </p>
        )}
      </section>
    </div>
  );
}
