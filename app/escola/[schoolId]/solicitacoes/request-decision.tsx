"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import {
  approveAthleteAction,
  approveCoachAction,
  rejectAthleteAction,
  rejectCoachAction,
  type RequestActionState,
} from "./actions";

export type CoachOption = { id: string; name: string };

export type PendingRequest = {
  membershipId: string;
  name: string;
  email: string | null;
  requestedAt: string;
  /** SAM-26 — the coach the athlete asked for when joining, if any. */
  preferredCoach?: CoachOption | null;
};

/**
 * Approve/reject pair for one pending request.
 *
 * Both buttons live in one component (rather than two independent forms) so a
 * rejected approval and a failed rejection surface in the same place, next to
 * the row they belong to. Rejection asks for confirmation because it is the
 * one of the two that the person on the other side cannot undo themselves.
 *
 * For athletes (SAM-26) the approve form also carries the coach to assign,
 * pre-filled with the athlete's preference; "Sem professor por enquanto" keeps
 * that preference PENDING for the coach to answer.
 */
export function RequestDecision({
  schoolId,
  membershipId,
  kind,
  preferredCoach = null,
  coaches = [],
}: {
  schoolId: string;
  membershipId: string;
  kind: "athlete" | "coach";
  preferredCoach?: CoachOption | null;
  coaches?: CoachOption[];
}) {
  const approve = kind === "athlete" ? approveAthleteAction : approveCoachAction;
  const reject = kind === "athlete" ? rejectAthleteAction : rejectCoachAction;

  const [approveState, approveForm] = useActionState<RequestActionState, FormData>(approve, {});
  const [rejectState, rejectForm] = useActionState<RequestActionState, FormData>(reject, {});
  const [confirming, setConfirming] = useState(false);
  const [coachId, setCoachId] = useState(preferredCoach?.id ?? "");

  const message = approveState.message ?? rejectState.message;
  const showCoachSelect = kind === "athlete" && coaches.length > 0;

  return (
    <div className="shrink-0 text-right">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <form action={approveForm} className="flex flex-wrap items-center justify-end gap-2">
          <input type="hidden" name="schoolId" value={schoolId} />
          <input type="hidden" name="membershipId" value={membershipId} />
          {showCoachSelect ? (
            <select
              name="coachId"
              aria-label="Professor a atribuir"
              value={coachId}
              onChange={(event) => setCoachId(event.target.value)}
              className="glass-input rounded-full px-3 py-1.5 text-xs text-foreground outline-none"
            >
              <option value="">Sem professor por enquanto</option>
              {coaches.map((coach) => (
                <option key={coach.id} value={coach.id}>
                  {coach.name}
                  {preferredCoach?.id === coach.id ? " (preferido pelo atleta)" : ""}
                </option>
              ))}
            </select>
          ) : null}
          <SubmitButton
            pendingLabel="Aprovando…"
            className="glass-button rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
          >
            Aprovar
          </SubmitButton>
        </form>

        <form action={rejectForm}>
          <input type="hidden" name="schoolId" value={schoolId} />
          <input type="hidden" name="membershipId" value={membershipId} />
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

      {message && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
