"use client";

import { useState, useTransition } from "react";

type Invitation = {
  id: string;
  status: string;
  expiresAt: string | null;
  maxUses: number | null;
  usedCount: number;
  requiresApproval: boolean;
  createdAt: string;
};

type Athlete = {
  assignmentId: string;
  startedAt: string | null;
  name: string;
  email: string;
};

type NewInvitation = {
  token: string;
  id: string;
};

export function IndependentCoachPanel({
  coachId,
  invitations: initialInvitations,
  athletes,
}: {
  coachId: string;
  invitations: Invitation[];
  athletes: Athlete[];
}) {
  const [invitations, setInvitations] = useState(initialInvitations);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [expiryDays, setExpiryDays] = useState("7");

  function inviteUrl(token: string) {
    return `${window.location.origin}/convite/${token}`;
  }

  function copyLink(token: string) {
    void navigator.clipboard.writeText(inviteUrl(token)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function createInvite() {
    setError(null);
    startTransition(async () => {
      const days = parseInt(expiryDays, 10);
      const expiresAt = days > 0
        ? new Date(Date.now() + days * 86_400_000).toISOString()
        : null;

      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "COACH",
          schoolId: null,
          coachId,
          requiresApproval,
          expiresAt,
          maxUses: null,
        }),
      });

      const data = await res.json() as { invitation?: Invitation; token?: string; message?: string };
      if (!res.ok) {
        setError(data.message ?? "Não foi possível criar o convite.");
        return;
      }
      if (data.token) {
        setNewToken(data.token);
        if (data.invitation) {
          setInvitations((prev) => [data.invitation!, ...prev]);
        }
      }
    });
  }

  async function revokeInvite(invitationId: string) {
    const res = await fetch(`/api/invitations/${invitationId}/revoke`, { method: "POST" });
    if (res.ok) {
      setInvitations((prev) => prev.filter((i) => i.id !== invitationId));
      if (newToken) setNewToken(null);
    }
  }

  return (
    <div className="space-y-8">

      {/* Novo convite */}
      <section className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="text-base font-semibold">Gerar link de convite</h2>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium block">Validade</label>
            <select
              value={expiryDays}
              onChange={(e) => setExpiryDays(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="3">3 dias</option>
              <option value="7">7 dias</option>
              <option value="30">30 dias</option>
              <option value="0">Sem expiração</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium block">Aprovação</label>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRequiresApproval(true)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                  requiresApproval
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                Exigir aprovação
              </button>
              <button
                type="button"
                onClick={() => setRequiresApproval(false)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                  !requiresApproval
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                Automático
              </button>
            </div>
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <button
          type="button"
          onClick={createInvite}
          disabled={isPending}
          className="w-full rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Gerando…" : "Gerar link"}
        </button>

        {newToken && (
          <div className="rounded-lg bg-muted/50 border border-border p-4 space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Link gerado — copie e envie ao atleta:</p>
            <code className="block text-xs break-all text-foreground">{inviteUrl(newToken)}</code>
            <button
              type="button"
              onClick={() => copyLink(newToken)}
              className="text-xs text-primary font-medium hover:underline"
            >
              {copied ? "Copiado ✓" : "Copiar link"}
            </button>
          </div>
        )}
      </section>

      {/* Convites ativos */}
      {invitations.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Convites ativos</h2>
          <ul className="space-y-2">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-4 gap-4 text-sm">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-xs text-muted-foreground">
                    Criado em {new Date(inv.createdAt).toLocaleDateString("pt-BR")}
                    {inv.expiresAt && ` · expira em ${new Date(inv.expiresAt).toLocaleDateString("pt-BR")}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {inv.usedCount} uso{inv.usedCount !== 1 ? "s" : ""}
                    {inv.maxUses ? ` / ${inv.maxUses}` : ""}
                    {" · "}{inv.requiresApproval ? "Exige aprovação" : "Automático"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void revokeInvite(inv.id)}
                  className="shrink-0 text-xs text-destructive hover:underline"
                >
                  Revogar
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Atletas vinculados */}
      {athletes.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Meus atletas</h2>
          <ul className="space-y-2">
            {athletes.map((a) => (
              <li key={a.assignmentId} className="flex items-center justify-between rounded-xl border border-border bg-card p-4 gap-4">
                <div>
                  <p className="text-sm font-medium">{a.name}</p>
                  {a.name !== a.email && <p className="text-xs text-muted-foreground">{a.email}</p>}
                  {a.startedAt && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Desde {new Date(a.startedAt).toLocaleDateString("pt-BR")}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {athletes.length === 0 && invitations.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Nenhum atleta vinculado ainda. Gere um link acima e envie para seu atleta.
        </p>
      )}
    </div>
  );
}
