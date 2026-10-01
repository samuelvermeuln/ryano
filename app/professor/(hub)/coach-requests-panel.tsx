"use client";

import { useActionState, useState } from "react";

import { StatusBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { UserAvatar } from "@/components/user-avatar";
import {
  acceptCoachRequestAction,
  rejectCoachRequestAction,
  type CoachRequestActionState,
} from "./coach-requests-actions";

export type CoachRequestRow = {
  id: string;
  athleteName: string;
  athleteEmail: string;
  athleteImage: string | null;
  schoolId: string | null;
  schoolName: string | null;
  note: string | null;
  requestedAt: string;
  canAccept: boolean;
  blockedReason: string | null;
};

function waitingLabel(since: string): string {
  const days = Math.floor((Date.now() - new Date(since).getTime()) / 86_400_000);
  if (days <= 0) return "hoje";
  if (days === 1) return "há 1 dia";
  return `há ${days} dias`;
}

/**
 * SAM-26 — pending requests from athletes who want this coach to follow them.
 * Accept and reject live in one component so a failure shows next to the row
 * it belongs to; rejecting asks for confirmation because the athlete cannot
 * undo it from their side.
 */
export function CoachRequestsPanel({ requests }: { requests: CoachRequestRow[] }) {
  return (
    <ul className="space-y-3">
      {requests.map((request) => (
        <li key={request.id} data-testid="coach-request" className="glass space-y-3 rounded-[20px] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <UserAvatar name={request.athleteName} image={request.athleteImage} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{request.athleteName}</p>
                <p className="truncate text-xs text-foreground/50">{request.athleteEmail}</p>
                <p className="mt-0.5 text-xs text-foreground/40">Pediu {waitingLabel(request.requestedAt)}</p>
              </div>
            </div>
            <StatusBadge tone={request.schoolId ? "neutral" : "success"}>
              {request.schoolName ? `Na escola ${request.schoolName}` : "Independente"}
            </StatusBadge>
          </div>

          {request.note ? (
            <p className="text-xs leading-relaxed text-foreground/70">&ldquo;{request.note}&rdquo;</p>
          ) : null}

          <Decision request={request} />
        </li>
      ))}
    </ul>
  );
}

function Decision({ request }: { request: CoachRequestRow }) {
  const [acceptState, acceptForm] = useActionState<CoachRequestActionState, FormData>(acceptCoachRequestAction, {});
  const [rejectState, rejectForm] = useActionState<CoachRequestActionState, FormData>(rejectCoachRequestAction, {});
  const [confirming, setConfirming] = useState(false);
  const message = acceptState.message ?? rejectState.message;

  return (
    <div className="space-y-2 border-t border-white/8 pt-3">
      <div className="flex flex-wrap items-center gap-3">
        <form action={acceptForm}>
          <input type="hidden" name="assignmentId" value={request.id} />
          {request.schoolId ? <input type="hidden" name="schoolId" value={request.schoolId} /> : null}
          <SubmitButton
            pendingLabel="Aceitando…"
            disabled={!request.canAccept}
            className="glass-button-primary rounded-full px-4 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            Aceitar
          </SubmitButton>
        </form>

        <form action={rejectForm}>
          <input type="hidden" name="assignmentId" value={request.id} />
          {request.schoolId ? <input type="hidden" name="schoolId" value={request.schoolId} /> : null}
          {confirming ? (
            <div className="flex items-center gap-2">
              <SubmitButton
                pendingLabel="Recusando…"
                className="rounded-full bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/30 disabled:opacity-50"
              >
                Confirmar recusa
              </SubmitButton>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-xs text-foreground/60 transition-colors hover:text-foreground"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-xs font-medium text-foreground/60 underline-offset-4 hover:text-rose-300 hover:underline"
            >
              Recusar
            </button>
          )}
        </form>
      </div>

      {!request.canAccept && request.blockedReason ? (
        <p className="text-xs text-foreground/55">{request.blockedReason}</p>
      ) : null}
      {message ? (
        <p role="alert" className="text-xs text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  );
}
