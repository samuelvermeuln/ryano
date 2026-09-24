/**
 * T264 — Client component: exibe links de convite e permite copiar.
 */
"use client";
import { useState } from "react";
import type { InvitationLink } from "@prisma/client";
import { StatusBadge } from "@/components/status-badge";

type Props = {
  schoolId: string;
  invites: InvitationLink[];
};

type Tone = "neutral" | "success" | "warning" | "danger";

function statusBadge(status: string, expiresAt: Date | null): { label: string; tone: Tone } {
  if (status === "REVOKED") return { label: "Revogado", tone: "danger" };
  if (expiresAt && new Date(expiresAt) < new Date()) return { label: "Expirado", tone: "neutral" };
  if (status === "ACTIVE") return { label: "Ativo", tone: "success" };
  return { label: status, tone: "neutral" };
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
        <p className="text-foreground/50 text-sm">Nenhum convite criado ainda.</p>
      )}

      <ul className="space-y-3">
        {invites.map((invite) => {
          const { label, tone } = statusBadge(invite.status, invite.expiresAt);
          const isActive = invite.status === "ACTIVE" && (!invite.expiresAt || new Date(invite.expiresAt) >= new Date());
          return (
            <li key={invite.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 flex items-center justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground/50 uppercase tracking-wide">{invite.type}</span>
                  <StatusBadge tone={tone}>{label}</StatusBadge>
                  {invite.requiresApproval && (
                    <StatusBadge tone="neutral">Requer aprovação</StatusBadge>
                  )}
                </div>
                <p className="text-xs text-foreground/50 font-mono truncate">
                  {invite.usedCount} uso{invite.usedCount !== 1 ? "s" : ""}
                  {invite.maxUses != null ? ` / ${invite.maxUses}` : ""}
                  {invite.expiresAt ? ` · expira ${new Date(invite.expiresAt).toLocaleDateString("pt-BR")}` : ""}
                </p>
              </div>
              {isActive && (
                <button
                  type="button"
                  onClick={() => copyLink(invite)}
                  className="glass-button shrink-0 rounded-full px-4 py-2 text-xs font-semibold text-foreground"
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
