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
};

export type TrainingExecution = WorkoutExecutionSummary;

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
};

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

function summarizeExecution(execution: TrainingExecution): string {
  const parts = [
    execution.distanceMeters != null ? formatDistance(execution.distanceMeters) : null,
    execution.durationSeconds != null ? formatDuration(execution.durationSeconds) : null,
    execution.complianceScore != null ? formatComplianceScore(execution.complianceScore) : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : "Executado";
}

export function AthleteTrainingPanel({ schoolId, items }: { schoolId: string; items: TrainingItem[] }) {
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
          <WorkoutDetail schoolId={schoolId} item={selected} />
        </Modal>
      )}
    </>
  );
}

function WorkoutDetail({ schoolId, item }: { schoolId: string; item: TrainingItem }) {
  const hasOpenRequest = openRequest(item) !== null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-foreground/60">
        <StatusBadge tone={statusTone(item)}>{statusLabel(item)}</StatusBadge>
        <span>{item.dateLabel}</span>
        {item.sportLabel && <span>{item.sportLabel}</span>}
        {item.coach && <span>Professor: {item.coach.name}</span>}
        {item.team && <span>Turma: {item.team}</span>}
        {item.targetDurationSeconds != null && <span>⏱ {formatDuration(item.targetDurationSeconds)}</span>}
        {item.targetDistanceMeters != null && <span>📏 {formatDistance(item.targetDistanceMeters)}</span>}
      </div>

      {item.description && (
        <section className="space-y-1">
          <SectionTitle>Descrição</SectionTitle>
          <p className="whitespace-pre-line text-sm text-foreground/80">{item.description}</p>
        </section>
      )}

      <WorkoutStructureSection blocks={item.blocks} sourceLabel={item.sourceLabel} />

      {item.execution && (
        <PrescribedVsExecuted
          targetDurationSeconds={item.targetDurationSeconds}
          targetDistanceMeters={item.targetDistanceMeters}
          execution={item.execution}
        />
      )}

      <section className="space-y-3 border-t border-white/10 pt-4">
        <SectionTitle>Solicitações de alteração</SectionTitle>
        <p className="text-xs text-foreground/50">
          A escola pede; quem altera a prescrição é o professor responsável.
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
