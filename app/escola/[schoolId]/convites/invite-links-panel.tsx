/**
 * T263/T264 — Convites: criar, copiar o link (uma única vez) e revogar.
 */
"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { StatusBadge } from "@/components/status-badge";
import { createInviteAction, revokeInviteAction, type InviteActionState } from "./actions";

export type InviteRow = {
  id: string;
  type: string;
  status: string;
  requiresApproval: boolean;
  expiresAt: string | null;
  maxUses: number | null;
  usedCount: number;
  createdAt: string;
};

type Tone = "neutral" | "success" | "warning" | "danger";

const TYPE_LABELS: Record<string, string> = {
  SCHOOL: "Atleta",
  SCHOOL_COACH: "Professor",
  COACH: "Professor autônomo",
};

function statusBadge(invite: InviteRow): { label: string; tone: Tone } {
  if (invite.status === "REVOKED") return { label: "Revogado", tone: "danger" };
  if (invite.status === "EXHAUSTED") return { label: "Esgotado", tone: "neutral" };
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    return { label: "Expirado", tone: "neutral" };
  }
  if (invite.status === "ACTIVE") return { label: "Ativo", tone: "success" };
  return { label: invite.status, tone: "neutral" };
}

function isUsable(invite: InviteRow): boolean {
  return (
    invite.status === "ACTIVE" && (!invite.expiresAt || new Date(invite.expiresAt) >= new Date())
  );
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString("pt-BR") : "—";
}

export function InviteLinksPanel({ schoolId, invites }: { schoolId: string; invites: InviteRow[] }) {
  return (
    <div className="space-y-5">
      <CreateInviteForm schoolId={schoolId} />

      {invites.length === 0 ? (
        <p className="py-8 text-center text-sm text-foreground/45">Nenhum convite criado ainda.</p>
      ) : (
        <ul className="space-y-3">
          {invites.map((invite) => {
            const { label, tone } = statusBadge(invite);
            return (
              <li
                key={invite.id}
                className="flex flex-col gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">
                      {TYPE_LABELS[invite.type] ?? invite.type}
                    </span>
                    <StatusBadge tone={tone}>{label}</StatusBadge>
                    {invite.requiresApproval && <StatusBadge tone="neutral">Requer aprovação</StatusBadge>}
                  </div>
                  <p className="text-xs text-foreground/50">
                    Criado em {formatDate(invite.createdAt)} · Usos: {invite.usedCount}
                    {invite.maxUses === null ? " (sem limite)" : ` de ${invite.maxUses}`}
                    {invite.expiresAt ? ` · Expira em ${formatDate(invite.expiresAt)}` : " · Sem expiração"}
                  </p>
                </div>

                {isUsable(invite) && <RevokeInviteForm schoolId={schoolId} invitationId={invite.id} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CreateInviteForm({ schoolId }: { schoolId: string }) {
  const [state, formAction] = useActionState<InviteActionState, FormData>(createInviteAction, {});
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    // Collapse the form on success so the one-time link takes the focus.
    if (state.ok) setOpen(false);
  }

  return (
    <div className="space-y-4">
      {state.token && <OneTimeLink schoolId={schoolId} token={state.token} />}

      {open ? (
        <form action={formAction} className="space-y-4 rounded-2xl border border-white/8 bg-white/[0.03] p-5">
          <input type="hidden" name="schoolId" value={schoolId} />
          <p className="text-sm font-medium">Novo convite</p>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label htmlFor="invite-type" className="text-xs font-medium text-foreground/70">
                Convidar como
              </label>
              <select
                id="invite-type"
                name="type"
                defaultValue="SCHOOL"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              >
                <option value="SCHOOL">Atleta</option>
                <option value="SCHOOL_COACH">Professor</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="invite-expires" className="text-xs font-medium text-foreground/70">
                Expira em (dias)
              </label>
              <input
                id="invite-expires"
                name="expiresInDays"
                type="number"
                min={1}
                max={365}
                defaultValue={30}
                placeholder="Sem expiração"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="invite-max-uses" className="text-xs font-medium text-foreground/70">
                Limite de usos
              </label>
              <input
                id="invite-max-uses"
                name="maxUses"
                type="number"
                min={1}
                placeholder="Sem limite"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="requiresApproval" defaultChecked className="accent-current" />
            Exigir aprovação manual antes de entrar
          </label>

          {state.message && <p role="alert" className="text-sm text-destructive">{state.message}</p>}

          <div className="flex items-center gap-3">
            <SubmitButton
              pendingLabel="Criando…"
              className="glass-button rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Criar convite
            </SubmitButton>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm text-foreground/60 transition-colors hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="glass-button rounded-full px-5 py-2 text-sm font-semibold text-foreground"
        >
          Novo convite
        </button>
      )}
    </div>
  );
}

/**
 * The invitation token is stored only as a hash, so this is the single moment
 * it can ever be shown. Re-opening the screen cannot recover it — if it is
 * lost, the only correct recovery is to revoke and issue a new invite, which
 * is what the copy explains instead of offering a link that would 404.
 */
function OneTimeLink({ schoolId, token }: { schoolId: string; token: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/entrar/convite/${token}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is unavailable outside a secure context; the input below
      // still lets the user select and copy manually.
    }
  }

  return (
    <div key={schoolId} className="theme-panel-warning space-y-3 rounded-2xl border p-4">
      <p className="text-sm font-semibold">Copie o link agora</p>
      <p className="text-xs">
        Este link só aparece uma vez — ele não fica guardado no sistema. Se perder, revogue este
        convite e crie outro.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          readOnly
          value={url}
          aria-label="Link do convite"
          onFocus={(event) => event.currentTarget.select()}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs outline-none"
        />
        <button
          type="button"
          onClick={copy}
          className="glass-button shrink-0 rounded-full px-5 py-2 text-sm font-semibold"
        >
          {copied ? "Copiado!" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

function RevokeInviteForm({ schoolId, invitationId }: { schoolId: string; invitationId: string }) {
  const [state, formAction] = useActionState<InviteActionState, FormData>(revokeInviteAction, {});
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={formAction} className="shrink-0">
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="invitationId" value={invitationId} />
      {confirming ? (
        <div className="flex items-center gap-2">
          <SubmitButton
            pendingLabel="Revogando…"
            className="rounded-full bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/30 disabled:opacity-50"
          >
            Confirmar
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
          Revogar
        </button>
      )}
      {state.message && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {state.message}
        </p>
      )}
    </form>
  );
}
