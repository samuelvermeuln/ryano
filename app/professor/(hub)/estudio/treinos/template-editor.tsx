"use client";

/**
 * SAM-58 — catalog template editor (§9.2). The block structure uses the
 * SAME `WorkoutBlocksEditor` as the prescription builder. Saving an existing
 * template creates a new immutable version; prescriptions already made keep
 * their own copy (ADR-004, AC08).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, useCallback } from "react";

import { FIELD_CLASS, PRIMARY_ACTION_CLASS, SECONDARY_ACTION_CLASS } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { draftsFromBlocks, emptyBlock, NO_ZONE_OPTIONS, serialize, WorkoutBlocksEditor, type BlockDraft } from "@/components/workouts/workout-blocks-editor";
import { OpenWaterFields } from "@/components/workouts/open-water-fields";
import { SessionV2Editor } from "@/components/workouts/session-v2-editor";
import type { SessionContentV2 } from "@/modules/school/domain/session-content-v2";
import { OPEN_WATER_SESSION_KIND_LABELS, OPEN_WATER_SESSION_KINDS, OPEN_WATER_SPORT, type OpenWaterSession } from "@/modules/school/domain/open-water-session";
import type { TemplateContent } from "@/modules/school/domain/workout-template-content";
import { targetKindForSport } from "@/modules/school/presentation/prescription-targets";
import { isRyvanoSportType } from "@/modules/shared/activities/sport-types";

type Option = { value: string; label: string };

export type TemplateEditorInitial = {
  id: string | null;
  version: number | null;
  meta: {
    title: string; code: string | null; contentKind: string; sportType: string; environment: string | null; sessionType: string | null;
    level: string | null; phase: string | null; tags: string[]; capabilities: string[]; folder: string | null; description: string | null; status: string;
  };
  content: TemplateContent;
};

const LEVELS: Option[] = [
  { value: "", label: "Não definido" }, { value: "BEGINNER", label: "Iniciante" }, { value: "INTERMEDIATE", label: "Intermediário" },
  { value: "ADVANCED", label: "Avançado" }, { value: "PROFESSIONAL", label: "Profissional" },
];
const KINDS: Option[] = [
  { value: "SESSION", label: "Sessão completa" }, { value: "EXERCISE", label: "Exercício/educativo" }, { value: "PLAN", label: "Conjunto/plano autoral" },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1 text-sm"><span className="text-xs font-medium uppercase tracking-wide text-foreground/55">{label}</span>{children}</label>;
}

export function TemplateEditor({
  initial, sports, environments, schools, readOnly = false,
}: {
  initial: TemplateEditorInitial;
  sports: Option[];
  environments: Option[];
  /** Schools where the coach may create institutional templates (only on create). */
  schools: Option[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState("coach");
  const [meta, setMeta] = useState({ ...initial.meta, tagsText: initial.meta.tags.join(", "), capabilitiesText: initial.meta.capabilities.join(", ") });
  const [content, setContent] = useState(initial.content);
  const [blocks, setBlocks] = useState<BlockDraft[]>(() => (initial.content.blocks.length > 0 ? draftsFromBlocks(initial.content.blocks) : [emptyBlock("WARMUP")]));
  const targetKind = meta.sportType && isRyvanoSportType(meta.sportType) ? targetKindForSport(meta.sportType) : null;
  const setMetaField = (key: keyof typeof meta) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setMeta((current) => ({ ...current, [key]: event.target.value }));
  const setContentField = (key: "objective" | "instructions" | "recovery" | "cooldownNotes") => (event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => setContent((current) => ({ ...current, [key]: event.target.value }));
  const setNested = (group: "prerequisites" | "followUp", key: string) => (event: React.ChangeEvent<HTMLInputElement>) => setContent((current) => ({ ...current, [group]: { ...current[group], [key]: event.target.value } }));
  const list = (text: string) => text.split(",").map((item) => item.trim()).filter(Boolean);
  const setOpenWater = useCallback((openWater: OpenWaterSession) => setContent((current) => ({ ...current, openWater })), []);
  // SAM-69 — the same advanced builder as the prescription.
  const [advanced, setAdvanced] = useState(Boolean(initial.content.session));
  const setSession = useCallback((session: SessionContentV2) => setContent((current) => ({ ...current, session })), []);

  function save() {
    setError(null);
    const body = {
      meta: {
        title: meta.title, code: meta.code || null, contentKind: meta.contentKind, sportType: meta.sportType, environment: meta.environment || null,
        sessionType: meta.sessionType || null, level: meta.level || null, phase: meta.phase || null, tags: list(meta.tagsText),
        capabilities: list(meta.capabilitiesText), folder: meta.folder || null, description: meta.description || null,
        status: meta.status === "DRAFT" ? "DRAFT" : "ACTIVE",
      },
      content: {
        ...content,
        blocks: advanced ? [] : serialize(blocks, targetKind),
        openWater: meta.sportType === OPEN_WATER_SPORT ? content.openWater ?? null : null,
        session: advanced ? content.session ?? null : null,
      },
    };
    startTransition(async () => {
      const response = initial.id
        ? await fetch(`/api/workout-catalog/${initial.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, expectedVersion: initial.version }) })
        : await fetch("/api/workout-catalog", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, scope: scope === "coach" ? { kind: "coach" } : { kind: "school", schoolId: scope } }) });
      const payload = (await response.json().catch(() => null)) as { template?: { id: string }; message?: string; details?: Array<{ path: Array<string | number>; message: string }> } | null;
      if (!response.ok || !payload?.template) {
        const detail = payload?.details?.[0];
        setError(detail ? `${detail.path.join(".")}: ${detail.message}` : payload?.message ?? "Não foi possível salvar o modelo.");
        return;
      }
      router.push(`/professor/estudio/treinos/${payload.template.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); save(); }} className="space-y-5" data-testid="template-editor">
      <fieldset disabled={readOnly || pending} className="space-y-5">
        <SectionCard title="Identidade e classificação">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Título"><input required minLength={2} maxLength={200} value={meta.title} onChange={setMetaField("title")} className={FIELD_CLASS} /></Field>
            <Field label="Código"><input maxLength={40} value={meta.code ?? ""} onChange={setMetaField("code")} className={FIELD_CLASS} placeholder="NAT-PISC-001" /></Field>
            <Field label="Tipo de conteúdo"><select value={meta.contentKind} onChange={setMetaField("contentKind")} className={FIELD_CLASS}>{KINDS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
            <Field label="Modalidade"><select required value={meta.sportType} onChange={setMetaField("sportType")} className={FIELD_CLASS}>{sports.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
            <Field label="Ambiente"><select value={meta.environment ?? ""} onChange={setMetaField("environment")} className={FIELD_CLASS}><option value="">Não definido</option>{environments.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
            <Field label="Tipo de sessão"><input maxLength={80} value={meta.sessionType ?? ""} onChange={setMetaField("sessionType")} className={FIELD_CLASS} placeholder="Ex.: técnica, contínuo, intervalado" list={meta.sportType === OPEN_WATER_SPORT ? "open-water-session-kinds" : undefined} /></Field>
            {/* SAM-65 — §13.4 kinds offered for open water (free text stays possible). */}
            <datalist id="open-water-session-kinds">
              {OPEN_WATER_SESSION_KINDS.map((kind) => <option key={kind} value={OPEN_WATER_SESSION_KIND_LABELS[kind]} />)}
            </datalist>
            <Field label="Nível indicativo"><select value={meta.level ?? ""} onChange={setMetaField("level")} className={FIELD_CLASS}>{LEVELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
            <Field label="Fase"><input maxLength={80} value={meta.phase ?? ""} onChange={setMetaField("phase")} className={FIELD_CLASS} placeholder="Ex.: base, específica" /></Field>
            <Field label="Capacidades (vírgula)"><input value={meta.capabilitiesText} onChange={setMetaField("capabilitiesText")} className={FIELD_CLASS} /></Field>
            <Field label="Etiquetas (vírgula)"><input value={meta.tagsText} onChange={setMetaField("tagsText")} className={FIELD_CLASS} /></Field>
            <Field label="Pasta"><input maxLength={80} value={meta.folder ?? ""} onChange={setMetaField("folder")} className={FIELD_CLASS} /></Field>
            <Field label="Estado"><select value={meta.status} onChange={setMetaField("status")} className={FIELD_CLASS}><option value="ACTIVE">Disponível</option><option value="DRAFT">Rascunho</option></select></Field>
            {!initial.id && schools.length > 0 && (
              <Field label="Catálogo"><select value={scope} onChange={(event) => setScope(event.target.value)} className={FIELD_CLASS}><option value="coach">Pessoal</option>{schools.map((item) => <option key={item.value} value={item.value}>Institucional — {item.label}</option>)}</select></Field>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Conteúdo">
          <div className="grid gap-3">
            <Field label="Objetivo"><textarea rows={2} maxLength={1000} value={content.objective ?? ""} onChange={setContentField("objective")} className={FIELD_CLASS} /></Field>
            <Field label="Instruções"><textarea rows={3} maxLength={5000} value={content.instructions ?? ""} onChange={setContentField("instructions")} className={FIELD_CLASS} /></Field>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={advanced} onChange={(event) => setAdvanced(event.target.checked)} />
              Estrutura avançada (séries aninhadas, descanso por posição, saída a cada, piscina em m/jd)
            </label>
            {advanced
              ? <SessionV2Editor initial={content.session ?? null} title={meta.title} onChange={setSession} />
              : <WorkoutBlocksEditor blocks={blocks} setBlocks={setBlocks} zoneOptions={NO_ZONE_OPTIONS} targetKind={targetKind} />}
            {meta.sportType === OPEN_WATER_SPORT && <OpenWaterFields initial={content.openWater ?? null} onChange={setOpenWater} />}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Recuperação"><input maxLength={1000} value={content.recovery ?? ""} onChange={setContentField("recovery")} className={FIELD_CLASS} /></Field>
              <Field label="Volta à calma"><input maxLength={1000} value={content.cooldownNotes ?? ""} onChange={setContentField("cooldownNotes")} className={FIELD_CLASS} /></Field>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Pré-requisitos e acompanhamento">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Habilidades"><input value={content.prerequisites.skills ?? ""} onChange={setNested("prerequisites", "skills")} className={FIELD_CLASS} /></Field>
            <Field label="Equipamentos"><input value={content.prerequisites.equipment ?? ""} onChange={setNested("prerequisites", "equipment")} className={FIELD_CLASS} /></Field>
            <Field label="Local"><input value={content.prerequisites.location ?? ""} onChange={setNested("prerequisites", "location")} className={FIELD_CLASS} /></Field>
            <Field label="Supervisão"><input value={content.prerequisites.supervision ?? ""} onChange={setNested("prerequisites", "supervision")} className={FIELD_CLASS} /></Field>
            <Field label="Avaliações requeridas"><input value={content.prerequisites.assessments ?? ""} onChange={setNested("prerequisites", "assessments")} className={FIELD_CLASS} /></Field>
            <Field label="Parametrização">
              <select value={content.parametrization} onChange={(event) => setContent((current) => ({ ...current, parametrization: event.target.value as "ABSOLUTE" | "RELATIVE" }))} className={FIELD_CLASS}>
                <option value="ABSOLUTE">Absoluta (valores como escritos)</option>
                <option value="RELATIVE">Relativa (resolvida para cada aluno na atribuição)</option>
              </select>
            </Field>
            <Field label="Critério de sucesso"><input value={content.followUp.successCriteria ?? ""} onChange={setNested("followUp", "successCriteria")} className={FIELD_CLASS} /></Field>
            <Field label="Feedback desejado"><input value={content.followUp.desiredFeedback ?? ""} onChange={setNested("followUp", "desiredFeedback")} className={FIELD_CLASS} /></Field>
            <Field label="Métricas prioritárias"><input value={content.followUp.priorityMetrics ?? ""} onChange={setNested("followUp", "priorityMetrics")} className={FIELD_CLASS} /></Field>
          </div>
        </SectionCard>
      </fieldset>

      {error && <p role="alert" className="theme-panel-danger rounded-[20px] border px-4 py-3 text-sm">{error}</p>}
      {!readOnly && (
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={pending} className={PRIMARY_ACTION_CLASS} data-testid="template-save">{initial.id ? "Salvar nova versão" : "Criar modelo"}</button>
          <Link href="/professor/estudio/treinos" className={SECONDARY_ACTION_CLASS}>Cancelar</Link>
        </div>
      )}
    </form>
  );
}
