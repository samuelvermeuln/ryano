"use client";

/**
 * SAM-78 — the forms of the collaborative catalog: a coach proposes a personal
 * template to a school; the school assigns catalog roles and reviews
 * proposals. Every control is labelled; status is text, never colour alone.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { FIELD_CLASS, PRIMARY_ACTION_CLASS, SECONDARY_ACTION_CLASS } from "@/components/page-header";
import { CATALOG_ROLE_LABELS, CATALOG_ROLES } from "@/modules/school/domain/catalog-roles";

async function send(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = (await response.json().catch(() => null)) as { message?: string; details?: Array<{ message: string }> } | null;
  if (!response.ok) throw new Error(payload?.details?.[0]?.message ?? payload?.message ?? "Não foi possível concluir.");
  return payload;
}

function useSubmit() {
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (work: () => Promise<string>) => {
    setMessage(null);
    startTransition(async () => {
      try { setMessage({ tone: "ok", text: await work() }); router.refresh(); } catch (failure) { setMessage({ tone: "error", text: failure instanceof Error ? failure.message : "Não foi possível concluir." }); }
    });
  };
  const feedback = message ? <span role={message.tone === "error" ? "alert" : "status"} className={`text-xs ${message.tone === "error" ? "text-rose-400" : "text-emerald-500"}`}>{message.text}</span> : null;
  return { run, pending, feedback };
}
const values = (event: FormEvent<HTMLFormElement>) => Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>;

export function ProposeTemplateForm({ templateId, schools }: { templateId: string; schools: Array<{ id: string; name: string }> }) {
  const { run, pending, feedback } = useSubmit();
  if (schools.length === 0) return null;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-xs underline">Propor para a escola</summary>
      <form className="mt-2 grid gap-2 sm:grid-cols-2" data-testid="propose-template" onSubmit={(event) => { event.preventDefault(); const v = values(event); run(async () => { const result = await send(`/api/workout-catalog/${templateId}/propose`, { schoolId: v.schoolId, note: v.note || null, usageRights: v.usageRights || null }) as { duplicate?: boolean } | null; return result?.duplicate ? "Já existe uma proposta pendente deste modelo para esta escola." : "Proposta enviada para revisão da escola."; }); }}>
        <label className="grid gap-1">Escola
          <select name="schoolId" className={FIELD_CLASS} aria-label="Escola da proposta">{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select>
        </label>
        <label className="grid gap-1">Direitos de uso / origem do material<input name="usageRights" maxLength={300} className={FIELD_CLASS} placeholder="autoral; adaptado de…" aria-label="Direitos de uso" /></label>
        <label className="grid gap-1 sm:col-span-2">Nota para a revisão<input name="note" maxLength={1000} className={FIELD_CLASS} aria-label="Nota da proposta" /></label>
        <div className="flex items-center gap-2 sm:col-span-2"><button type="submit" disabled={pending} className={SECONDARY_ACTION_CLASS}>Enviar proposta</button>{feedback}</div>
      </form>
    </details>
  );
}

export function CatalogRoleForm({ schoolId, coachId, name, current }: { schoolId: string; coachId: string; name: string; current: string | null }) {
  const { run, pending, feedback } = useSubmit();
  return (
    <form className="flex flex-wrap items-center gap-2 text-sm" data-testid="catalog-role" onSubmit={(event) => { event.preventDefault(); const v = values(event); run(async () => { await send(`/api/schools/${schoolId}/catalog-roles`, { coachId, role: v.role || null }); return "Papel salvo."; }); }}>
      <span className="min-w-40">{name}</span>
      <select name="role" defaultValue={current ?? ""} className={`${FIELD_CLASS} w-auto`} aria-label={`Papel de ${name} no catálogo`}>
        <option value="">Sem papel (lê o institucional)</option>
        {CATALOG_ROLES.map((role) => <option key={role} value={role}>{CATALOG_ROLE_LABELS[role]}</option>)}
      </select>
      <button type="submit" disabled={pending} className={SECONDARY_ACTION_CLASS}>Salvar</button>
      {feedback}
    </form>
  );
}

export function ReviewProposalForm({ proposalId }: { proposalId: string }) {
  const { run, pending, feedback } = useSubmit();
  return (
    <form className="flex flex-wrap items-end gap-2 text-sm" data-testid="review-proposal" onSubmit={(event) => { event.preventDefault(); const v = values(event); const decision = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ?? "APPROVE"; run(async () => { await send(`/api/workout-catalog/proposals/${proposalId}`, { decision, reviewNote: v.reviewNote || null }); return decision === "APPROVE" ? "Publicado no catálogo institucional, com a autoria do professor." : "Proposta recusada."; }); }}>
      <label className="grid gap-1">Nota da revisão<input name="reviewNote" maxLength={1000} className={FIELD_CLASS} aria-label="Nota da revisão" /></label>
      <button type="submit" name="decision" value="APPROVE" disabled={pending} className={PRIMARY_ACTION_CLASS}>Publicar no institucional</button>
      <button type="submit" name="decision" value="REJECT" disabled={pending} className={SECONDARY_ACTION_CLASS}>Recusar</button>
      {feedback}
    </form>
  );
}
