"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";
import {
  ATHLETE_EXPERIENCE_LEVELS,
} from "@/modules/school/domain/athlete-technical-sheet";
import {
  SPORT_ENVIRONMENT_LABELS,
  SPORT_ENVIRONMENTS,
  SPORT_LEVEL_LABELS,
  SPORT_LEVELS,
} from "@/modules/school/domain/athlete-sport-level";
import { HEART_RATE_ZONE_METHOD_LABELS, HEART_RATE_ZONE_METHODS } from "@/modules/school/domain/training-zones";
import { EXPERIENCE_LEVEL_LABELS } from "@/modules/school/presentation/workout-labels";
import { getRyvanoSportLabel, type RyvanoSportType } from "@/modules/shared/activities/sport-types";
import { saveTechnicalSheetAction, type AthleteHubActionState } from "./actions";

/**
 * SAM-11 — technical sheet editor, in a centered modal (architecture/rules/ui.md).
 *
 * A modal and not its own page: the sheet is one record's worth of fields, read
 * alongside the values it replaces, and the coach wants to see the current zones
 * while typing the new maximum heart rate. `components/modal` already provides the
 * portal, focus trap, Escape handling and scroll lock.
 *
 * Every field is optional — a sheet with only a goal in it is legitimate. The
 * server re-validates with `athleteTechnicalSheetInputSchema`, which owns the
 * bounds and the heart-rate ordering rule.
 */
export type TechnicalSheetValues = {
  sportTypes: string[];
  experienceLevel: string | null;
  goals: string | null;
  targetEvent: string | null;
  targetEventDate: string | null;
  availability: string | null;
  equipment: string | null;
  restrictions: string | null;
  maxHeartRate: number | null;
  thresholdHeartRate: number | null;
  restingHeartRate: number | null;
  /** Pre-formatted as mm:ss, the way coaches write pace. */
  thresholdPace: string | null;
  ftpWatts: number | null;
  cssPace: string | null;
  /** SAM-18 — MAX_HR | HRR | LTHR; null = automatic. */
  heartRateZoneMethod: string | null;
  notes: string | null;
  /** SAM-50 — level per (modality, environment). */
  sportLevels: SportLevelDraft[];
};

export type SportLevelDraft = {
  sportType: string;
  environment: string;
  level: string;
  /** YYYY-MM-DD or "". */
  assessedAt: string;
  eventExperience: string;
  recentHistory: string;
  currentCondition: string;
  notes: string;
};

function blankLevel(sportType: string): SportLevelDraft {
  return {
    sportType, environment: "OTHER", level: "BEGINNER", assessedAt: "",
    eventExperience: "", recentHistory: "", currentCondition: "", notes: "",
  };
}

/** Only filled text travels; the server owns validation (`athleteSportLevelsInputSchema`). */
function serializeLevels(rows: SportLevelDraft[]) {
  return rows.map((row) => ({
    sportType: row.sportType,
    environment: row.environment,
    level: row.level,
    assessedAt: row.assessedAt || null,
    eventExperience: row.eventExperience || null,
    recentHistory: row.recentHistory || null,
    currentCondition: row.currentCondition || null,
    notes: row.notes || null,
  }));
}

function fieldClass(hasError: boolean): string {
  return `glass-input w-full rounded-xl px-3 py-2 text-sm ${hasError ? "border-destructive/60" : ""}`;
}

export function TechnicalSheetForm({
  schoolId,
  athleteId,
  values,
  sportTypes,
  hasSheet,
}: {
  /** Hidden form value: the school id, or "" for the independent hub (SAM-30). */
  schoolId: string;
  athleteId: string;
  values: TechnicalSheetValues;
  /** Modalities offered as checkboxes: the school's, plus any already on the sheet. */
  sportTypes: RyvanoSportType[];
  hasSheet: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<AthleteHubActionState>({});
  const errors = state.fieldErrors ?? {};
  const [levels, setLevels] = useState<SportLevelDraft[]>(values.sportLevels);
  const updateLevel = (index: number, patch: Partial<SportLevelDraft>) =>
    setLevels((current) => current.map((row, position) => (position === index ? { ...row, ...patch } : row)));

  /**
   * The action's result is handled here rather than through `useActionState` plus
   * an effect: the modal must close only when the write actually happened, and
   * closing it from an effect that watches the returned state is both a
   * `set-state-in-effect` violation and a second source of truth. `SubmitButton`
   * still gets its pending state from the enclosing form.
   */
  async function submit(formData: FormData) {
    const result = await saveTechnicalSheetAction(state, formData);
    setState(result);
    if (result.success) setOpen(false);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={hasSheet ? "Editar ficha técnica do atleta" : "Adicionar ficha técnica do atleta"}
        className="glass-button-primary rounded-full px-4 py-2 text-sm font-medium"
      >
        {hasSheet ? "Editar ficha técnica" : "Adicionar ficha técnica"}
      </button>

      {open && (
        <Modal
          title={hasSheet ? "Editar ficha técnica" : "Adicionar ficha técnica"}
          size="lg"
          onClose={() => setOpen(false)}
          returnFocusTo={triggerRef}
        >
          <form action={submit} className="space-y-5">
            <input type="hidden" name="schoolId" value={schoolId} />
            <input type="hidden" name="athleteId" value={athleteId} />
            <input type="hidden" name="sportLevels" value={JSON.stringify(serializeLevels(levels))} />

            {state.message && (
              <p role="alert" className="theme-panel-danger rounded-[20px] border px-4 py-3 text-sm">
                {state.message}
              </p>
            )}

            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wide text-foreground/55">
                Modalidades
              </legend>
              <div className="flex flex-wrap gap-2">
                {sportTypes.map((sport) => (
                  <label
                    key={sport}
                    className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs"
                  >
                    <input
                      type="checkbox"
                      name="sportTypes"
                      value={sport}
                      defaultChecked={values.sportTypes.includes(sport)}
                      className="h-3.5 w-3.5"
                    />
                    {getRyvanoSportLabel(sport)}
                  </label>
                ))}
              </div>
            </fieldset>

            {/* SAM-50 — level per modality AND environment (§4.2): advanced in a pool can be a beginner at sea. */}
            <fieldset className="space-y-3" data-testid="sport-levels-editor">
              <legend className="text-xs font-semibold uppercase tracking-wide text-foreground/55">
                Níveis por modalidade e ambiente
              </legend>
              <p className="text-xs text-foreground/55">
                Avaliação do professor; não é calculada a partir de quilômetros ou horas e não altera treinos sozinha.
              </p>
              {errors.sportLevels && <p role="alert" className="text-xs text-destructive">{errors.sportLevels}</p>}
              {levels.length === 0 && <p className="text-xs text-foreground/50">Nenhum nível registrado.</p>}
              <ol className="space-y-3">
                {levels.map((row, index) => (
                  <li key={index} className="space-y-2 rounded-[18px] border border-white/10 bg-white/5 p-3" data-testid="sport-level-row">
                    <div className="grid gap-2 sm:grid-cols-4">
                      <label className="space-y-1">
                        <span className="block text-xs text-foreground/55">Modalidade</span>
                        <select value={row.sportType} onChange={(event) => updateLevel(index, { sportType: event.target.value })} className={fieldClass(false)}>
                          {[...new Set([...sportTypes, row.sportType as RyvanoSportType])].map((sport) => (
                            <option key={sport} value={sport}>{getRyvanoSportLabel(sport)}</option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="block text-xs text-foreground/55">Ambiente</span>
                        <select value={row.environment} onChange={(event) => updateLevel(index, { environment: event.target.value })} className={fieldClass(false)}>
                          {SPORT_ENVIRONMENTS.map((environment) => (
                            <option key={environment} value={environment}>{SPORT_ENVIRONMENT_LABELS[environment]}</option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="block text-xs text-foreground/55">Nível</span>
                        <select value={row.level} onChange={(event) => updateLevel(index, { level: event.target.value })} className={fieldClass(false)}>
                          {SPORT_LEVELS.map((level) => (
                            <option key={level} value={level}>{SPORT_LEVEL_LABELS[level]}</option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="block text-xs text-foreground/55">Avaliado em</span>
                        <input type="date" value={row.assessedAt} onChange={(event) => updateLevel(index, { assessedAt: event.target.value })} className={fieldClass(false)} />
                      </label>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <label className="space-y-1">
                        <span className="block text-xs text-foreground/55">Condição atual</span>
                        <input value={row.currentCondition} maxLength={1000} onChange={(event) => updateLevel(index, { currentCondition: event.target.value })} className={fieldClass(false)} />
                      </label>
                      <label className="space-y-1">
                        <span className="block text-xs text-foreground/55">Experiência em eventos</span>
                        <input value={row.eventExperience} maxLength={1000} onChange={(event) => updateLevel(index, { eventExperience: event.target.value })} className={fieldClass(false)} />
                      </label>
                      <label className="space-y-1">
                        <span className="block text-xs text-foreground/55">Histórico recente</span>
                        <input value={row.recentHistory} maxLength={1000} onChange={(event) => updateLevel(index, { recentHistory: event.target.value })} className={fieldClass(false)} />
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLevels((current) => current.filter((_, position) => position !== index))}
                      className="text-xs font-semibold text-rose-400 hover:underline"
                      aria-label={`Remover nível ${index + 1}`}
                    >
                      Remover
                    </button>
                  </li>
                ))}
              </ol>
              <button
                type="button"
                onClick={() => setLevels((current) => [...current, blankLevel(sportTypes[0] ?? "run")])}
                className="glass-button rounded-full px-3 py-1.5 text-xs font-medium text-foreground"
              >
                Adicionar nível
              </button>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="block text-xs font-medium uppercase tracking-wide text-foreground/55">
                  Nível geral
                </span>
                <select
                  name="experienceLevel"
                  defaultValue={values.experienceLevel ?? ""}
                  className={fieldClass(false)}
                >
                  <option value="">Não informado</option>
                  {ATHLETE_EXPERIENCE_LEVELS.map((level) => (
                    <option key={level} value={level}>{EXPERIENCE_LEVEL_LABELS[level] ?? level}</option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="block text-xs font-medium uppercase tracking-wide text-foreground/55">
                  Prova-alvo
                </span>
                <input
                  name="targetEvent"
                  maxLength={300}
                  defaultValue={values.targetEvent ?? ""}
                  placeholder="Maratona de São Paulo"
                  className={fieldClass(false)}
                />
              </label>

              <label className="space-y-1.5">
                <span className="block text-xs font-medium uppercase tracking-wide text-foreground/55">
                  Data da prova
                </span>
                <input
                  type="date"
                  name="targetEventDate"
                  defaultValue={values.targetEventDate ?? ""}
                  className={fieldClass(false)}
                />
              </label>

              <label className="space-y-1.5">
                <span className="block text-xs font-medium uppercase tracking-wide text-foreground/55">
                  Disponibilidade
                </span>
                <input
                  name="availability"
                  maxLength={1000}
                  defaultValue={values.availability ?? ""}
                  placeholder="Seg/Qua/Sex de manhã"
                  className={fieldClass(false)}
                />
              </label>
            </div>

            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold uppercase tracking-wide text-foreground/55">
                Parâmetros de treino
              </legend>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="space-y-1.5">
                  <span className="block text-xs text-foreground/55">FC máxima (bpm)</span>
                  <input
                    type="number"
                    name="maxHeartRate"
                    min={60}
                    max={260}
                    inputMode="numeric"
                    defaultValue={values.maxHeartRate ?? ""}
                    aria-invalid={Boolean(errors.maxHeartRate)}
                    className={fieldClass(Boolean(errors.maxHeartRate))}
                  />
                  {errors.maxHeartRate && (
                    <span className="block text-xs text-destructive">{errors.maxHeartRate}</span>
                  )}
                </label>
                <label className="space-y-1.5">
                  <span className="block text-xs text-foreground/55">FC de limiar (bpm)</span>
                  <input
                    type="number"
                    name="thresholdHeartRate"
                    min={60}
                    max={260}
                    inputMode="numeric"
                    defaultValue={values.thresholdHeartRate ?? ""}
                    aria-invalid={Boolean(errors.thresholdHeartRate)}
                    className={fieldClass(Boolean(errors.thresholdHeartRate))}
                  />
                  {errors.thresholdHeartRate && (
                    <span className="block text-xs text-destructive">{errors.thresholdHeartRate}</span>
                  )}
                </label>
                <label className="space-y-1.5">
                  <span className="block text-xs text-foreground/55">FC de repouso (bpm)</span>
                  <input
                    type="number"
                    name="restingHeartRate"
                    min={20}
                    max={150}
                    inputMode="numeric"
                    defaultValue={values.restingHeartRate ?? ""}
                    aria-invalid={Boolean(errors.restingHeartRate)}
                    className={fieldClass(Boolean(errors.restingHeartRate))}
                  />
                  {errors.restingHeartRate && (
                    <span className="block text-xs text-destructive">{errors.restingHeartRate}</span>
                  )}
                </label>
                <label className="space-y-1.5">
                  <span className="block text-xs text-foreground/55">Ritmo de limiar (min/km)</span>
                  <input
                    name="thresholdPaceSecPerKm"
                    placeholder="4:15"
                    defaultValue={values.thresholdPace ?? ""}
                    aria-invalid={Boolean(errors.thresholdPaceSecPerKm)}
                    className={fieldClass(Boolean(errors.thresholdPaceSecPerKm))}
                  />
                  {errors.thresholdPaceSecPerKm && (
                    <span className="block text-xs text-destructive">{errors.thresholdPaceSecPerKm}</span>
                  )}
                </label>
                <label className="space-y-1.5">
                  <span className="block text-xs text-foreground/55">FTP (W)</span>
                  <input
                    type="number"
                    name="ftpWatts"
                    min={30}
                    max={2000}
                    inputMode="numeric"
                    defaultValue={values.ftpWatts ?? ""}
                    aria-invalid={Boolean(errors.ftpWatts)}
                    className={fieldClass(Boolean(errors.ftpWatts))}
                  />
                  {errors.ftpWatts && <span className="block text-xs text-destructive">{errors.ftpWatts}</span>}
                </label>
                <label className="space-y-1.5">
                  <span className="block text-xs text-foreground/55">CSS (min/100 m)</span>
                  <input
                    name="cssSecPer100m"
                    placeholder="1:40"
                    defaultValue={values.cssPace ?? ""}
                    aria-invalid={Boolean(errors.cssSecPer100m)}
                    className={fieldClass(Boolean(errors.cssSecPer100m))}
                  />
                  {errors.cssSecPer100m && (
                    <span className="block text-xs text-destructive">{errors.cssSecPer100m}</span>
                  )}
                </label>
                <div className="space-y-1.5">
                  <label className="space-y-1.5">
                    <span className="block text-xs text-foreground/55">Método das zonas de FC</span>
                    <select
                      name="heartRateZoneMethod"
                      // Explicit name: without it the option texts ("% FC máxima"…)
                      // join the accessible name and collide with the FC inputs' labels.
                      aria-label="Método das zonas de FC"
                      defaultValue={values.heartRateZoneMethod ?? ""}
                      className={fieldClass(false)}
                    >
                      <option value="">Automático (primeiro método possível)</option>
                      {HEART_RATE_ZONE_METHODS.map((method) => (
                        <option key={method} value={method}>{HEART_RATE_ZONE_METHOD_LABELS[method]}</option>
                      ))}
                    </select>
                  </label>
                  {/* Outside the label on purpose: the hint names other fields and must not become part of this one's accessible name. */}
                  <p className="text-xs text-foreground/45">
                    %FCmáx precisa da máxima; reserva, de máxima e repouso; %LTHR, da FC de limiar.
                  </p>
                </div>
              </div>
            </fieldset>

            <label className="block space-y-1.5">
              <span className="block text-xs font-medium uppercase tracking-wide text-foreground/55">
                Objetivos
              </span>
              <textarea
                name="goals"
                rows={3}
                maxLength={2000}
                defaultValue={values.goals ?? ""}
                className={fieldClass(false)}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="block text-xs font-medium uppercase tracking-wide text-foreground/55">
                Equipamento disponível
              </span>
              <textarea
                name="equipment"
                rows={2}
                maxLength={1000}
                defaultValue={values.equipment ?? ""}
                className={fieldClass(false)}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="block text-xs font-medium uppercase tracking-wide text-foreground/55">
                Restrições e cuidados
              </span>
              <textarea
                name="restrictions"
                rows={2}
                maxLength={2000}
                defaultValue={values.restrictions ?? ""}
                className={fieldClass(false)}
              />
              <span className="block text-xs text-foreground/45">
                Anotação do profissional responsável — não é diagnóstico médico.
              </span>
            </label>

            <label className="block space-y-1.5">
              <span className="block text-xs font-medium uppercase tracking-wide text-foreground/55">
                Observações
              </span>
              <textarea
                name="notes"
                rows={2}
                maxLength={2000}
                defaultValue={values.notes ?? ""}
                className={fieldClass(false)}
              />
            </label>

            <div className="flex flex-wrap gap-3 border-t border-white/10 pt-4">
              <SubmitButton
                className="glass-button-primary rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-60"
                pendingLabel="Salvando..."
              >
                Salvar ficha técnica
              </SubmitButton>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="glass-button rounded-full px-5 py-2.5 text-sm font-medium"
              >
                Cancelar
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
