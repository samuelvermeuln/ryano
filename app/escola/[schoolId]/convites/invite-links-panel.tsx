/**
 * T264 — Client component: exibe links de convite e permite copiar.
 */
"use client";
import { useState } from "react";
import type { InvitationLink } from "@prisma/client";

type Props = {
  schoolId: string;
  invites: InvitationLink[];
};

function statusBadge(status: string, expiresAt: Date | null) {
  if (status === "REVOKED") return { label: "Revogado", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" };
  if (expiresAt && new Date(expiresAt) < new Date()) return { label: "Expirado", cls: "bg-muted text-muted-foreground" };
  if (status === "ACTIVE") return { label: "Ativo", cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" };
  return { label: status, cls: "bg-muted text-muted-foreground" };
}

export function InviteLinksPanel({ schoolId, invites }: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  function buildLink(invite: InvitationLink) {
    // Token hash is stored server-side; the client only needs the invite ID to
    // construct the shareable /entrar/convite/[id] URL. The token resolution
    // happens server-side in resolve-invitation-link.ts.
    return `${window.location.origin}/entrar/convite/${invite.id}`;
  }

  async function copyLink(invite: InvitationLink) {
    try {
      await navigator.clipboard.writeText(buildLink(invite));
      setCopied(invite.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard API unavailable (e.g. http)
    }
  }

  return (
    <div className="space-y-4">
      {invites.length === 0 && (
        <p className="text-muted-foreground text-sm">Nenhum convite criado ainda.</p>
      )}

      <ul className="space-y-3">
        {invites.map((invite) => {
          const { label, cls } = statusBadge(invite.status, invite.expiresAt);
          const isActive = invite.status === "ACTIVE" && (!invite.expiresAt || new Date(invite.expiresAt) >= new Date());
          return (
            <li key={invite.id} className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{invite.type}</span>
                  <span className={`text-xs rounded px-2 py-0.5 ${cls}`}>{label}</span>
                  {invite.requiresApproval && (
                    <span className="text-xs rounded px-2 py-0.5 bg-secondary text-secondary-foreground">Requer aprovação</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground font-mono truncate">
                  {invite.usedCount} uso{invite.usedCount !== 1 ? "s" : ""}
                  {invite.maxUses != null ? ` / ${invite.maxUses}` : ""}
                  {invite.expiresAt ? ` · expira ${new Date(invite.expiresAt).toLocaleDateString("pt-BR")}` : ""}
                </p>
              </div>
              {isActive && (
                <button
                  type="button"
                  onClick={() => copyLink(invite)}
                  className="shrink-0 text-xs rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-muted transition-colors"
                >
                  {copied === invite.id ? "Copiado!" : "Copiar link"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
