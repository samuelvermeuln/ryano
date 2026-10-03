"use client";

/**
 * SAM-73 — correct a distance, the moving time, or the pool length (with the
 * explicit recompute of the distance). Every correction needs its reason.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { FIELD_CLASS, SECONDARY_ACTION_CLASS } from "@/components/page-header";
import { POOL_LENGTHS } from "@/modules/shared/activities/domain/activity-correction";

export function ActivityCorrectionForm({ activityId, isPool, currentDistance, currentMoving }: { activityId: string; isPool: boolean; currentDistance: number | null; currentMoving: number | null }) {
  const router = useRouter();
  const [field, setField] = useState<"distanceMeters" | "movingSeconds" | "poolLengthMeters">("distanceMeters");
  const [value, setValue] = useState("");
  const [originalPool, setOriginalPool] = useState("25");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium">Corrigir um valor</summary>
      <form
        className="mt-2 grid gap-2 sm:grid-cols-2"
        data-testid="activity-correction-form"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage(null);
          startTransition(async () => {
            const body = field === "poolLengthMeters"
              ? { field, originalPoolLength: Number(originalPool), correctedValue: Number(value), reason }
              : { field, correctedValue: Number(value), reason };
            const response = await fetch(`/api/activities/${activityId}/corrections`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
            const payload = (await response.json().catch(() => null)) as { message?: string; details?: Array<{ message: string }> } | null;
            if (!response.ok) { setMessage({ tone: "error", text: payload?.details?.[0]?.message ?? payload?.message ?? "Não foi possível corrigir." }); return; }
            setMessage({ tone: "ok", text: "Correção registrada; o original continua consultável." });
            setValue("");
            setReason("");
            router.refresh();
          });
        }}
      >
        <label className="grid gap-1">Campo
          <select value={field} onChange={(event) => setField(event.target.value as typeof field)} className={FIELD_CLASS} aria-label="Campo a corrigir">
            <option value="distanceMeters">Distância (m){currentDistance !== null ? ` — atual ${Math.round(currentDistance)}` : ""}</option>
            <option value="movingSeconds">Tempo em movimento (s){currentMoving !== null ? ` — atual ${currentMoving}` : ""}</option>
            {isPool && <option value="poolLengthMeters">Comprimento da piscina</option>}
          </select>
        </label>
        {field === "poolLengthMeters" ? (
          <>
            <label className="grid gap-1">Piscina marcada no relógio
              <select value={originalPool} onChange={(event) => setOriginalPool(event.target.value)} className={FIELD_CLASS} aria-label="Piscina marcada">
                {POOL_LENGTHS.map((option) => <option key={option.label} value={String(option.value)}>{option.label}</option>)}
              </select>
            </label>
            <label className="grid gap-1">Piscina real
              <select value={value} onChange={(event) => setValue(event.target.value)} required className={FIELD_CLASS} aria-label="Piscina real">
                <option value="">Escolha</option>
                {POOL_LENGTHS.map((option) => <option key={option.label} value={String(option.value)}>{option.label}</option>)}
              </select>
            </label>
          </>
        ) : (
          <label className="grid gap-1">Valor corrigido
            <input type="number" min={1} step="any" required value={value} onChange={(event) => setValue(event.target.value)} className={FIELD_CLASS} aria-label="Valor corrigido" />
          </label>
        )}
        <label className="grid gap-1 sm:col-span-2">Justificativa
          <input required minLength={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} className={FIELD_CLASS} aria-label="Justificativa da correção" />
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <button type="submit" disabled={pending} className={SECONDARY_ACTION_CLASS}>Registrar correção</button>
          {message && <span role={message.tone === "error" ? "alert" : "status"} className={`text-xs ${message.tone === "error" ? "text-rose-400" : "text-emerald-500"}`}>{message.text}</span>}
        </div>
      </form>
    </details>
  );
}
