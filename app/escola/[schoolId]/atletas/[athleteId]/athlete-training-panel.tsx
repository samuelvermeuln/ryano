"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { StatusBadge } from "@/components/status-badge";
import { formatDistance, formatDuration, formatHeartRate, formatPower } from "@/lib/format";
import {
  BLOCK_TYPE_EMOJI,
  BLOCK_TYPE_LABEL,
} from "@/modules/school/presentation/workout-blocks";
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
export type TrainingBlock = {
  id: string;
  blockType: string;
  title: string | null;
  durationS: number | null;
  distanceM: number | null;
  repetitions: number | null;
  targets: string[];
  restTargets: string[];
};

export type TrainingChangeRequest = {
  id: string;
  status: string;
  reason: string;
  resolutionNote: string | null;
  requesterName: string;
  createdLabel: string;
};

export type TrainingExecution = {
  source: string;
  startedLabel: string;
  durationSeconds: number | null;
  distanceMeters: number | null;
  averageHeartRate: number | null;
  averagePower: number | null;
  complianceScore: number | null;
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
    execution.complianceScore != null ? `${(execution.complianceScore / 10).toFixed(1)}/10` : null,
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

function SectionTitle({ children }: { children: string }) {
  return <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/50">{children}</h3>;
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

      <section className="space-y-2">
        <SectionTitle>Estrutura do treino</SectionTitle>
        {item.blocks && item.blocks.length > 0 ? (
          <ol className="space-y-2">
            {item.blocks.map((block, index) => (
              <li key={block.id} className="space-y-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span aria-hidden className="text-base leading-none">
                    {BLOCK_TYPE_EMOJI[block.blockType] ?? "▶"}
                  </span>
                  <span className="text-xs font-semibold text-foreground/80">
                    {block.repetitions && block.repetitions > 1 ? `${block.repetitions}× ` : ""}
                    {block.title ?? BLOCK_TYPE_LABEL[block.blockType] ?? block.blockType}
                  </span>
                  <span className="ml-auto text-xs text-foreground/40">#{index + 1}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-foreground/60">
                  {block.durationS != null && <span>⏱ {formatDuration(block.durationS)}</span>}
                  {block.distanceM != null && <span>📏 {formatDistance(block.distanceM)}</span>}
                </div>
                {block.targets.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {block.targets.map((target) => (
                      <span key={target} className="rounded-lg bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        {target}
                      </span>
                    ))}
                  </div>
                )}
                {block.restTargets.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-foreground/40">Descanso:</span>
                    {block.restTargets.map((target) => (
                      <span key={target} className="rounded-lg bg-white/10 px-2 py-0.5 text-xs text-foreground/60">
                        {target}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-foreground/50">
            {item.sourceLabel
              ? `Sessão do plano “${item.sourceLabel}”. A estrutura detalhada ainda não foi criada para este treino.`
              : "Este treino não tem estrutura detalhada."}
          </p>
        )}
      </section>

      {item.execution && (
        <section className="space-y-2">
          <SectionTitle>Prescrito × Realizado</SectionTitle>
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-xs text-foreground/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Dimensão</th>
                  <th className="px-4 py-2 text-right font-medium">Prescrito</th>
                  <th className="px-4 py-2 text-right font-medium">Realizado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {(item.targetDistanceMeters != null || item.execution.distanceMeters != null) && (
                  <tr>
                    <td className="px-4 py-2 text-foreground/70">Distância</td>
                    <td className="px-4 py-2 text-right text-foreground/70">
                      {item.targetDistanceMeters != null ? formatDistance(item.targetDistanceMeters) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {item.execution.distanceMeters != null ? formatDistance(item.execution.distanceMeters) : "—"}
                    </td>
                  </tr>
                )}
                {(item.targetDurationSeconds != null || item.execution.durationSeconds != null) && (
                  <tr>
                    <td className="px-4 py-2 text-foreground/70">Duração</td>
                    <td className="px-4 py-2 text-right text-foreground/70">
                      {item.targetDurationSeconds != null ? formatDuration(item.targetDurationSeconds) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {item.execution.durationSeconds != null ? formatDuration(item.execution.durationSeconds) : "—"}
                    </td>
                  </tr>
                )}
                {item.execution.averageHeartRate != null && (
                  <tr>
                    <td className="px-4 py-2 text-foreground/70">FC média</td>
                    <td className="px-4 py-2 text-right text-foreground/70">—</td>
                    <td className="px-4 py-2 text-right">{formatHeartRate(item.execution.averageHeartRate)}</td>
                  </tr>
                )}
                {item.execution.averagePower != null && (
                  <tr>
                    <td className="px-4 py-2 text-foreground/70">Potência média</td>
                    <td className="px-4 py-2 text-right text-foreground/70">—</td>
                    <td className="px-4 py-2 text-right">{formatPower(item.execution.averagePower)}</td>
                  </tr>
                )}
                <tr>
                  <td className="px-4 py-2 text-foreground/70">Aderência</td>
                  <td className="px-4 py-2 text-right text-foreground/70">—</td>
                  <td className="px-4 py-2 text-right">
                    {item.execution.complianceScore != null
                      ? `${(item.execution.complianceScore / 10).toFixed(1)}/10`
                      : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-foreground/45">
            Registrado em {item.execution.startedLabel} · origem {item.execution.source}
          </p>
        </section>
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
