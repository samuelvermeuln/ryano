"use client";

/**
 * SAM-60 — batch assignment from a catalog template (§10.1): pick athletes
 * (or a team, in a school) with visible names and count, set date/time,
 * PREVIEW one row per athlete (resolved targets, blocked reason, conflicts),
 * individualize a row (date, instructions), publish the selected rows and
 * read the result per recipient — with "Repetir falhas" and "Desfazer
 * sessões futuras".
 */
import { useMemo, useState, useTransition } from "react";

import { FIELD_CLASS, ITEM_CLASS, PRIMARY_ACTION_CLASS, SECONDARY_ACTION_CLASS } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { formatDistance, formatDuration } from "@/lib/format";

type Athlete = { athleteId: string; label: string; schoolId: string | null };
type Team = { id: string; name: string; schoolId: string };
type Row = {
  athleteId: string; athleteName: string | null; status: "READY" | "BLOCKED"; reason: string | null; scheduledAtLocal: string;
  durationSeconds: number | null; distanceMeters: number | null; durationIsPartial: boolean;
  references: Array<{ reference: string; value: number; formula: string }>;
  conflicts: Array<{ assignmentId: string; title: string | null }>;
};
type Result = {
  id: string; complete: boolean; counts: { ok: number; failed: number; blocked: number; undone: number; pending: number };
  recipients: Array<{ athleteId: string; athleteName: string | null; status: string; reason: string | null }>;
};

/** SAM-78 - athletes shown per page on a phone; the rest come with 'Mostrar mais'. */
const PAGE_SIZE = 50;

export function BatchAssign({
  athletes, teams, schools, prescription,
}: {
  athletes: Athlete[];
  teams: Team[];
  schools: Array<{ id: string; name: string }>;
  prescription: { title: string; sportType: string; description: string | null; blocks: unknown[]; templateId: string; templateVersion: number };
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<string>(schools.length > 0 && !athletes.some((athlete) => athlete.schoolId === null) ? schools[0]!.id : "independente");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [teamId, setTeamId] = useState("");
  const [when, setWhen] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [overrides, setOverrides] = useState<Record<string, { scheduledAtLocal?: string; description?: string }>>({});
  const [include, setInclude] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [key] = useState(() => `batch-${prescription.templateId}-${Math.random().toString(36).slice(2)}-${new Date().getTime()}`);
  // SAM-78 (par. 19.4) - big classes on a phone: the list grows by pages, selection is explicit and named.
  const [shown, setShown] = useState(PAGE_SIZE);

  const scopeValue = scope === "independente" ? { kind: "independent" as const } : { kind: "school" as const, schoolId: scope };
  const visible = useMemo(
    () => athletes.filter((athlete) => (scope === "independente" ? athlete.schoolId === null : athlete.schoolId === scope) && athlete.label.toLowerCase().includes(search.toLowerCase())),
    [athletes, scope, search],
  );
  const base = { ...prescription, scheduledAtLocal: when };

  async function call<T>(url: string, body: unknown): Promise<T | null> {
    setError(null);
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = (await response.json().catch(() => null)) as (T & { message?: string }) | null;
    if (!response.ok) { setError(payload?.message ?? "Não foi possível concluir."); return null; }
    return payload;
  }

  function preview() {
    startTransition(async () => {
      const data = await call<Row[]>("/api/assignment-batches/preview", { scope: scopeValue, athleteIds: selected, teamId: teamId || null, prescription: base, overrides });
      if (data) {
        setRows(data);
        setInclude(Object.fromEntries(data.map((row) => [row.athleteId, row.status === "READY"])));
      }
    });
  }

  function publish() {
    if (!rows) return;
    startTransition(async () => {
      const recipients = rows.filter((row) => include[row.athleteId]).map((row) => ({ athleteId: row.athleteId, overrides: overrides[row.athleteId] ?? {} }));
      const data = await call<Result>("/api/assignment-batches", { scope: scopeValue, idempotencyKey: key, teamId: teamId || null, prescription: base, recipients });
      if (data) setResult(data);
    });
  }

  function retry() {
    if (!result) return;
    startTransition(async () => {
      const data = await call<Result>(`/api/assignment-batches/${result.id}/retry`, {});
      if (data) setResult(data);
    });
  }

  function undo() {
    if (!result) return;
    startTransition(async () => {
      await call(`/api/assignment-batches/${result.id}/undo`, {});
      const response = await fetch(`/api/assignment-batches/${result.id}`);
      if (response.ok) setResult((await response.json()) as Result);
    });
  }

  if (result) {
    return (
      <SectionCard title="Resultado por destinatário" description={result.complete ? "Todos publicados." : "Publicação parcial: veja quem falhou e por quê."}>
        <p className="mb-3 text-sm" data-testid="batch-counts">
          {result.counts.ok} publicados · {result.counts.failed} com falha · {result.counts.blocked} bloqueados{result.counts.undone ? ` · ${result.counts.undone} desfeitos` : ""}
        </p>
        <ul className="space-y-1.5" data-testid="batch-results">
          {result.recipients.map((recipient) => (
            <li key={recipient.athleteId} className={`${ITEM_CLASS} text-sm`} data-testid="batch-result" data-status={recipient.status}>
              <span className="font-medium">{recipient.athleteName ?? recipient.athleteId}</span> — {recipient.status}
              {recipient.reason ? <span className="block text-xs text-foreground/60">{recipient.reason}</span> : null}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          {result.counts.failed > 0 && <button type="button" disabled={pending} onClick={retry} className={PRIMARY_ACTION_CLASS}>Repetir falhas</button>}
          {result.counts.ok > 0 && <button type="button" disabled={pending} onClick={undo} className={SECONDARY_ACTION_CLASS}>Desfazer sessões futuras</button>}
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-rose-400">{error}</p>}
      </SectionCard>
    );
  }

  return (
    <div className="space-y-5">
      <SectionCard title="Destinatários" description="Nomes visíveis e contagem antes de publicar. Cada aluno recebe a própria prescrição.">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-sm">Contexto
            <select value={scope} onChange={(event) => { setScope(event.target.value); setSelected([]); setTeamId(""); setRows(null); }} className={FIELD_CLASS}>
              <option value="independente">Independente</option>
              {schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
            </select>
          </label>
          {scope !== "independente" && (
            <label className="grid gap-1 text-sm">Turma (opcional)
              <select value={teamId} onChange={(event) => setTeamId(event.target.value)} className={FIELD_CLASS}>
                <option value="">Sem turma</option>
                {teams.filter((team) => team.schoolId === scope).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>
          )}
          <label className="grid gap-1 text-sm">Buscar atleta
            <input value={search} onChange={(event) => setSearch(event.target.value)} className={FIELD_CLASS} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span data-testid="batch-visible-count">{visible.length} atleta(s) na busca</span>
          {visible.length > 0 && (
            <button type="button" className={SECONDARY_ACTION_CLASS} data-testid="batch-select-visible"
              onClick={() => setSelected((current) => [...new Set([...current, ...visible.map((athlete) => athlete.athleteId)])])}>
              Selecionar os {visible.length} da busca
            </button>
          )}
          {selected.length > 0 && <button type="button" className={SECONDARY_ACTION_CLASS} onClick={() => setSelected([])}>Limpar seleÃ§Ã£o</button>}
        </div>
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2" data-testid="batch-athletes" aria-label="Atletas disponÃ­veis">
          {visible.slice(0, shown).map((athlete) => (
            <li key={athlete.athleteId}>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={selected.includes(athlete.athleteId)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, athlete.athleteId] : current.filter((id) => id !== athlete.athleteId))} />
                {athlete.label}
              </label>
            </li>
          ))}
        </ul>
        {visible.length > shown && (
          <button type="button" className={`${SECONDARY_ACTION_CLASS} mt-2`} data-testid="batch-show-more" onClick={() => setShown((current) => current + PAGE_SIZE)}>
            Mostrar mais ({visible.length - shown} restantes)
          </button>
        )}
        <p className="mt-2 text-xs text-foreground/60" data-testid="batch-selected-count">{selected.length} selecionado(s){teamId ? " + membros da turma" : ""}</p>
        {selected.length > 0 && (
          <details className="mt-1 text-xs">
            <summary className="cursor-pointer">Ver os {selected.length} nomes selecionados</summary>
            <ul className="mt-1 flex flex-wrap gap-1" data-testid="batch-selected-names" aria-label="Atletas selecionados">
              {selected.map((id) => athletes.find((athlete) => athlete.athleteId === id)).filter((athlete): athlete is (typeof athletes)[number] => Boolean(athlete)).map((athlete) => (
                <li key={athlete.athleteId} className="rounded-full border border-white/10 px-2 py-0.5">
                  {athlete.label}{" "}
                  <button type="button" aria-label={`Remover ${athlete.label} da seleÃ§Ã£o`} className="text-foreground/60" onClick={() => setSelected((current) => current.filter((value) => value !== athlete.athleteId))}>Ã—</button>
                </li>
              ))}
            </ul>
          </details>
        )}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm">Data e hora
            <input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} className={FIELD_CLASS} aria-label="Data e hora" />
          </label>
          <button type="button" disabled={pending || !when || (selected.length === 0 && !teamId)} onClick={preview} className={PRIMARY_ACTION_CLASS} data-testid="batch-preview">Ver prévia</button>
        </div>
      </SectionCard>

      {rows && (
        <SectionCard title={`Prévia (${rows.length})`} description="Uma linha por aluno. Linhas bloqueadas não são publicadas; conflitos nunca são sobrescritos.">
          <ul className="space-y-2" data-testid="batch-preview-rows">
            {rows.map((row) => (
              <li key={row.athleteId} className={`${ITEM_CLASS} space-y-1.5 text-sm`} data-testid="batch-preview-row" data-status={row.status}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2 font-medium">
                    <input type="checkbox" disabled={row.status === "BLOCKED"} checked={Boolean(include[row.athleteId])} onChange={(event) => setInclude((current) => ({ ...current, [row.athleteId]: event.target.checked }))} />
                    {row.athleteName ?? row.athleteId}
                  </label>
                  <span className="text-xs text-foreground/60">
                    {[row.distanceMeters ? formatDistance(row.distanceMeters) : null, row.durationSeconds ? `${row.durationIsPartial ? "≥ " : ""}${formatDuration(row.durationSeconds)}` : null].filter(Boolean).join(" · ")}
                  </span>
                </div>
                {row.status === "BLOCKED" && <p className="text-xs text-amber-300" data-testid="batch-blocked-reason">{row.reason}</p>}
                {row.references.map((reference, index) => <p key={index} className="text-xs text-foreground/60">{reference.formula}</p>)}
                {row.conflicts.length > 0 && <p className="text-xs text-amber-300">Já há {row.conflicts.length} sessão(ões) neste dia: {row.conflicts.map((conflict) => conflict.title ?? "treino").join(", ")}. Nada será sobrescrito.</p>}
                {row.status === "READY" && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="grid gap-1 text-xs">Data individual
                      <input type="datetime-local" value={overrides[row.athleteId]?.scheduledAtLocal ?? row.scheduledAtLocal} onChange={(event) => setOverrides((current) => ({ ...current, [row.athleteId]: { ...current[row.athleteId], scheduledAtLocal: event.target.value } }))} className={FIELD_CLASS} aria-label={`Data de ${row.athleteName ?? row.athleteId}`} />
                    </label>
                    <label className="grid gap-1 text-xs">Instruções individuais
                      <input value={overrides[row.athleteId]?.description ?? ""} onChange={(event) => setOverrides((current) => ({ ...current, [row.athleteId]: { ...current[row.athleteId], description: event.target.value } }))} className={FIELD_CLASS} aria-label={`Instruções de ${row.athleteName ?? row.athleteId}`} />
                    </label>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <button type="button" disabled={pending || !rows.some((row) => include[row.athleteId])} onClick={publish} className={`${PRIMARY_ACTION_CLASS} mt-3`} data-testid="batch-publish">
            Publicar {rows.filter((row) => include[row.athleteId]).length} selecionado(s)
          </button>
        </SectionCard>
      )}
      {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
    </div>
  );
}
