/**
 * T297 — FeedbackForm (client) — RPE, humor, energia, comentário
 */
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type FeedbackData = { rpe: number; mood: number | null; energy: number | null; comment: string | null };
type Props = { executionId: string; existing: FeedbackData | null; schoolId: string; assignmentId: string };

function ScaleButton({
  value, selected, max, onClick,
}: { value: number; selected: boolean; max: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
        selected
          ? "bg-primary text-primary-foreground"
          : "border border-border hover:bg-muted"
      }`}
    >
      {value}
    </button>
  );
}

export function FeedbackForm({ executionId, existing, schoolId, assignmentId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rpe, setRpe] = useState<number | null>(existing?.rpe ?? null);
  const [mood, setMood] = useState<number | null>(existing?.mood ?? null);
  const [energy, setEnergy] = useState<number | null>(existing?.energy ?? null);
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rpe === null) { setError("Selecione o RPE."); return; }
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/workout-executions/${executionId}/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rpe, mood, energy, comment: comment || null }),
        });
        const data = await res.json() as { message?: string };
        if (!res.ok) { setError(data.message ?? "Erro ao salvar feedback."); return; }
        setSaved(true);
        router.refresh();
      } catch {
        setError("Erro ao salvar feedback.");
      }
    });
  }

  if (saved) {
    return (
      <div className="rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 p-4 text-sm text-green-800 dark:text-green-300">
        Feedback salvo! Obrigado.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-5 space-y-5">
      {/* RPE */}
      <div className="space-y-2">
        <label className="text-sm font-medium">
          RPE — Percepção de esforço <span className="text-destructive">*</span>
          <span className="text-xs font-normal text-muted-foreground ml-1">(1 = muito leve · 10 = máximo)</span>
        </label>
        <div className="flex gap-1 flex-wrap">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
            <ScaleButton key={v} value={v} selected={rpe === v} max={10} onClick={() => setRpe(v)} />
          ))}
        </div>
      </div>

      {/* Mood */}
      <div className="space-y-2">
        <label className="text-sm font-medium">
          Humor
          <span className="text-xs font-normal text-muted-foreground ml-1">(1 = muito baixo · 5 = ótimo)</span>
        </label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((v) => (
            <ScaleButton key={v} value={v} selected={mood === v} max={5} onClick={() => setMood(mood === v ? null : v)} />
          ))}
        </div>
      </div>

      {/* Energy */}
      <div className="space-y-2">
        <label className="text-sm font-medium">
          Energia
          <span className="text-xs font-normal text-muted-foreground ml-1">(1 = esgotado · 5 = cheio de energia)</span>
        </label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((v) => (
            <ScaleButton key={v} value={v} selected={energy === v} max={5} onClick={() => setEnergy(energy === v ? null : v)} />
          ))}
        </div>
      </div>

      {/* Comment */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Comentário (opcional)</label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Como foi o treino?"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {isPending ? "Salvando…" : existing ? "Atualizar feedback" : "Enviar feedback"}
      </button>
    </form>
  );
}
