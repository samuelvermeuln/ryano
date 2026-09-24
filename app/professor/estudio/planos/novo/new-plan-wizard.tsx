"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconCopy, IconPlus, IconTrash } from "@tabler/icons-react";
import {
  duplicatePlanWeek,
  planPayloadSchemaV2,
  type PlanPayloadV2,
  type PlanWeekV2,
} from "@/modules/school/domain/training-product-version";
import { RYVANO_SPORT_TYPES, getRyvanoSportLabel, isRyvanoSportType, type RyvanoSportType } from "@/modules/shared/activities/sport-types";

type TemplateOption = { id: string; title: string; sportType: string; ownerLabel: "Meus templates" | "Templates da escola" };
type SchoolOption = { id: string; name: string };

const WEEKDAY_LABEL: Record<number, string> = {
  1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado", 7: "Domingo",
};

function newSessionId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `s-${Date.now()}-${Math.random()}`;
}

function defaultSportType(templateSportType: string): RyvanoSportType {
  return isRyvanoSportType(templateSportType) ? templateSportType : "default";
}

export function NewPlanWizard({
  manageableSchools,
  templates,
}: {
  manageableSchools: SchoolOption[];
  templates: TemplateOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // ── Step 1: product basics (Q3 decided here — "em meu nome" × escola) ──────
  const [productId, setProductId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [durationWeeks, setDurationWeeks] = useState("12");
  const [ownerSchoolId, setOwnerSchoolId] = useState<string>(""); // "" = em nome próprio

  // ── Step 2: plan editor ─────────────────────────────────────────────────────
  const [weeks, setWeeks] = useState<PlanWeekV2[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const payload: PlanPayloadV2 = useMemo(() => ({ weeks }), [weeks]);
  const validation = useMemo(() => planPayloadSchemaV2.safeParse(payload), [payload]);

  function createProduct() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/coach/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description.trim() || null,
          durationWeeks: durationWeeks ? Number(durationWeeks) : null,
          ...(ownerSchoolId ? { schoolId: ownerSchoolId } : {}),
        }),
      });
      const data = await res.json() as { id?: string; message?: string };
      if (!res.ok) {
        setError(data.message ?? "Não foi possível criar o plano.");
        return;
      }
      setProductId(data.id ?? null);
      setWeeks([{ week: 1, days: [] }]);
    });
  }

  function addWeek() {
    const nextNumber = (weeks.at(-1)?.week ?? 0) + 1;
    setWeeks((prev) => [...prev, { week: nextNumber, days: [] }]);
  }

  function duplicateWeek(index: number) {
    const nextNumber = (weeks.at(-1)?.week ?? 0) + 1;
    const clone = duplicatePlanWeek(weeks[index], nextNumber);
    setWeeks((prev) => [...prev, clone]);
  }

  function removeWeek(index: number) {
    setWeeks((prev) => prev.filter((_, i) => i !== index));
  }

  function addDay(weekIndex: number, dayOfWeek: number) {
    setWeeks((prev) => prev.map((week, i) => {
      if (i !== weekIndex || week.days.some((d) => d.dayOfWeek === dayOfWeek)) return week;
      return { ...week, days: [...week.days, { dayOfWeek, sessions: [] }] };
    }));
  }

  function removeDay(weekIndex: number, dayOfWeek: number) {
    setWeeks((prev) => prev.map((week, i) => i !== weekIndex
      ? week
      : { ...week, days: week.days.filter((d) => d.dayOfWeek !== dayOfWeek) }));
  }

  function addSession(weekIndex: number, dayOfWeek: number) {
    const firstTemplate = templates[0];
    if (!firstTemplate) return;
    setWeeks((prev) => prev.map((week, i) => {
      if (i !== weekIndex) return week;
      return {
        ...week,
        days: week.days.map((day) => day.dayOfWeek !== dayOfWeek ? day : {
          ...day,
          sessions: [...day.sessions, {
            planSessionId: newSessionId(),
            workoutTemplateId: firstTemplate.id,
            sportType: defaultSportType(firstTemplate.sportType),
            order: day.sessions.length,
          }],
        }),
      };
    }));
  }

  function updateSession(weekIndex: number, dayOfWeek: number, sessionIndex: number, patch: Partial<PlanWeekV2["days"][number]["sessions"][number]>) {
    setWeeks((prev) => prev.map((week, i) => {
      if (i !== weekIndex) return week;
      return {
        ...week,
        days: week.days.map((day) => day.dayOfWeek !== dayOfWeek ? day : {
          ...day,
          sessions: day.sessions.map((session, si) => si !== sessionIndex ? session : { ...session, ...patch }),
        }),
      };
    }));
  }

  function removeSession(weekIndex: number, dayOfWeek: number, sessionIndex: number) {
    setWeeks((prev) => prev.map((week, i) => {
      if (i !== weekIndex) return week;
      return {
        ...week,
        days: week.days.map((day) => day.dayOfWeek !== dayOfWeek ? day : {
          ...day,
          sessions: day.sessions.filter((_, si) => si !== sessionIndex),
        }),
      };
    }));
  }

  function saveDraft(publish: boolean) {
    if (!productId) return;
    setError(null);
    startTransition(async () => {
      const draftRes = await fetch(`/api/coach/products/${productId}/draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: { schemaVersion: 2, planPayload: payload } }),
      });
      const draftData = await draftRes.json() as { message?: string };
      if (!draftRes.ok) {
        setError(draftData.message ?? "Não foi possível salvar o rascunho.");
        return;
      }
      setSavedAt(new Date().toLocaleTimeString("pt-BR"));

      if (publish) {
        const publishRes = await fetch(`/api/coach/products/${productId}/publish`, { method: "POST" });
        const publishData = await publishRes.json() as { message?: string };
        if (!publishRes.ok) {
          setError(publishData.message ?? "Não foi possível publicar o plano.");
          return;
        }
        router.push(`/professor/estudio/planos/${productId}`);
      }
    });
  }

  function templateFor(id: string) {
    return templates.find((t) => t.id === id);
  }

  // ── Step 1 UI ────────────────────────────────────────────────────────────
  if (!productId) {
    return (
      <section className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="text-base font-semibold">1. Dados básicos</h2>

        <div className="space-y-1.5">
          <label htmlFor="plan-title" className="text-sm font-medium block">Título do plano</label>
          <input
            id="plan-title" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex.: Base de 12 semanas para 10km"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="plan-description" className="text-sm font-medium block">Descrição</label>
          <textarea
            id="plan-description" value={description} onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="plan-duration" className="text-sm font-medium block">Duração (semanas)</label>
          <input
            id="plan-duration" type="number" min={1} max={520} value={durationWeeks}
            onChange={(e) => setDurationWeeks(e.target.value)}
            className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {manageableSchools.length > 0 && (
          <div className="space-y-1.5">
            <label htmlFor="plan-owner" className="text-sm font-medium block">Publicar como</label>
            <select
              id="plan-owner" value={ownerSchoolId} onChange={(e) => setOwnerSchoolId(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Em meu nome (professor independente)</option>
              {manageableSchools.map((school) => (
                <option key={school.id} value={school.id}>Em nome de {school.name}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              A receita e a continuidade do plano ficam com quem você escolher aqui — essa decisão não muda depois.
            </p>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="button" disabled={isPending || title.trim().length === 0 || templates.length === 0}
          onClick={createProduct}
          className="w-full rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Criando…" : "Continuar para o editor"}
        </button>
      </section>
    );
  }

  // ── Step 2 UI: editor ────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-semibold">2. Montar o plano</h2>
          <button
            type="button" onClick={addWeek}
            className="inline-flex items-center gap-1.5 text-xs rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-muted"
          >
            <IconPlus size={14} /> Adicionar semana
          </button>
        </div>

        {weeks.length === 0 && (
          <p className="text-sm text-muted-foreground">Adicione a primeira semana para começar.</p>
        )}

        <div className="space-y-5">
          {weeks.map((week, weekIndex) => (
            <div key={week.week} className="rounded-lg border border-border/70 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Semana {week.week}</h3>
                <div className="flex gap-2">
                  <button
                    type="button" onClick={() => duplicateWeek(weekIndex)} disabled={week.days.length === 0}
                    title="Duplicar semana"
                    className="inline-flex items-center gap-1 text-xs rounded-lg border border-border px-2.5 py-1 font-medium hover:bg-muted disabled:opacity-40"
                  >
                    <IconCopy size={13} /> Duplicar
                  </button>
                  <button
                    type="button" onClick={() => removeWeek(weekIndex)}
                    title="Remover semana"
                    className="inline-flex items-center gap-1 text-xs rounded-lg border border-border px-2.5 py-1 font-medium text-destructive hover:bg-destructive/10"
                  >
                    <IconTrash size={13} />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7].filter((d) => !week.days.some((day) => day.dayOfWeek === d)).map((d) => (
                  <button
                    key={d} type="button" onClick={() => addDay(weekIndex, d)}
                    className="text-xs rounded-full border border-dashed border-border px-2.5 py-1 text-muted-foreground hover:bg-muted"
                  >
                    + {WEEKDAY_LABEL[d]}
                  </button>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[...week.days].sort((a, b) => a.dayOfWeek - b.dayOfWeek).map((day) => (
                  <div key={day.dayOfWeek} className="rounded-lg bg-muted/40 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{WEEKDAY_LABEL[day.dayOfWeek]}</p>
                      <button type="button" onClick={() => removeDay(weekIndex, day.dayOfWeek)} className="text-xs text-destructive hover:underline">
                        remover dia
                      </button>
                    </div>

                    {day.sessions.map((session, sessionIndex) => (
                      <div key={session.planSessionId} className="rounded-md border border-border bg-card p-2.5 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <select
                            value={session.workoutTemplateId}
                            onChange={(e) => {
                              const tpl = templateFor(e.target.value);
                              updateSession(weekIndex, day.dayOfWeek, sessionIndex, {
                                workoutTemplateId: e.target.value,
                                sportType: tpl ? defaultSportType(tpl.sportType) : session.sportType,
                              });
                            }}
                            className="flex-1 min-w-0 rounded-md border border-border bg-background px-2 py-1 text-xs"
                          >
                            {templates.map((tpl) => (
                              <option key={tpl.id} value={tpl.id}>{tpl.title}</option>
                            ))}
                          </select>
                          <button type="button" onClick={() => removeSession(weekIndex, day.dayOfWeek, sessionIndex)} className="shrink-0 text-destructive">
                            <IconTrash size={14} />
                          </button>
                        </div>
                        <select
                          value={session.sportType}
                          onChange={(e) => updateSession(weekIndex, day.dayOfWeek, sessionIndex, { sportType: e.target.value as RyvanoSportType })}
                          className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                          aria-label="Modalidade da sessão"
                        >
                          {RYVANO_SPORT_TYPES.map((sport) => (
                            <option key={sport} value={sport}>{getRyvanoSportLabel(sport)}</option>
                          ))}
                        </select>
                      </div>
                    ))}

                    <button
                      type="button" onClick={() => addSession(weekIndex, day.dayOfWeek)}
                      className="w-full text-xs rounded-md border border-dashed border-border px-2 py-1.5 text-muted-foreground hover:bg-muted"
                    >
                      + sessão {day.sessions.length > 0 ? "(dia multimodal)" : ""}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Preview no ponto de vista do atleta (RF-102) — renderiza exatamente `weeks`, o mesmo estado que será salvo/publicado */}
      <section className="rounded-xl border border-border bg-card p-6 space-y-3">
        <h2 className="text-base font-semibold">Preview do atleta</h2>
        {weeks.every((w) => w.days.length === 0) && (
          <p className="text-sm text-muted-foreground">Adicione dias e sessões para ver o preview.</p>
        )}
        <ol className="space-y-2">
          {weeks.map((week) => (
            <li key={week.week} className="text-sm">
              <p className="font-medium">Semana {week.week}</p>
              <ul className="pl-4 text-muted-foreground space-y-0.5">
                {[...week.days].sort((a, b) => a.dayOfWeek - b.dayOfWeek).map((day) => (
                  <li key={day.dayOfWeek}>
                    {WEEKDAY_LABEL[day.dayOfWeek]}: {day.sessions.map((s) => `${templateFor(s.workoutTemplateId)?.title ?? "?"} (${getRyvanoSportLabel(s.sportType)})`).join(" + ")}
                  </li>
                ))}
                {week.days.length === 0 && <li>Descanso a semana inteira</li>}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!validation.success && weeks.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Complete pelo menos um dia com uma sessão para salvar o rascunho.
        </p>
      )}
      {savedAt && <p className="text-xs text-muted-foreground">Rascunho salvo às {savedAt}.</p>}

      <div className="flex flex-wrap gap-3">
        <button
          type="button" disabled={isPending || !validation.success} onClick={() => saveDraft(false)}
          className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-50"
        >
          {isPending ? "Salvando…" : "Salvar rascunho"}
        </button>
        <button
          type="button" disabled={isPending || !validation.success} onClick={() => saveDraft(true)}
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Publicando…" : "Salvar e publicar"}
        </button>
      </div>
    </div>
  );
}
