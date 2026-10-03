"use client";

/**
 * SAM-70 — the forms of the assessments and zone-profiles cards: record an
 * assessment with its protocol, take a result to the sheet (explicit, never
 * automatic), write a zone profile with as many zones as the model has, and
 * associate a profile version with one family of the athlete's zones.
 */
import { useActionState, useState } from "react";

import { FIELD_CLASS, SECONDARY_ACTION_CLASS } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { ASSESSMENT_REFERENCE_META, ASSESSMENT_REFERENCES, ASSESSMENT_SOURCE_LABELS, ASSESSMENT_SOURCES } from "@/modules/school/domain/athlete-assessment";
import { ZONE_FAMILIES, ZONE_FAMILY_LABELS, ZONE_FAMILY_REFERENCES, ZONE_REFERENCE_LABELS, type ZoneFamily } from "@/modules/school/domain/zone-profile";
import {
  assignZoneProfileAction, promoteAssessmentAction, recordAssessmentAction, saveZoneProfileAction, type AthleteHubActionState,
} from "./actions";

const INITIAL: AthleteHubActionState = {};

function Feedback({ state, success }: { state: AthleteHubActionState; success: string }) {
  if (state.success) return <p className="text-xs text-emerald-500" role="status">{success}</p>;
  const errors = Object.values(state.fieldErrors ?? {});
  if (!state.message && errors.length === 0) return null;
  return <p className="text-xs text-destructive" role="alert">{state.message ?? errors[0]}</p>;
}

function RouteFields({ schoolId, athleteId }: { schoolId: string; athleteId: string }) {
  return (
    <>
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="athleteId" value={athleteId} />
    </>
  );
}

export function AssessmentForm({ schoolId, athleteId, sportTypes }: { schoolId: string; athleteId: string; sportTypes: Array<{ value: string; label: string }> }) {
  const [state, action] = useActionState(recordAssessmentAction, INITIAL);
  const [reference, setReference] = useState<string>("FTP");
  const meta = ASSESSMENT_REFERENCE_META[reference as keyof typeof ASSESSMENT_REFERENCE_META];
  return (
    <form action={action} className="grid gap-2 text-sm sm:grid-cols-2" data-testid="assessment-form">
      <RouteFields schoolId={schoolId} athleteId={athleteId} />
      <label className="grid gap-1">Modalidade
        <select name="sportType" className={FIELD_CLASS} required>
          {sportTypes.map((sport) => <option key={sport.value} value={sport.value}>{sport.label}</option>)}
        </select>
      </label>
      <label className="grid gap-1">Ambiente (opcional)<input name="environment" maxLength={30} className={FIELD_CLASS} placeholder="piscina, rolo, pista" /></label>
      <label className="grid gap-1">Data<input type="date" name="assessedLocalDate" required className={FIELD_CLASS} /></label>
      <label className="grid gap-1">Protocolo<input name="protocol" required maxLength={300} className={FIELD_CLASS} placeholder="ex.: CSS 400/200, FTP 20 min" /></label>
      <label className="grid gap-1">Avaliador<input name="assessorName" maxLength={200} className={FIELD_CLASS} /></label>
      <label className="grid gap-1">Referência
        <select name="reference" value={reference} onChange={(event) => setReference(event.target.value)} className={FIELD_CLASS}>
          {ASSESSMENT_REFERENCES.map((value) => <option key={value} value={value}>{ASSESSMENT_REFERENCE_META[value].label}</option>)}
        </select>
      </label>
      <label className="grid gap-1">Resultado {meta.unit ? `(${meta.time ? meta.unit.replace("s/", "min:s/") : meta.unit})` : ""}
        <input name="resultValue" required className={FIELD_CLASS} placeholder={meta.time ? "1:45" : "240"} />
      </label>
      {reference === "OTHER" && <label className="grid gap-1">Unidade<input name="resultUnit" required maxLength={20} className={FIELD_CLASS} /></label>}
      <label className="grid gap-1">Fonte
        <select name="source" className={FIELD_CLASS}>
          {ASSESSMENT_SOURCES.map((value) => <option key={value} value={value}>{ASSESSMENT_SOURCE_LABELS[value]}</option>)}
        </select>
      </label>
      <label className="grid gap-1">Detalhe da fonte<input name="sourceDetail" maxLength={200} className={FIELD_CLASS} placeholder="relógio/fornecedor, quando houver" /></label>
      <label className="grid gap-1 sm:col-span-2">Condições<input name="conditions" maxLength={1000} className={FIELD_CLASS} placeholder="piscina 25 m, água 27 °C" /></label>
      <label className="grid gap-1 sm:col-span-2">Limitações<input name="limitations" maxLength={1000} className={FIELD_CLASS} /></label>
      <label className="grid gap-1">Próxima revisão<input type="date" name="nextReviewLocalDate" className={FIELD_CLASS} /></label>
      <div className="flex items-end gap-2">
        <SubmitButton pendingLabel="Registrando...">Registrar avaliação</SubmitButton>
      </div>
      <div className="sm:col-span-2"><Feedback state={state} success="Avaliação registrada." /></div>
    </form>
  );
}

export function PromoteAssessmentButton({ schoolId, athleteId, assessmentId }: { schoolId: string; athleteId: string; assessmentId: string }) {
  const [state, action] = useActionState(promoteAssessmentAction, INITIAL);
  return (
    <form action={action} className="flex items-center gap-2">
      <RouteFields schoolId={schoolId} athleteId={athleteId} />
      <input type="hidden" name="assessmentId" value={assessmentId} />
      <button type="submit" className={SECONDARY_ACTION_CLASS}>Levar à ficha</button>
      <Feedback state={state} success="Ficha atualizada; prescrições publicadas não mudam." />
    </form>
  );
}

export function ZoneProfileForm({ schoolId, athleteId }: { schoolId: string; athleteId: string }) {
  const [state, action] = useActionState(saveZoneProfileAction, INITIAL);
  const [family, setFamily] = useState<ZoneFamily>("power");
  return (
    <form action={action} className="grid gap-2 text-sm sm:grid-cols-2" data-testid="zone-profile-form">
      <RouteFields schoolId={schoolId} athleteId={athleteId} />
      <label className="grid gap-1">Nome<input name="name" required maxLength={120} className={FIELD_CLASS} /></label>
      <label className="grid gap-1">Família
        <select name="family" value={family} onChange={(event) => setFamily(event.target.value as ZoneFamily)} className={FIELD_CLASS}>
          {ZONE_FAMILIES.map((value) => <option key={value} value={value}>{ZONE_FAMILY_LABELS[value]}</option>)}
        </select>
      </label>
      <label className="grid gap-1">Referência
        <select name="reference" key={family} className={FIELD_CLASS}>
          {ZONE_FAMILY_REFERENCES[family].map((value) => <option key={value} value={value}>{ZONE_REFERENCE_LABELS[value]}</option>)}
        </select>
      </label>
      <label className="grid gap-1">Método (nome e fonte)<input name="method" required maxLength={200} className={FIELD_CLASS} /></label>
      <label className="grid gap-1 sm:col-span-2">Início de cada zona, em % da referência
        <input name="bounds" required className={FIELD_CLASS} placeholder="0, 75, 90" />
      </label>
      <label className="grid gap-1 sm:col-span-2">Nomes das zonas (opcional, na mesma ordem)
        <input name="labels" className={FIELD_CLASS} placeholder="Leve, Moderado, Forte" />
      </label>
      <div className="sm:col-span-2 flex items-center gap-2">
        <SubmitButton pendingLabel="Salvando...">Salvar perfil</SubmitButton>
        <Feedback state={state} success="Perfil salvo." />
      </div>
    </form>
  );
}

export function AssignZoneProfileForm({ schoolId, athleteId, family, current, options }: {
  schoolId: string; athleteId: string; family: ZoneFamily; current: string | null;
  options: Array<{ versionId: string; label: string }>;
}) {
  const [state, action] = useActionState(assignZoneProfileAction, INITIAL);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 text-sm" data-testid={`assign-zone-profile-${family}`}>
      <RouteFields schoolId={schoolId} athleteId={athleteId} />
      <input type="hidden" name="family" value={family} />
      <span className="min-w-36 text-foreground/70">{ZONE_FAMILY_LABELS[family]}</span>
      <select name="versionId" defaultValue={current ?? ""} className={`${FIELD_CLASS} w-auto`} aria-label={`Perfil de ${ZONE_FAMILY_LABELS[family]}`}>
        <option value="">Padrão derivado (5 zonas)</option>
        {options.map((option) => <option key={option.versionId} value={option.versionId}>{option.label}</option>)}
      </select>
      <button type="submit" className={SECONDARY_ACTION_CLASS}>Aplicar</button>
      <Feedback state={state} success="Aplicado às próximas prescrições." />
    </form>
  );
}
