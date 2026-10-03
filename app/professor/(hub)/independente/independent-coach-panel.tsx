"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { IconCopy, IconLink } from "@tabler/icons-react";

import { EmptyState } from "@/components/empty-state";
import { FIELD_CLASS, ITEM_CLASS, PRIMARY_ACTION_CLASS, SECONDARY_ACTION_CLASS } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { SubmitButton } from "@/components/submit-button";
import { UserAvatar } from "@/components/user-avatar";
import { endIndependentCoachingAction, type CoachRequestActionState } from "../coach-requests-actions";

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
  /** SAM-30 — opens the athlete hub at /professor/independente/atletas/<id>. */
  athleteId: string;
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
    <div className="space-y-6">
      <SectionCard title="Gerar link de convite" description="O atleta abre o link, entra na Ryvano e fica vinculado a você.">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="block text-sm font-medium">Validade</span>
              <select value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)} className={FIELD_CLASS}>
                <option value="3">3 dias</option>
                <option value="7">7 dias</option>
                <option value="30">30 dias</option>
                <option value="0">Sem expiração</option>
              </select>
            </label>

            <div className="space-y-1.5">
              <span className="block text-sm font-medium">Aprovação</span>
              <div role="group" aria-label="Aprovação" className="flex flex-wrap gap-2 pt-1">
                {[
                  { value: true, label: "Exigir aprovação" },
                  { value: false, label: "Automático" },
                ].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    aria-pressed={requiresApproval === option.value}
                    onClick={() => setRequiresApproval(option.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      requiresApproval === option.value ? "theme-pill-success" : "border-white/10 text-foreground/65 hover:bg-white/10"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}

          <button type="button" onClick={createInvite} disabled={isPending} className={`${PRIMARY_ACTION_CLASS} w-full justify-center`}>
            <IconLink size={16} aria-hidden="true" />
            {isPending ? "Gerando…" : "Gerar link"}
          </button>

          {newToken && (
            <div className="theme-panel-success space-y-2 rounded-[20px] border p-4">
              <p className="text-xs font-medium text-foreground/70">Link gerado — copie e envie ao atleta:</p>
              <code className="block break-all text-xs text-foreground">{inviteUrl(newToken)}</code>
              <button type="button" onClick={() => copyLink(newToken)} className={`${SECONDARY_ACTION_CLASS} text-xs`}>
                <IconCopy size={14} aria-hidden="true" />
                {copied ? "Copiado ✓" : "Copiar link"}
              </button>
            </div>
          )}
        </div>
      </SectionCard>

      {invitations.length > 0 && (
        <SectionCard title={`Convites ativos (${invitations.length})`} description="Revogue um link para que ele deixe de aceitar novos atletas.">
          <ul className="space-y-2">
            {invitations.map((inv) => (
              <li key={inv.id} className={`${ITEM_CLASS} flex items-center justify-between gap-4 text-sm`}>
                <div className="min-w-0 space-y-0.5">
                  <p className="text-xs text-foreground/60">
                    Criado em {new Date(inv.createdAt).toLocaleDateString("pt-BR")}
                    {inv.expiresAt && ` · expira em ${new Date(inv.expiresAt).toLocaleDateString("pt-BR")}`}
                  </p>
                  <p className="text-xs text-foreground/60">
                    {inv.usedCount} uso{inv.usedCount !== 1 ? "s" : ""}
                    {inv.maxUses ? ` / ${inv.maxUses}` : ""}
                    {" · "}{inv.requiresApproval ? "Exige aprovação" : "Automático"}
                  </p>
                </div>
                <button type="button" onClick={() => void revokeInvite(inv.id)} className="shrink-0 text-xs font-semibold text-rose-400 hover:underline">
                  Revogar
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <SectionCard title={`Meus atletas (${athletes.length})`} description="Abra a central do atleta para prescrever, ver atividades, ficha técnica e análise.">
        {athletes.length === 0 ? (
          <EmptyState
            title="Nenhum atleta vinculado ainda"
            description="Gere um link acima e envie para seu atleta. Ele aparece aqui assim que entrar pelo convite ou você aceitar o pedido dele."
          />
        ) : (
          <ul className="space-y-2">
            {athletes.map((a) => (
              <li key={a.assignmentId} data-testid="independent-athlete" className={`${ITEM_CLASS} flex flex-wrap items-center justify-between gap-4`}>
                <div className="flex min-w-0 items-center gap-3">
                  <UserAvatar name={a.name} image={null} size="sm" />
                  <div className="min-w-0">
                    {/* SAM-30 — the whole journey (treinos, prescrever, ficha, histórico, análise) lives in the hub. */}
                    <Link
                      href={`/professor/independente/atletas/${a.athleteId}`}
                      aria-label={`Abrir a central de ${a.name}`}
                      className="text-sm font-medium underline-offset-4 hover:underline"
                    >
                      {a.name}
                    </Link>
                    {a.name !== a.email && <p className="truncate text-xs text-foreground/55">{a.email}</p>}
                    {a.startedAt && (
                      <p className="mt-0.5 text-xs text-foreground/55">
                        Desde {new Date(a.startedAt).toLocaleDateString("pt-BR")}
                      </p>
                    )}
                  </div>
                </div>
                <EndCoaching assignmentId={a.assignmentId} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

/**
 * SAM-26 — ends one independent coaching link. Two steps because the athlete
 * cannot reopen it from their side; the use case refuses school-scoped links.
 */
function EndCoaching({ assignmentId }: { assignmentId: string }) {
  const [state, formAction] = useActionState<CoachRequestActionState, FormData>(endIndependentCoachingAction, {});
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={formAction} className="shrink-0 text-right">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      {confirming ? (
        <div className="flex items-center gap-2">
          <SubmitButton
            pendingLabel="Encerrando…"
            className="theme-pill-danger rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          >
            Confirmar encerramento
          </SubmitButton>
          <button type="button" onClick={() => setConfirming(false)} className="text-xs text-foreground/60 hover:text-foreground">
            Voltar
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="text-xs font-semibold text-rose-400 hover:underline">
          Encerrar acompanhamento
        </button>
      )}
      {state.message ? <p role="alert" className="mt-1 text-xs text-rose-400">{state.message}</p> : null}
    </form>
  );
}
