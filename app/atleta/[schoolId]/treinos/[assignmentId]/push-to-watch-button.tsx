"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  assignmentId: string;
  schoolId: string;
};

export function PushToWatchButton({ assignmentId, schoolId }: Props) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handlePush() {
    setState("loading");
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/workout-assignments/${assignmentId}/push-to-watch`, {
        method: "POST",
      });
      const data = await res.json() as { error?: string; message?: string; alreadyPushed?: boolean };
      if (!res.ok) {
        setErrorMsg(data.message ?? data.error ?? "Erro ao enviar");
        setState("error");
        return;
      }
      setState("success");
      // Refresh server component to show pushed status
      router.refresh();
    } catch {
      setErrorMsg("Erro de conexão");
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <div className="flex items-center gap-2 text-xs text-emerald-400 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5">
        <span>✓</span>
        <span>Treino enviado ao relógio! Sincronize seu Garmin para ver.</span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <button
        onClick={handlePush}
        disabled={state === "loading"}
        className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 text-primary text-sm font-medium px-4 py-2.5 hover:bg-primary/20 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {state === "loading" ? (
          <>
            <span className="animate-spin">⟳</span>
            Enviando ao relógio…
          </>
        ) : (
          <>
            <span>⌚</span>
            Enviar ao relógio Garmin
          </>
        )}
      </button>
      {state === "error" && errorMsg && (
        <p className="text-xs text-destructive">{errorMsg}</p>
      )}
    </div>
  );
}
