/**
 * T279 — EvaluationForm client component
 * Creates or updates a CoachEvaluation via POST/PATCH API.
 */
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  executionId: string;
  schoolId: string;
  athleteId: string;
  existing: { id: string; overallScore: number; note: string | null; isVisible: boolean } | null;
};

export function EvaluationForm({ executionId, schoolId, athleteId, existing }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [score, setScore] = useState<string>(existing ? (existing.overallScore / 10).toFixed(1) : "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [isVisible, setIsVisible] = useState(existing?.isVisible ?? true);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const numScore = parseFloat(score);
    if (isNaN(numScore) || numScore < 0 || numScore > 10) {
      setError("A nota deve ser um número entre 0 e 10.");
      return;
    }

    const isUpdate = Boolean(existing);
    const url = `/api/workout-executions/${executionId}/evaluation`;
    const method = isUpdate ? "PATCH" : "POST";
    const body = isUpdate
      ? JSON.stringify({ evaluationId: existing!.id, overallScore: numScore, note: note || null, isVisible })
      : JSON.stringify({ schoolId, overallScore: numScore, note: note || null, isVisible });

    startTransition(async () => {
      try {
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body,
        });
        if (!res.ok) {
          const data = await res.json() as { message?: string };
          setError(data.message ?? "Erro ao salvar avaliação.");
          return;
        }
        router.push(`/professor/${schoolId}/atletas/${athleteId}`);
        router.refresh();
      } catch {
        setError("Erro ao salvar avaliação.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Score input */}
      <div className="space-y-1.5">
        <label htmlFor="score" className="text-sm font-medium">Nota (0–10)</label>
        <input
          id="score"
          type="number"
          min="0"
          max="10"
          step="0.5"
          value={score}
          onChange={(e) => setScore(e.target.value)}
          required
          placeholder="ex: 8.5"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Note */}
      <div className="space-y-1.5">
        <label htmlFor="note" className="text-sm font-medium">Observações (opcional)</label>
        <textarea
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          maxLength={5000}
          placeholder="Feedback descritivo para o atleta..."
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>

      {/* Visibility */}
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={isVisible}
          onChange={(e) => setIsVisible(e.target.checked)}
          className="rounded"
        />
        Visível para o atleta
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {isPending ? "Salvando..." : existing ? "Atualizar avaliação" : "Salvar avaliação"}
      </button>
    </form>
  );
}
