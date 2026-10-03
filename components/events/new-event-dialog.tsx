"use client";

/**
 * SAM-57 — register an event (§6 steps 1–3): from "Meus eventos → Novo" and
 * from "Calendário → Adicionar evento". Search a visible event or create a
 * personal one; pick/describe the distance; desired goal, suggested priority
 * and availability. A suspected duplicate is shown ("é este?" / "é outro").
 * The confirmation says who will assess it, or that nobody is responsible yet.
 * Works without a coach (§22.6).
 */
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Modal } from "@/components/modal";
import { FIELD_CLASS, PRIMARY_ACTION_CLASS, SECONDARY_ACTION_CLASS } from "@/components/page-header";

type SportOption = { value: string; label: string };
type Found = { id: string; name: string; edition: string | null; startLocalDate: string; city: string | null; options: Array<{ id: string; label: string }> };
type Candidate = { id: string; name: string; edition: string | null; startLocalDate: string; city: string | null };

const EVENT_TYPES = [
  { value: "COMPETITION", label: "Competição" },
  { value: "ORGANIZED_CROSSING", label: "Travessia organizada" },
  { value: "PERSONAL_CHALLENGE", label: "Desafio pessoal" },
  { value: "RECREATIONAL", label: "Evento recreativo" },
  { value: "SIMULATION", label: "Simulado" },
  { value: "ASSESSMENT", label: "Avaliação" },
];

const PRIORITIES = [
  { value: "MAIN", label: "Principal" },
  { value: "SECONDARY", label: "Secundária" },
  { value: "EXPERIENCE", label: "Experiência" },
];

function formatLocal(date: string) {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

export function NewEventDialog({ sports, label = "Novo evento", defaultTimeZone = "America/Sao_Paulo" }: { sports: SportOption[]; label?: string; defaultTimeZone?: string }) {
  const router = useRouter();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [picked, setPicked] = useState<{ eventId: string; optionId: string | null; name: string } | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [form, setForm] = useState({
    name: "", type: "COMPETITION", sportType: sports[0]?.value ?? "run", startLocalDate: "", city: "",
    optionLabel: "", distanceValue: "", distanceUnit: "km",
    goalText: "", suggestedPriority: "MAIN", availabilityUntilEvent: "",
  });
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));

  function reset() {
    setError(null); setConfirmation(null); setQuery(""); setFound(null); setPicked(null); setCandidates(null);
  }

  function search() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/events/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) { setError("Não foi possível buscar agora."); return; }
      setFound((await response.json()) as Found[]);
    });
  }

  function participationBody() {
    return {
      goalText: form.goalText || null,
      suggestedPriority: form.suggestedPriority,
      availabilityUntilEvent: form.availabilityUntilEvent || null,
    };
  }

  function submit(body: Record<string, unknown>) {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = (await response.json().catch(() => null)) as { id?: string; message?: string; code?: string; candidates?: Candidate[] } | null;
      if (response.status === 409 && payload?.code === "EVENT_DUPLICATE_SUSPECTED") {
        setCandidates(payload.candidates ?? []);
        return;
      }
      if (!response.ok || !payload?.id) { setError(payload?.message ?? "Não foi possível registrar o evento."); return; }
      // The state the athlete reads (§6 passo 5): who will assess, or nobody yet.
      const list = (await (await fetch("/api/events")).json().catch(() => null)) as { participations?: Array<{ id: string; preparation: { statusText: string } | null }> } | null;
      const created = list?.participations?.find((item) => item.id === payload.id);
      setConfirmation(created?.preparation?.statusText ?? "Evento registrado.");
      router.refresh();
    });
  }

  function createNew(confirmDistinct = false) {
    const option = form.optionLabel || form.distanceValue
      ? {
        label: form.optionLabel || `${form.distanceValue} ${form.distanceUnit}`,
        ...(form.distanceValue ? { distanceValue: Number(form.distanceValue.replace(",", ".")), distanceUnit: form.distanceUnit } : {}),
      }
      : undefined;
    submit({
      confirmDistinct,
      event: { name: form.name, type: form.type, sportType: form.sportType, startLocalDate: form.startLocalDate, timeZone: defaultTimeZone, city: form.city || null },
      ...(option ? { option } : {}),
      participation: participationBody(),
    });
  }

  return (
    <>
      <button ref={trigger} type="button" onClick={() => { reset(); setOpen(true); }} className={PRIMARY_ACTION_CLASS} data-testid="new-event-button">
        {label}
      </button>
      {open && (
        <Modal title="Registrar evento" size="lg" onClose={() => setOpen(false)} returnFocusTo={trigger}>
          {confirmation ? (
            <div className="space-y-4" data-testid="new-event-confirmation">
              <p className="text-sm">{confirmation}</p>
              <button type="button" className={PRIMARY_ACTION_CLASS} onClick={() => setOpen(false)}>Fechar</button>
            </div>
          ) : candidates ? (
            <div className="space-y-3" data-testid="new-event-duplicates">
              <p className="text-sm">Encontramos um evento parecido. É este?</p>
              <ul className="space-y-2">
                {candidates.map((candidate) => (
                  <li key={candidate.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm">
                    <span>{candidate.name}{candidate.edition ? ` ${candidate.edition}` : ""} · {formatLocal(candidate.startLocalDate)}{candidate.city ? ` · ${candidate.city}` : ""}</span>
                    <button type="button" className={SECONDARY_ACTION_CLASS} disabled={pending} onClick={() => submit({ eventId: candidate.id, participation: participationBody() })}>É este</button>
                  </li>
                ))}
              </ul>
              <button type="button" className={PRIMARY_ACTION_CLASS} disabled={pending} onClick={() => createNew(true)}>É outro evento</button>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (picked) submit({ eventId: picked.eventId, ...(picked.optionId ? { optionId: picked.optionId } : {}), participation: participationBody() });
                else createNew(false);
              }}
            >
              <fieldset className="space-y-2">
                <legend className="text-xs uppercase tracking-wide text-foreground/50">Buscar evento existente</legend>
                <div className="flex gap-2">
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome do evento" aria-label="Buscar evento" className={FIELD_CLASS} />
                  <button type="button" onClick={search} disabled={pending} className={SECONDARY_ACTION_CLASS}>Buscar</button>
                </div>
                {found && found.length === 0 && <p className="text-xs text-foreground/55">Nenhum evento encontrado. Cadastre abaixo.</p>}
                {found && found.length > 0 && (
                  <ul className="space-y-1.5">
                    {found.map((item) => (
                      <li key={item.id} className="rounded-xl border border-white/10 px-3 py-2 text-sm">
                        <p className="font-medium">{item.name} · {formatLocal(item.startLocalDate)}{item.city ? ` · ${item.city}` : ""}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {(item.options.length > 0 ? item.options : [{ id: "", label: "Sem distância definida" }]).map((option) => (
                            <button
                              key={option.id || "none"}
                              type="button"
                              onClick={() => setPicked({ eventId: item.id, optionId: option.id || null, name: `${item.name} — ${option.label}` })}
                              className={`rounded-full border px-2.5 py-1 text-xs ${picked?.eventId === item.id && (picked.optionId ?? "") === option.id ? "border-primary/40 bg-primary/15" : "border-white/12"}`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {picked && <p className="text-xs" data-testid="new-event-picked">Escolhido: {picked.name} <button type="button" className="underline" onClick={() => setPicked(null)}>trocar</button></p>}
              </fieldset>

              {!picked && (
                <fieldset className="grid gap-3 sm:grid-cols-2">
                  <legend className="mb-1 text-xs uppercase tracking-wide text-foreground/50 sm:col-span-2">Ou cadastre um evento pessoal (fica privado)</legend>
                  <label className="grid gap-1 text-sm sm:col-span-2">Nome do evento<input required minLength={2} value={form.name} onChange={set("name")} className={FIELD_CLASS} /></label>
                  <label className="grid gap-1 text-sm">Tipo<select value={form.type} onChange={set("type")} className={FIELD_CLASS}>{EVENT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                  <label className="grid gap-1 text-sm">Modalidade<select value={form.sportType} onChange={set("sportType")} className={FIELD_CLASS}>{sports.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                  <label className="grid gap-1 text-sm">Data<input type="date" required value={form.startLocalDate} onChange={set("startLocalDate")} className={FIELD_CLASS} /></label>
                  <label className="grid gap-1 text-sm">Cidade<input value={form.city} onChange={set("city")} className={FIELD_CLASS} /></label>
                  <label className="grid gap-1 text-sm">Distância<input inputMode="decimal" value={form.distanceValue} onChange={set("distanceValue")} className={FIELD_CLASS} placeholder="2" /></label>
                  <label className="grid gap-1 text-sm">Unidade<select value={form.distanceUnit} onChange={set("distanceUnit")} className={FIELD_CLASS}><option value="m">m</option><option value="km">km</option><option value="yd">yd</option><option value="mi">mi</option></select></label>
                </fieldset>
              )}

              <fieldset className="grid gap-3 sm:grid-cols-2">
                <legend className="mb-1 text-xs uppercase tracking-wide text-foreground/50 sm:col-span-2">Sua participação</legend>
                <label className="grid gap-1 text-sm sm:col-span-2">Objetivo desejado<textarea value={form.goalText} onChange={set("goalText")} maxLength={2000} rows={2} className={FIELD_CLASS} placeholder="Ex.: concluir com controle e boa orientação" /></label>
                <label className="grid gap-1 text-sm">Prioridade sugerida<select value={form.suggestedPriority} onChange={set("suggestedPriority")} className={FIELD_CLASS}>{PRIORITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                <label className="grid gap-1 text-sm">Disponibilidade até a prova<input value={form.availabilityUntilEvent} onChange={set("availabilityUntilEvent")} maxLength={1000} className={FIELD_CLASS} placeholder="Ex.: 4 treinos por semana" /></label>
              </fieldset>

              {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" className={SECONDARY_ACTION_CLASS} onClick={() => setOpen(false)}>Cancelar</button>
                <button type="submit" disabled={pending} className={PRIMARY_ACTION_CLASS} data-testid="new-event-submit">Registrar evento</button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
