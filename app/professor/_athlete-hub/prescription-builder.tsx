"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SubmitButton } from "@/components/submit-button";
import { REST_DAY_SPORT } from "@/modules/school/domain/execution-state";
import { OPEN_WATER_SPORT, type OpenWaterSession } from "@/modules/school/domain/open-water-session";
import { OpenWaterFields } from "@/components/workouts/open-water-fields";
import { SessionV2Editor } from "@/components/workouts/session-v2-editor";
import type { SessionContentV2 } from "@/modules/school/domain/session-content-v2";
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
import { diffPrescription, type PrescriptionShape } from "@/modules/school/presentation/prescription-diff";
import { prescribeWorkoutAction, reviseWorkoutAction, saveDraftAction, type AthleteHubActionState } from "./actions";

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
/** SAM-59 — changing a published prescription: shows the diff and asks for a reason after execution. */
export type PrescriptionRevision = {
  assignmentId: string;
  expectedVersion: number;
  executed: boolean;
  before: PrescriptionShape;
};

export type PrescriptionInitial = {
  title: string;
  sportType: string;
  description: string | null;
  blocks: PrescriptionBlock[];
  templateId: string | null;
  templateVersion: number | null;
  /** SAM-59 — set when the builder reopens a saved draft. */
  draft?: { id: string; version: number } | null;
  scheduledAtLocal?: string | null;
  /** SAM-65 — open-water section of the prescription being reopened (draft, revision or template). */
  openWater?: OpenWaterSession | null;
  /** SAM-69 — v2 structure being reopened; opens the advanced builder. */
  sessionV2?: SessionContentV2 | null;
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
  revision = null,
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
  revision?: PrescriptionRevision | null;
}) {
  const [state, setState] = useState<AthleteHubActionState>({});
  const offeredSports = initial && !sportTypes.includes(initial.sportType as RyvanoSportType)
    ? [initial.sportType as RyvanoSportType, ...sportTypes]
    : sportTypes;
  const [sportType, setSportType] = useState<RyvanoSportType | typeof REST_DAY_SPORT | "">((initial?.sportType as RyvanoSportType | undefined) ?? sportTypes[0] ?? "");
  // The modality decides the family of the extra target (pace /km, pace /100 m
  // or power) through its metric display category — no per-sport branching.
  // SAM-63 — a planned rest/recovery day has no effort targets.
  const targetKind = sportType && sportType !== REST_DAY_SPORT ? targetKindForSport(sportType as RyvanoSportType) : null;
  // Pre-filled from the sheet: the warm-up starts in Z2 when the sheet can say what Z2 is.
  const [advanced, setAdvanced] = useState(Boolean(initial?.sessionV2));
  const [title, setTitle] = useState(initial?.title ?? "");
  const [blocks, setBlocks] = useState<BlockDraft[]>(() => (initial && initial.blocks.length > 0
    ? draftsFromBlocks(initial.blocks)
    : [emptyBlock("WARMUP", zoneOptions.heartRate ? zonePrefill(zoneOptions, targetKind, 2) : {})]));
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState(initial?.draft ?? null);
  const [diff, setDiff] = useState<ReturnType<typeof diffPrescription> | null>(null);

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
    const result = revision ? await reviseWorkoutAction(state, formData) : await prescribeWorkoutAction(state, formData);
    setState(result);
    if (result.success) router.push(revision ? `${basePath}/treinos/${revision.assignmentId}` : `${basePath}/treinos`);
  }

  /** SAM-59 — saves without delivering; the athlete sees nothing until it is published. */
  async function saveDraft(formData: FormData) {
    const result = await saveDraftAction(state, formData);
    setState(result);
    if (result.draftId && result.draftVersion) setDraft({ id: result.draftId, version: result.draftVersion });
  }

  /** SAM-59 — the legible diff against the published version, computed from what is on screen. */
  function reviewChanges() {
    if (!revision || !formRef.current) return;
    const data = new FormData(formRef.current);
    const blocksNow = JSON.parse(String(data.get("blocks") ?? "[]")) as Array<Partial<PrescriptionShape["blocks"][number]>>;
    setDiff(diffPrescription(revision.before, {
      title: String(data.get("title") ?? ""),
      description: String(data.get("description") ?? "") || null,
      sportType: String(data.get("sportType") ?? ""),
      scheduledAtLocal: String(data.get("scheduledAt") ?? "") || null,
      // Serialized blocks omit empty fields; the diff compares them as "not set".
      blocks: blocksNow.map((block) => ({
        ...block,
        blockType: block.blockType!, title: block.title ?? null, durationS: block.durationS ?? null, distanceM: block.distanceM ?? null,
        repetitions: block.repetitions ?? null, restDurationS: block.restDurationS ?? null,
      })),
    }));
  }

  return (
    <form ref={formRef} action={submit} className="space-y-6">
      <input type="hidden" name="schoolId" value={schoolId} />
      {draft && <input type="hidden" name="draftId" value={draft.id} />}
      {draft && <input type="hidden" name="draftVersion" value={draft.version} />}
      {revision && <input type="hidden" name="assignmentId" value={revision.assignmentId} />}
      {revision && <input type="hidden" name="expectedVersion" value={revision.expectedVersion} />}
      <input type="hidden" name="athleteId" value={athleteId} />
      {/* SAM-69 — in the advanced builder the v2 structure is the source; v1 rows are derived on the server. */}
      <input type="hidden" name="blocks" value={advanced ? "[]" : JSON.stringify(serialize(blocks, targetKind))} />
      {initial?.templateId && <input type="hidden" name="templateId" value={initial.templateId} />}
      {initial?.templateId && initial.templateVersion !== null && <input type="hidden" name="templateVersion" value={initial.templateVersion} />}

      {initial?.templateId && !revision && (
        <p className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-xs text-foreground/70" data-testid="builder-from-template">
          A partir do modelo “{initial.title}” (versão {initial.templateVersion}). Ajuste o que precisar: a prescrição guarda a própria cópia e não muda se o modelo for editado.
        </p>
      )}

      {(state.message || unplacedError) && (
        <p role={state.success ? "status" : "alert"} className={`${state.success ? "border-white/10 bg-white/5" : "theme-panel-danger"} rounded-[20px] border px-4 py-3 text-sm`} data-testid="builder-message">
          {state.message ?? unplacedError}
          {state.conflict && (
            <> {" "}<a href="" target="_blank" rel="noreferrer" className="underline">Abrir a versão atual em outra aba</a> — o que você escreveu continua aqui.</>
          )}
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
            onChange={(event) => setTitle(event.target.value)}
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
            {/* SAM-63 — rest/recovery day: shows in the week, never a "falta", outside the regularity denominator. */}
            <option value={REST_DAY_SPORT}>Descanso / recuperação</option>
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
            defaultValue={initial?.scheduledAtLocal ?? defaultScheduledAt}
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

      <label className="inline-flex items-center gap-2 text-sm" data-testid="advanced-builder-toggle">
        <input type="checkbox" checked={advanced} onChange={(event) => setAdvanced(event.target.checked)} />
        Estrutura avançada (séries aninhadas, descanso por posição, saída a cada, piscina em m/jd)
      </label>
      {advanced
        ? <SessionV2Editor initial={initial?.sessionV2 ?? null} title={title} />
        : <WorkoutBlocksEditor blocks={blocks} setBlocks={setBlocks} zoneOptions={zoneOptions} targetKind={targetKind} errors={errors} />}
      {sportType === OPEN_WATER_SPORT && <OpenWaterFields initial={initial?.openWater ?? null} />}

      {revision && diff && (
        <section className="space-y-2 rounded-[20px] border border-white/10 bg-white/5 p-4 text-sm" data-testid="revision-diff">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/55">O que muda para o atleta</h3>
          {!diff.changed && <p className="text-foreground/60">Nada mudou em relação à versão publicada.</p>}
          <ul className="space-y-1">
            {diff.fields.map((change) => <li key={change.field}>{change.label}: <s className="text-foreground/50">{change.from}</s> → {change.to}</li>)}
            {diff.blocks.map((change) => (
              <li key={`${change.kind}-${change.position}`}>
                {change.kind === "added" && <>Bloco {change.position} adicionado: {change.summary}</>}
                {change.kind === "removed" && <>Bloco {change.position} removido: <s className="text-foreground/50">{change.summary}</s></>}
                {change.kind === "changed" && <>Bloco {change.position}: {change.changes.map((item) => `${item.label} ${item.from} → ${item.to}`).join("; ")}</>}
              </li>
            ))}
          </ul>
          <label className="block space-y-1">
            <span className="block text-xs text-foreground/55">{revision.executed ? "Motivo da emenda (obrigatório: o treino já foi realizado)" : "Motivo (opcional)"}</span>
            <input name="reason" required={revision.executed} maxLength={500} className={fieldClass(Boolean(errors.reason))} />
            {errors.reason && <span className="block text-xs text-destructive">{errors.reason}</span>}
          </label>
          {revision.executed && <p className="text-xs text-foreground/60">A comparação continua usando a versão que o atleta recebeu; a emenda fica registrada.</p>}
        </section>
      )}

      <div className="flex flex-wrap gap-3 border-t border-white/10 pt-4">
        {revision ? (
          diff?.changed ? (
            <SubmitButton className="glass-button-primary rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-60" pendingLabel="Publicando...">
              Publicar alteração
            </SubmitButton>
          ) : (
            <button type="button" onClick={reviewChanges} className="glass-button-primary rounded-full px-5 py-2.5 text-sm font-medium">
              Revisar mudanças
            </button>
          )
        ) : (
          <>
            <SubmitButton
              className="glass-button-primary rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-60"
              pendingLabel="Prescrevendo..."
            >
              Prescrever treino
            </SubmitButton>
            <button type="submit" formAction={saveDraft} formNoValidate className="glass-button rounded-full px-5 py-2.5 text-sm font-medium" data-testid="save-draft">
              Salvar rascunho
            </button>
            <span className="self-center text-xs text-foreground/50">Prescrever publica para o atleta; o rascunho fica só com você.</span>
          </>
        )}
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
