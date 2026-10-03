"use client";

/**
 * SAM-68 — the coordination's actions: assign a coach to a preparation
 * without a responsible, and add a collaborator coach by discipline.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { FIELD_CLASS, PRIMARY_ACTION_CLASS } from "@/components/page-header";

async function post(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = (await response.json().catch(() => null)) as { message?: string } | null;
  if (!response.ok) throw new Error(payload?.message ?? "Não foi possível concluir.");
}

type Option = { id: string; name: string };

export function AssignCoachForm({ preparationId, expectedVersion, coaches, athleteName }: { preparationId: string; expectedVersion: number; coaches: Option[]; athleteName: string }) {
  const router = useRouter();
  const [coachId, setCoachId] = useState(coaches[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-2 text-sm"
      data-testid="assign-coach-form"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          try { await post(`/api/preparations/${preparationId}/assign-coach`, { coachId, expectedVersion }); router.refresh(); }
          catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível atribuir."); }
        });
      }}
    >
      <label className="grid gap-1">Professor responsável
        <select value={coachId} onChange={(event) => setCoachId(event.target.value)} className={FIELD_CLASS} aria-label={`Professor para ${athleteName}`}>
          {coaches.map((coach) => <option key={coach.id} value={coach.id}>{coach.name}</option>)}
        </select>
      </label>
      <button type="submit" disabled={pending || !coachId} className={PRIMARY_ACTION_CLASS}>Atribuir professor</button>
      {error && <p role="alert" className="w-full text-xs text-rose-400">{error}</p>}
    </form>
  );
}

export function CollaboratorForm({ schoolId, athletes, coaches }: { schoolId: string; athletes: Option[]; coaches: Option[] }) {
  const router = useRouter();
  const [athleteId, setAthleteId] = useState(athletes[0]?.id ?? "");
  const [coachId, setCoachId] = useState(coaches[0]?.id ?? "");
  const [discipline, setDiscipline] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="grid gap-2 text-sm sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
      data-testid="collaborator-form"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        startTransition(async () => {
          try {
            await post(`/api/schools/${schoolId}/collaborators`, { athleteId, coachId, discipline: discipline || null });
            setMessage({ tone: "ok", text: "Colaborador adicionado. O responsável pelo planejamento continua o mesmo." });
            router.refresh();
          } catch (failure) { setMessage({ tone: "error", text: failure instanceof Error ? failure.message : "Não foi possível adicionar." }); }
        });
      }}
    >
      <label className="grid gap-1">Aluno<select value={athleteId} onChange={(event) => setAthleteId(event.target.value)} className={FIELD_CLASS} aria-label="Aluno">{athletes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="grid gap-1">Professor colaborador<select value={coachId} onChange={(event) => setCoachId(event.target.value)} className={FIELD_CLASS} aria-label="Professor colaborador">{coaches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="grid gap-1">Disciplina<input maxLength={60} value={discipline} onChange={(event) => setDiscipline(event.target.value)} className={FIELD_CLASS} aria-label="Disciplina" placeholder="natação" /></label>
      <button type="submit" disabled={pending} className={PRIMARY_ACTION_CLASS}>Adicionar colaborador</button>
      {message && <p role={message.tone === "error" ? "alert" : "status"} className={`text-xs sm:col-span-4 ${message.tone === "error" ? "text-rose-400" : "text-foreground/70"}`}>{message.text}</p>}
    </form>
  );
}
