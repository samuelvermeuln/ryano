"use client";

/**
 * SAM-72 — §17.4: the athlete (or the coach) confirms how many repetitions of
 * a block were done; the watch's identification stays next to it.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { FIELD_CLASS, SECONDARY_ACTION_CLASS } from "@/components/page-header";

export function ConfirmRepetitionsForm({ assignmentId, blockIndex, current }: { assignmentId: string; blockIndex: number; current: number | null }) {
  const router = useRouter();
  const [count, setCount] = useState(current === null ? "" : String(current));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="mt-2 flex flex-wrap items-end gap-2 text-xs"
      data-testid="confirm-repetitions"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        startTransition(async () => {
          const response = await fetch(`/api/workout-assignments/${assignmentId}/repetitions`, {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ blockIndex, count: Number(count) }),
          });
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          if (!response.ok) { setMessage(payload?.message ?? "Não foi possível confirmar."); return; }
          setMessage("Repetições confirmadas.");
          router.refresh();
        });
      }}
    >
      <label className="grid gap-1">Repetições feitas
        <input type="number" min={0} max={200} required value={count} onChange={(event) => setCount(event.target.value)} className={`${FIELD_CLASS} w-24`} aria-label={`Repetições feitas no bloco ${blockIndex + 1}`} />
      </label>
      <button type="submit" disabled={pending} className={SECONDARY_ACTION_CLASS}>Confirmar</button>
      {message && <span role="status">{message}</span>}
    </form>
  );
}
