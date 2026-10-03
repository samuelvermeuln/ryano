"use client";

/**
 * SAM-58 — "Salvar adaptação individual como modelo" (§9.4): the coach turns a
 * prescription into a personal draft template, without the athlete's
 * individual values (absolute HR, pace, power).
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function SaveAsTemplateButton({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => {
          setError(null);
          const response = await fetch("/api/workout-catalog/from-assignment", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assignmentId }) });
          const payload = (await response.json().catch(() => null)) as { template?: { id: string }; message?: string } | null;
          if (!response.ok || !payload?.template) { setError(payload?.message ?? "Não foi possível salvar como modelo."); return; }
          router.push(`/professor/estudio/treinos/${payload.template.id}`);
        })}
        className="glass-button rounded-full px-4 py-2 text-sm font-medium"
      >
        Salvar como modelo
      </button>
      {error && <span role="alert" className="text-xs text-rose-400">{error}</span>}
    </span>
  );
}
