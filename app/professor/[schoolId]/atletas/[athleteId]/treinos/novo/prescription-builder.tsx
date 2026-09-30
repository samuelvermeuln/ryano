"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SubmitButton } from "@/components/submit-button";
import { formatDistance, formatDuration } from "@/lib/format";
import { BLOCK_TYPE_EMOJI, BLOCK_TYPE_LABEL } from "@/modules/school/presentation/workout-blocks";
import { getRyvanoSportLabel, type RyvanoSportType } from "@/modules/shared/activities/sport-types";
import { prescribeWorkoutAction, type AthleteHubActionState } from "../../actions";

/**
 * SAM-11 — prescription builder.
 *
 * Blocks live in client state and are submitted as one JSON field: a
 * variable-length structure with nested intensity targets does not survive flat
 * form fields without an index-encoding convention duplicated on both sides. The
 * server re-validates the whole payload with Zod (`prescribeWorkoutSchema`), so
 * this component is a convenience, never the gate.
 *
 * The technical sheet's own thresholds are offered as the default intensity when
 * they exist — that is the point of keeping the sheet.
 */
export type BlockDraft = {
  key: string;
  blockType: string;
  title: string;
  /** Minutes and metres in the form; converted on submit to the domain's units. */
  durationMin: string;
  distanceM: string;
  repetitions: string;
  heartRateMin: string;
  heartRateMax: string;
  restMin: string;
};

const BLOCK_TYPES = ["WARMUP", "INTERVAL", "STEADY", "RECOVERY", "COOLDOWN", "DRILL", "FREE"] as const;

function emptyBlock(blockType: string): BlockDraft {
  return {
    // `new Date().getTime()` rather than `Date.now()`: the latter is rejected by
    // the repo's react-hooks/purity lint rule.
    key: `${blockType}-${new Date().getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    blockType,
    title: "",
    durationMin: "",
    distanceM: "",
    repetitions: "",
    heartRateMin: "",
    heartRateMax: "",
    restMin: "",
  };
}

function toNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Only fields the coach filled in travel; the server rejects a block with neither duration nor distance. */
function serialize(blocks: BlockDraft[]) {
  return blocks.map((block) => {
    const durationMin = toNumber(block.durationMin);
    const heartRateMin = toNumber(block.heartRateMin);
    const heartRateMax = toNumber(block.heartRateMax);
    const restMin = toNumber(block.restMin);
    return {
      blockType: block.blockType,
      ...(block.title.trim() ? { title: block.title.trim() } : {}),
      ...(durationMin !== undefined ? { durationS: Math.round(durationMin * 60) } : {}),
      ...(toNumber(block.distanceM) !== undefined ? { distanceM: toNumber(block.distanceM) } : {}),
      ...(toNumber(block.repetitions) !== undefined ? { repetitions: toNumber(block.repetitions) } : {}),
      ...(heartRateMin !== undefined || heartRateMax !== undefined
        ? {
          target: {
            ...(heartRateMin !== undefined ? { heartRateMin } : {}),
            ...(heartRateMax !== undefined ? { heartRateMax } : {}),
          },
        }
        : {}),
      ...(restMin !== undefined ? { restDurationS: Math.round(restMin * 60) } : {}),
    };
  });
}

function fieldClass(hasError: boolean): string {
  return `glass-input w-full rounded-xl px-3 py-2 text-sm ${hasError ? "border-destructive/60" : ""}`;
}

export function PrescriptionBuilder({
  schoolId,
  athleteId,
  athleteName,
  sportTypes,
  teams,
  suggestedHeartRate,
  defaultScheduledAt,
}: {
  schoolId: string;
  athleteId: string;
  athleteName: string;
  /** Modalities offered first: the school's own, then the athlete's technical sheet. */
  sportTypes: RyvanoSportType[];
  teams: Array<{ id: string; name: string }>;
  /** From the athlete's technical sheet, when it records a maximum heart rate. */
  suggestedHeartRate: { min: number; max: number } | null;
  defaultScheduledAt: string;
}) {
  const [state, setState] = useState<AthleteHubActionState>({});
  const [blocks, setBlocks] = useState<BlockDraft[]>([emptyBlock("WARMUP")]);
  const router = useRouter();

  const errors = state.fieldErrors ?? {};

  /**
   * Navigation happens only once the action reports success, so a rejected
   * submission keeps the coach's draft on screen. Handled in the submit path
   * rather than in an effect watching the returned state: an effect would fire on
   * re-render too, and navigating is a side effect of submitting, not of rendering.
   */
  async function submit(formData: FormData) {
    const result = await prescribeWorkoutAction(state, formData);
    setState(result);
    if (result.success) router.push(`/professor/${schoolId}/atletas/${athleteId}/treinos`);
  }

  const update = (key: string, patch: Partial<BlockDraft>) => {
    setBlocks((current) => current.map((block) => (block.key === key ? { ...block, ...patch } : block)));
  };

  const totalSeconds = blocks.reduce((sum, block) => {
    const minutes = toNumber(block.durationMin) ?? 0;
    const reps = toNumber(block.repetitions) ?? 1;
    const rest = toNumber(block.restMin) ?? 0;
    return sum + (minutes + rest) * 60 * reps;
  }, 0);
  const totalMeters = blocks.reduce((sum, block) => {
    const metres = toNumber(block.distanceM) ?? 0;
    const reps = toNumber(block.repetitions) ?? 1;
    return sum + metres * reps;
  }, 0);

  return (
    <form action={submit} className="space-y-6">
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="athleteId" value={athleteId} />
      <input type="hidden" name="blocks" value={JSON.stringify(serialize(blocks))} />

      {state.message && (
        <p role="alert" className="theme-panel-danger rounded-[20px] border px-4 py-3 text-sm">
          {state.message}
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
            defaultValue={sportTypes[0] ?? ""}
            aria-invalid={Boolean(errors.sportType)}
            className={fieldClass(Boolean(errors.sportType))}
          >
            {sportTypes.map((sport) => (
              <option key={sport} value={sport}>{getRyvanoSportLabel(sport)}</option>
            ))}
          </select>
          {errors.sportType && <span className="block text-xs text-destructive">{errors.sportType}</span>}
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
          placeholder="O que o atleta precisa saber antes de treinar."
          className={fieldClass(false)}
        />
      </label>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/55">
            Estrutura do treino
          </h3>
          <p className="text-xs text-foreground/50">
            {[
              totalSeconds > 0 ? `⏱ ${formatDuration(totalSeconds)}` : null,
              totalMeters > 0 ? `📏 ${formatDistance(totalMeters)}` : null,
            ].filter(Boolean).join(" · ") || "Preencha duração ou distância em cada bloco."}
          </p>
        </div>

        {errors.blocks && (
          <p role="alert" className="text-xs text-destructive">{errors.blocks}</p>
        )}
        {(errors.durationS || errors.target) && (
          <p role="alert" className="text-xs text-destructive">
            {errors.durationS ?? errors.target}
          </p>
        )}

        <ol className="space-y-3">
          {blocks.map((block, index) => (
            <li key={block.key} className="space-y-3 rounded-[20px] border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span aria-hidden className="text-base leading-none">
                  {BLOCK_TYPE_EMOJI[block.blockType] ?? "▶"}
                </span>
                <label className="sr-only" htmlFor={`${block.key}-type`}>
                  Tipo do bloco {index + 1}
                </label>
                <select
                  id={`${block.key}-type`}
                  value={block.blockType}
                  onChange={(event) => update(block.key, { blockType: event.target.value })}
                  className="glass-input rounded-xl px-3 py-1.5 text-xs"
                >
                  {BLOCK_TYPES.map((type) => (
                    <option key={type} value={type}>{BLOCK_TYPE_LABEL[type] ?? type}</option>
                  ))}
                </select>
                <span className="ml-auto text-xs text-foreground/40">#{index + 1}</span>
                {blocks.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remover bloco ${index + 1}`}
                    onClick={() => setBlocks((current) => current.filter((item) => item.key !== block.key))}
                    className="text-xs font-medium text-foreground/60 underline-offset-4 hover:text-destructive hover:underline"
                  >
                    Remover
                  </button>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1">
                  <span className="block text-xs text-foreground/55">Nome (opcional)</span>
                  <input
                    value={block.title}
                    maxLength={200}
                    onChange={(event) => update(block.key, { title: event.target.value })}
                    className={fieldClass(false)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="block text-xs text-foreground/55">Duração (min)</span>
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={block.durationMin}
                    onChange={(event) => update(block.key, { durationMin: event.target.value })}
                    className={fieldClass(false)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="block text-xs text-foreground/55">Distância (m)</span>
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={block.distanceM}
                    onChange={(event) => update(block.key, { distanceM: event.target.value })}
                    className={fieldClass(false)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="block text-xs text-foreground/55">Repetições</span>
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={block.repetitions}
                    onChange={(event) => update(block.key, { repetitions: event.target.value })}
                    className={fieldClass(false)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="block text-xs text-foreground/55">
                    FC mín.{suggestedHeartRate ? ` (ficha: ${suggestedHeartRate.min})` : ""}
                  </span>
                  <input
                    type="number"
                    min={30}
                    max={260}
                    inputMode="numeric"
                    value={block.heartRateMin}
                    onChange={(event) => update(block.key, { heartRateMin: event.target.value })}
                    className={fieldClass(false)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="block text-xs text-foreground/55">
                    FC máx.{suggestedHeartRate ? ` (ficha: ${suggestedHeartRate.max})` : ""}
                  </span>
                  <input
                    type="number"
                    min={30}
                    max={260}
                    inputMode="numeric"
                    value={block.heartRateMax}
                    onChange={(event) => update(block.key, { heartRateMax: event.target.value })}
                    className={fieldClass(false)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="block text-xs text-foreground/55">Descanso (min)</span>
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={block.restMin}
                    onChange={(event) => update(block.key, { restMin: event.target.value })}
                    className={fieldClass(false)}
                  />
                </label>
              </div>
            </li>
          ))}
        </ol>

        <button
          type="button"
          onClick={() => setBlocks((current) => [...current, emptyBlock("INTERVAL")])}
          className="glass-button rounded-full px-4 py-2 text-xs font-medium"
        >
          Adicionar bloco
        </button>
      </section>

      <div className="flex flex-wrap gap-3 border-t border-white/10 pt-4">
        <SubmitButton
          className="glass-button-primary rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-60"
          pendingLabel="Prescrevendo..."
        >
          Prescrever treino
        </SubmitButton>
        <a
          href={`/professor/${schoolId}/atletas/${athleteId}/treinos`}
          className="glass-button rounded-full px-5 py-2.5 text-sm font-medium"
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}
