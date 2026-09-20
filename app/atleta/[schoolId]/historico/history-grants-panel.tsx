/**
 * T299 — seleção de período e escopo
 * T300 — revogação de compartilhamento
 */
"use client";
import { useState, useTransition } from "react";

type GrantView = {
  id: string;
  status: string;
  granteeType: string;
  coachName: string | null;
  schoolName: string | null;
  scope: Record<string, boolean>;
  fromDate: string | null;
  toDate: string | null;
  grantedAt: string;
  revokedAt: string | null;
};

type CoachOption = { id: string; userId: string; name: string };

type Props = {
  schoolId: string;
  grants: GrantView[];
  coaches: CoachOption[];
  scopeLabels: Record<string, string>;
};

const ALL_SCOPE_KEYS = [
  "activities", "metrics", "prescribedWorkouts", "compliance",
  "coachScores", "coachComments", "assessments", "athleteFeedback",
] as const;

function GrantCard({
  grant, scopeLabels, onRevoke, revoking,
}: { grant: GrantView; scopeLabels: Record<string, string>; onRevoke: () => void; revoking: boolean }) {
  const isActive = grant.status === "ACTIVE" && !grant.revokedAt;
  const grantee = grant.granteeType === "COACH"
    ? `Coach: ${grant.coachName ?? "—"}`
    : `Escola: ${grant.schoolName ?? "—"}`;

  return (
    <li className={`rounded-xl border p-4 space-y-3 ${isActive ? "border-border bg-card" : "border-border/50 bg-muted/30 opacity-60"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-sm">{grantee}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Concedido em {new Date(grant.grantedAt).toLocaleDateString("pt-BR")}
            {grant.fromDate && ` · De ${new Date(grant.fromDate).toLocaleDateString("pt-BR")}`}
            {grant.toDate && ` até ${new Date(grant.toDate).toLocaleDateString("pt-BR")}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs rounded px-2 py-0.5 ${isActive ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
            {grant.revokedAt ? "Revogado" : grant.status}
          </span>
          {isActive && (
            <button
              type="button"
              onClick={onRevoke}
              disabled={revoking}
              className="text-xs rounded-lg border border-destructive/40 text-destructive px-2.5 py-1 hover:bg-destructive/10 disabled:opacity-50 transition-colors"
            >
              {revoking ? "…" : "Revogar"}
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ALL_SCOPE_KEYS.map((key) => (
          <span key={key} className={`text-xs rounded px-2 py-0.5 ${
            grant.scope[key]
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground line-through opacity-50"
          }`}>
            {scopeLabels[key] ?? key}
          </span>
        ))}
      </div>
    </li>
  );
}

export function HistoryGrantsPanel({ schoolId, grants: initialGrants, coaches, scopeLabels }: Props) {
  const [grants, setGrants] = useState(initialGrants);
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  // Form state
  const [granteeType, setGranteeType] = useState<"COACH" | "SCHOOL">("COACH");
  const [selectedCoachId, setSelectedCoachId] = useState(coaches[0]?.id ?? "");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [scope, setScope] = useState<Record<string, boolean>>(
    Object.fromEntries(ALL_SCOPE_KEYS.map((k) => [k, true])),
  );

  function toggleScope(key: string) {
    setScope((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    startTransition(async () => {
      try {
        const body = {
          granteeType,
          granteeId: granteeType === "COACH" ? selectedCoachId : schoolId,
          fromDate: fromDate || null,
          toDate: toDate || null,
          scope,
        };
        const res = await fetch("/api/history/grants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json() as { message?: string; id?: string; status?: string; granteeType?: string; scope?: Record<string, boolean>; fromDate?: string; toDate?: string; grantedAt?: string };
        if (!res.ok) { setFormError(data.message ?? "Erro ao conceder acesso."); return; }
        // Append new grant to list
        const coachName = coaches.find((c) => c.id === selectedCoachId)?.name ?? null;
        setGrants((prev) => [{
          id: data.id ?? "",
          status: data.status ?? "ACTIVE",
          granteeType: data.granteeType ?? granteeType,
          coachName,
          schoolName: null,
          scope: data.scope ?? scope,
          fromDate: (data.fromDate ?? fromDate) || null,
          toDate: (data.toDate ?? toDate) || null,
          grantedAt: data.grantedAt ?? new Date().toISOString(),
          revokedAt: null,
        }, ...prev]);
        setShowForm(false);
      } catch {
        setFormError("Erro ao conceder acesso.");
      }
    });
  }

  async function handleRevoke(grantId: string) {
    setRevoking(grantId);
    try {
      const res = await fetch(`/api/history/grants/${grantId}/revoke`, { method: "POST" });
      if (res.ok) {
        setGrants((prev) => prev.map((g) => g.id === grantId ? { ...g, status: "REVOKED", revokedAt: new Date().toISOString() } : g));
      }
    } finally {
      setRevoking(null);
    }
  }

  const active = grants.filter((g) => g.status === "ACTIVE" && !g.revokedAt);
  const revoked = grants.filter((g) => g.status !== "ACTIVE" || g.revokedAt);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{active.length} acesso{active.length !== 1 ? "s" : ""} ativo{active.length !== 1 ? "s" : ""}</p>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="text-sm rounded-lg bg-primary text-primary-foreground px-4 py-2 font-medium hover:opacity-90 transition-opacity"
        >
          {showForm ? "Cancelar" : "+ Conceder acesso"}
        </button>
      </div>

      {/* T299 — Grant form */}
      {showForm && (
        <form onSubmit={handleGrant} className="rounded-xl border border-border bg-card p-5 space-y-5">
          <h2 className="text-sm font-semibold">Novo acesso</h2>

          {/* Grantee type */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Para quem</label>
            <div className="flex gap-2">
              {(["COACH", "SCHOOL"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setGranteeType(t)}
                  className={`text-sm rounded-lg px-3 py-1.5 border ${granteeType === t ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                >
                  {t === "COACH" ? "Professor" : "Escola"}
                </button>
              ))}
            </div>
          </div>

          {/* Coach selector */}
          {granteeType === "COACH" && coaches.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Professor</label>
              <select
                value={selectedCoachId}
                onChange={(e) => setSelectedCoachId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {coaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {/* Period — T299 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">De (opcional)</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Até (opcional)</label>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>

          {/* Scope checkboxes */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">O que compartilhar</label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_SCOPE_KEYS.map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={scope[key] ?? false} onChange={() => toggleScope(key)} className="rounded" />
                  {scopeLabels[key] ?? key}
                </label>
              ))}
            </div>
          </div>

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "Salvando…" : "Conceder acesso"}
          </button>
        </form>
      )}

      {/* Active grants */}
      {active.length > 0 && (
        <ul className="space-y-3">
          {active.map((g) => (
            <GrantCard
              key={g.id}
              grant={g}
              scopeLabels={scopeLabels}
              onRevoke={() => handleRevoke(g.id)}
              revoking={revoking === g.id}
            />
          ))}
        </ul>
      )}
      {active.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground">Nenhum acesso ativo. Clique em "Conceder acesso" para começar.</p>
      )}

      {/* T300 — Revoked history */}
      {revoked.length > 0 && (
        <details className="group">
          <summary className="text-sm text-muted-foreground cursor-pointer select-none">
            Ver {revoked.length} acesso{revoked.length !== 1 ? "s" : ""} revogado{revoked.length !== 1 ? "s" : ""}
          </summary>
          <ul className="space-y-3 mt-3">
            {revoked.map((g) => (
              <GrantCard key={g.id} grant={g} scopeLabels={scopeLabels} onRevoke={() => {}} revoking={false} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
