"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = { token: string; requiresApproval: boolean };

export function AcceptInvitationForm({ token, requiresApproval }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleAccept() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/invitations/${token}/accept`, { method: "POST" });
        const data = await res.json() as { message?: string; schoolId?: string };
        if (!res.ok) { setError(data.message ?? "Erro ao aceitar convite."); return; }
        setDone(true);
        // Redirect after short pause so user reads success state
        setTimeout(() => router.push(data.schoolId ? `/atleta/${data.schoolId}` : "/app/dashboard"), 1200);
      } catch {
        setError("Erro ao aceitar convite.");
      }
    });
  }

  if (done) {
    return (
      <div className="rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 p-4 text-sm text-green-800 dark:text-green-300 text-center">
        {requiresApproval ? "Solicitação enviada! Aguardando aprovação." : "Convite aceito! Redirecionando…"}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type="button"
        onClick={handleAccept}
        disabled={isPending}
        className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {isPending ? "Processando…" : requiresApproval ? "Solicitar vínculo" : "Aceitar convite"}
      </button>
    </div>
  );
}
