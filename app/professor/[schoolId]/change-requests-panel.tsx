"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { StatusBadge } from "@/components/status-badge";
import { decideWorkoutChangeAsCoachAction, type CoachActionState } from "./actions";

export type ChangeRequestRow = {
  id: string;
  reason: string;
  status: string;
  createdAt: string;
  athleteName: string;
  workoutTitle: string;
  scheduledAt: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Aguardando você",
  ACKNOWLEDGED: "Você assumiu",
};

/**
 * Pending change requests addressed to this coach.
 *
 * Both open states are shown, not just PENDING: ACKNOWLEDGED means the coach
 * said "I'm on it" but has not resolved it yet, so hiding it would make the
 * request vanish from the only screen that still owes work on it.
 */
export function ChangeRequestsPanel({
  schoolId,
  requests,
}: {
  schoolId: string;
  requests: ChangeRequestRow[];
}) {
  return (
    <ul className="space-y-3">
      {requests.map((request) => (
        <li key={request.id} className="glass rounded-[20px] p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium">{request.workoutTitle}</p>
              <p className="text-xs text-foreground/50">
                {request.athleteName}
                {request.scheduledAt ? ` · ${request.scheduledAt}` : ""}
              </p>
            </div>
            <StatusBadge tone={request.status === "PENDING" ? "warning" : "neutral"}>
              {STATUS_LABEL[request.status] ?? request.status}
            </StatusBadge>
          </div>

          <p className="text-xs leading-relaxed text-foreground/70">
            &ldquo;{request.reason}&rdquo;
          </p>

          <DecisionForm schoolId={schoolId} requestId={request.id} status={request.status} />
        </li>
      ))}
    </ul>
  );
}

function DecisionForm({
  schoolId,
  requestId,
  status,
}: {
  schoolId: string;
  requestId: string;
  status: string;
}) {
  const [state, formAction] = useActionState<CoachActionState, FormData>(
    decideWorkoutChangeAsCoachAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-2 border-t border-white/8 pt-3">
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="requestId" value={requestId} />
      <input
        name="resolutionNote"
        type="text"
        maxLength={2000}
        placeholder="Observação (opcional)"
        aria-label="Observação"
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs outline-none focus:border-white/25"
      />
      {state.message && <p role="alert" className="text-xs text-destructive">{state.message}</p>}
      <div className="flex flex-wrap gap-2">
        {/* "Assumir" only makes sense while still PENDING — re-acknowledging an
            already-acknowledged request is rejected by the domain transition. */}
        {status === "PENDING" && (
          <SubmitButton
            name="status"
            value="ACKNOWLEDGED"
            pendingLabel="Assumindo…"
            className="glass-button rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          >
            Assumir
          </SubmitButton>
        )}
        <SubmitButton
          name="status"
          value="RESOLVED"
          pendingLabel="Concluindo…"
          className="rounded-full bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-50"
        >
          Concluí o ajuste
        </SubmitButton>
        <SubmitButton
          name="status"
          value="DECLINED"
          pendingLabel="Recusando…"
          className="rounded-full bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/30 disabled:opacity-50"
        >
          Recusar
        </SubmitButton>
      </div>
    </form>
  );
}
