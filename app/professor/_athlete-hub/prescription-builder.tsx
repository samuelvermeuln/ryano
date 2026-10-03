"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SubmitButton } from "@/components/submit-button";
import {
  draftsFromBlocks,
  emptyBlock,
  fieldClass,
  serialize,
  WorkoutBlocksEditor,
  zonePrefill,
  type BlockDraft,
} from "@/components/workouts/workout-blocks-editor";
import type { PrescriptionBlock } from "@/modules/school/domain/prescription-block";
import { targetKindForSport, type BuilderZoneOptions } from "@/modules/school/presentation/prescription-targets";
import { getRyvanoSportLabel, type RyvanoSportType } from "@/modules/shared/activities/sport-types";
import { prescribeWorkoutAction, type AthleteHubActionState } from "./actions";

export type { BlockDraft } from "@/components/workouts/workout-blocks-editor";

/**
 * SAM-11 — prescription builder. The block editor itself is the shared
 * `WorkoutBlocksEditor` (SAM-58: the catalog template editor uses the same
 * one). Blocks are submitted as one JSON field and re-validated server-side.
 *
 * The technical sheet's own thresholds are offered as the default intensity when
 * they exist — that is the point of keeping the sheet.
 *
 * SAM-58 — "Usar este modelo": `initial` pre-fills title, modality,
 * orientations and blocks from a catalog version; the version travels as
 * provenance and the prescription keeps its own snapshot (ADR-004).
 */
export type PrescriptionInitial = {
  title: string;
  sportType: string;
  description: string | null;
  blocks: PrescriptionBlock[];
  templateId: string;
  templateVersion: number;
};

export function PrescriptionBuilder({
  schoolId,
  basePath,
  athleteId,
  athleteName,
  sportTypes,
  teams,
  zoneOptions,
  defaultScheduledAt,
  timeZone,
  initial = null,
}: {
  /** Hidden form value: the school id, or "" for the independent hub (SAM-30). */
  schoolId: string;
  /** The athlete hub this form belongs to; where it navigates after a success. */
  basePath: string;
  athleteId: string;
  athleteName: string;
  /** Modalities offered first: the school's own, then the athlete's technical sheet. */
  sportTypes: RyvanoSportType[];
  teams: Array<{ id: string; name: string }>;
  /** SAM-18 — zone options per family, from the athlete's technical sheet; a family is null without its parameter. */
  zoneOptions: BuilderZoneOptions;
  defaultScheduledAt: string;
  /** SAM-16 — the zone the typed time is read in; shown so the coach knows which clock it is. */
  timeZone: string;
  initial?: PrescriptionInitial | null;
}) {
  const [state, setState] = useState<AthleteHubActionState>({});
  const offeredSports = initial && !sportTypes.includes(initial.sportType as RyvanoSportType)
    ? [initial.sportType as RyvanoSportType, ...sportTypes]
    : sportTypes;
  const [sportType, setSportType] = useState<RyvanoSportType | "">((initial?.sportType as RyvanoSportType | undefined) ?? sportTypes[0] ?? "");
  // The modality decides the family of the extra target (pace /km, pace /100 m
  // or power) through its metric display category — no per-sport branching.
  const targetKind = sportType ? targetKindForSport(sportType) : null;
  // Pre-filled from the sheet: the warm-up starts in Z2 when the sheet can say what Z2 is.
  const [blocks, setBlocks] = useState<BlockDraft[]>(() => (initial && initial.blocks.length > 0
    ? draftsFromBlocks(initial.blocks)
    : [emptyBlock("WARMUP", zoneOptions.heartRate ? zonePrefill(zoneOptions, targetKind, 2) : {})]));
  const router = useRouter();

  const errors = state.fieldErrors ?? {};
  // SAM-48 — an error keyed by a field this form has no slot for (e.g. one
  // raised by the domain while saving) must still reach the coach; it used
  // to vanish and the button just stopped.
  const PLACED_ERROR_KEYS = new Set(["title", "sportType", "scheduledAt", "blocks", "durationS", "target"]);
  const unplacedError = Object.entries(errors).find(([key]) => !PLACED_ERROR_KEYS.has(key))?.[1] ?? null;

  /**
   * Navigation happens only once the action reports success, so a rejected
   * submission keeps the coach's draft on screen. Handled in the submit path
   * rather than in an effect watching the returned state: an effect would fire on
   * re-render too, and navigating is a side effect of submitting, not of rendering.
   */
  async function submit(formData: FormData) {
    const result = await prescribeWorkoutAction(state, formData);
    setState(result);
    if (result.success) router.push(`${basePath}/treinos`);
  }

  return (
    <form action={submit} className="space-y-6">
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="athleteId" value={athleteId} />
      <input type="hidden" name="blocks" value={JSON.stringify(serialize(blocks, targetKind))} />
      {initial && <input type="hidden" name="templateId" value={initial.templateId} />}
      {initial && <input type="hidden" name="templateVersion" value={initial.templateVersion} />}

      {initial && (
        <p className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-xs text-foreground/70" data-testid="builder-from-template">
          A partir do modelo “{initial.title}” (versão {initial.templateVersion}). Ajuste o que precisar: a prescrição guarda a própria cópia e não muda se o modelo for editado.
        </p>
      )}

      {(state.message || unplacedError) && (
        <p role="alert" className="theme-panel-danger rounded-[20px] border px-4 py-3 text-sm">
          {state.message ?? unplacedError}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="block text-xs font-medium uppercase tracking-wide text-foreground/55">
            Título do treino
          </span>
          <input
            name="title"
            required
            maxLength={200}
            defaultValue={initial?.title ?? undefined}
            placeholder={`Treino de ${athleteName.split(" ")[0] ?? "hoje"}`}
            aria-invalid={Boolean(errors.title)}
            className={fieldClass(Boolean(errors.title))}
          />
          {errors.title && <span className="block text-xs text-destructive">{errors.title}</span>}
        </label>

        <label className="space-y-1.5">
          <span className="block text-xs font-medium uppercase tracking-wide text-foreground/55">
            Modalidade
          </span>
          <select
            name="sportType"
            required
            value={sportType}
            onChange={(event) => setSportType(event.target.value as RyvanoSportType)}
            aria-invalid={Boolean(errors.sportType)}
            className={fieldClass(Boolean(errors.sportType))}
          >
            {offeredSports.map((sport) => (
              <option key={sport} value={sport}>{getRyvanoSportLabel(sport)}</option>
            ))}
          </select>
          {errors.sportType && <span className="block text-xs text-destructive">{errors.sportType}</span>}
          <span className="block text-xs text-foreground/50" data-testid="target-kind" data-kind={targetKind ?? "none"}>
            {targetKind === "pace" && "Alvos: FC, ritmo (min/km), zona e RPE."}
            {targetKind === "swimPace" && "Alvos: FC, ritmo (min/100 m), zona e RPE."}
            {targetKind === "power" && "Alvos: FC, potência (W), zona e RPE."}
            {targetKind === null && "Alvos: FC, zona e RPE."}
          </span>
        </label>

        <label className="space-y-1.5">
          <span className="block text-xs font-medium uppercase tracking-wide text-foreground/55">
            Data e hora
          </span>
          <input
            type="datetime-local"
            name="scheduledAt"
            required
            defaultValue={defaultScheduledAt}
            aria-invalid={Boolean(errors.scheduledAt)}
            className={fieldClass(Boolean(errors.scheduledAt))}
          />
          {errors.scheduledAt && <span className="block text-xs text-destructive">{errors.scheduledAt}</span>}
          <span className="block text-xs text-foreground/50">Horário da escola ({timeZone.replace(/_/g, " ")}).</span>
        </label>

        {teams.length > 0 && (
          <label className="space-y-1.5">
            <span className="block text-xs font-medium uppercase tracking-wide text-foreground/55">
              Turma (opcional)
            </span>
            <select name="teamId" defaultValue="" className={fieldClass(false)}>
              <option value="">Sem turma</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <label className="block space-y-1.5">
        <span className="block text-xs font-medium uppercase tracking-wide text-foreground/55">
          Orientações (opcional)
        </span>
        <textarea
          name="description"
          rows={3}
          maxLength={5000}
          defaultValue={initial?.description ?? undefined}
          placeholder="O que o atleta precisa saber antes de treinar."
          className={fieldClass(false)}
        />
      </label>

      <WorkoutBlocksEditor blocks={blocks} setBlocks={setBlocks} zoneOptions={zoneOptions} targetKind={targetKind} errors={errors} />

      <div className="flex flex-wrap gap-3 border-t border-white/10 pt-4">
        <SubmitButton
          className="glass-button-primary rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-60"
          pendingLabel="Prescrevendo..."
        >
          Prescrever treino
        </SubmitButton>
        <a
          href={`${basePath}/treinos`}
          className="glass-button rounded-full px-5 py-2.5 text-sm font-medium"
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}
