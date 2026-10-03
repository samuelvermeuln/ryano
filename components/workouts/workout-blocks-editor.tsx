"use client";

/**
 * The block editor of a workout — "Estrutura do treino" with its planned
 * totals. Extracted from the prescription builder (SAM-11) so the catalog
 * template editor (SAM-58) uses the SAME editor: one builder, one block
 * schema (`prescriptionBlockSchema`), never a second editor.
 *
 * Blocks live in client state and are submitted as one JSON field by the
 * owning form; the server re-validates everything with Zod, so this component
 * is a convenience, never the gate.
 */
import { formatDistance, formatDuration } from "@/lib/format";
import type { PrescriptionBlock } from "@/modules/school/domain/prescription-block";
import { plannedTotals } from "@/modules/school/domain/workout-structure";
import type { BuilderZoneOptions, TargetKind, ZoneOption } from "@/modules/school/presentation/prescription-targets";
import { BLOCK_TYPE_EMOJI, BLOCK_TYPE_LABEL } from "@/modules/school/presentation/workout-blocks";

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
  /** SAM-18 — zone number (1–5) picked from the sheet, kept on the target as `zone`. */
  zone: string;
  /** SAM-18 — "mm:ss"; per km or per 100 m depending on the modality. */
  pace: string;
  power: string;
  rpe: string;
  restMin: string;
};

const BLOCK_TYPES = ["WARMUP", "INTERVAL", "STEADY", "RECOVERY", "COOLDOWN", "DRILL", "FREE"] as const;

export const NO_ZONE_OPTIONS: BuilderZoneOptions = { heartRate: null, pace: null, swimPace: null, power: null };

export function emptyBlock(blockType: string, prefill: Partial<BlockDraft> = {}): BlockDraft {
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
    zone: "",
    pace: "",
    power: "",
    rpe: "",
    restMin: "",
    ...prefill,
  };
}

function toNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** "4:15" → 255; plain seconds pass through. Undefined when empty or unreadable. */
function parsePaceInput(value: string): number | undefined {
  const text = value.trim();
  if (text === "") return undefined;
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(text);
  if (match) return Number(match[1]) * 60 + Number(match[2]);
  return toNumber(text);
}

export function formatPaceInput(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * Only fields the coach filled in travel; the server rejects a block with
 * neither duration nor distance. The pace key depends on the modality's
 * target kind, never on the sport name.
 */
export function serialize(blocks: BlockDraft[], targetKind: TargetKind | null) {
  return blocks.map((block) => {
    const durationMin = toNumber(block.durationMin);
    const restMin = toNumber(block.restMin);
    const target: Record<string, number> = {};
    const heartRateMin = toNumber(block.heartRateMin);
    const heartRateMax = toNumber(block.heartRateMax);
    if (heartRateMin !== undefined) target.heartRateMin = heartRateMin;
    if (heartRateMax !== undefined) target.heartRateMax = heartRateMax;
    const zone = toNumber(block.zone);
    if (zone !== undefined) target.zone = zone;
    const pace = parsePaceInput(block.pace);
    if (pace !== undefined && targetKind === "pace") target.paceSecPerKm = pace;
    if (pace !== undefined && targetKind === "swimPace") target.paceSec100m = pace;
    const power = toNumber(block.power);
    if (power !== undefined && targetKind === "power") target.power = power;
    const rpe = toNumber(block.rpe);
    if (rpe !== undefined) target.rpe = rpe;
    return {
      blockType: block.blockType,
      ...(block.title.trim() ? { title: block.title.trim() } : {}),
      ...(durationMin !== undefined ? { durationS: Math.round(durationMin * 60) } : {}),
      ...(toNumber(block.distanceM) !== undefined ? { distanceM: toNumber(block.distanceM) } : {}),
      ...(toNumber(block.repetitions) !== undefined ? { repetitions: toNumber(block.repetitions) } : {}),
      ...(Object.keys(target).length > 0 ? { target } : {}),
      ...(restMin !== undefined ? { restDurationS: Math.round(restMin * 60) } : {}),
    };
  });
}

/** SAM-58 — the inverse of `serialize`: a saved block (template version) back into the editor. */
export function draftsFromBlocks(blocks: readonly PrescriptionBlock[]): BlockDraft[] {
  const text = (value: number | null | undefined) => (value == null ? "" : String(value));
  return blocks.map((block) => emptyBlock(block.blockType, {
    title: block.title ?? "",
    durationMin: block.durationS ? String(Math.round((block.durationS / 60) * 100) / 100) : "",
    distanceM: text(block.distanceM),
    repetitions: text(block.repetitions),
    heartRateMin: text(block.target?.heartRateMin),
    heartRateMax: text(block.target?.heartRateMax),
    zone: text(block.target?.zone),
    pace: block.target?.paceSecPerKm ? formatPaceInput(block.target.paceSecPerKm) : block.target?.paceSec100m ? formatPaceInput(block.target.paceSec100m) : "",
    power: text(block.target?.power),
    rpe: text(block.target?.rpe),
    restMin: block.restDurationS ? String(Math.round((block.restDurationS / 60) * 100) / 100) : "",
  }));
}

/** The option list a zone pick reads from, for the chosen modality's target kind. */
function familyOptions(options: BuilderZoneOptions, targetKind: TargetKind | null): ZoneOption[] | null {
  if (targetKind === "pace") return options.pace;
  if (targetKind === "swimPace") return options.swimPace;
  if (targetKind === "power") return options.power;
  return null;
}

/** What picking "Zn" fills in: heart-rate bounds from the heart-rate table and the family value, when each exists. */
export function zonePrefill(options: BuilderZoneOptions, targetKind: TargetKind | null, zone: number): Partial<BlockDraft> {
  const heartRate = options.heartRate?.options.find((option) => option.zone === zone);
  const family = familyOptions(options, targetKind)?.find((option) => option.zone === zone);
  return {
    zone: String(zone),
    ...(heartRate ? { heartRateMin: String(heartRate.heartRateMin), heartRateMax: String(heartRate.heartRateMax) } : {}),
    ...(family?.paceSeconds !== undefined ? { pace: formatPaceInput(family.paceSeconds) } : {}),
    ...(family?.power !== undefined ? { power: String(family.power) } : {}),
  };
}

export function fieldClass(hasError: boolean): string {
  return `glass-input w-full rounded-xl px-3 py-2 text-sm ${hasError ? "border-destructive/60" : ""}`;
}

/** SAM-48 — the same planned totals the athlete, the hub and compliance read. */
export function totalsOfDrafts(blocks: BlockDraft[]) {
  return plannedTotals(blocks.map((block) => {
    const minutes = toNumber(block.durationMin);
    const rest = toNumber(block.restMin);
    return {
      blockType: block.blockType,
      durationS: minutes != null ? Math.round(minutes * 60) : null,
      distanceM: toNumber(block.distanceM) ?? null,
      repetitions: toNumber(block.repetitions) ?? null,
      targetPayload: null,
      restPayload: rest != null && rest > 0 ? { durationS: Math.round(rest * 60) } : null,
    };
  }));
}

export function WorkoutBlocksEditor({
  blocks,
  setBlocks,
  zoneOptions,
  targetKind,
  errors = {},
}: {
  blocks: BlockDraft[];
  setBlocks: (update: (current: BlockDraft[]) => BlockDraft[]) => void;
  zoneOptions: BuilderZoneOptions;
  targetKind: TargetKind | null;
  errors?: Record<string, string | undefined>;
}) {
  const familyZones = familyOptions(zoneOptions, targetKind);
  const zoneSelectOptions = zoneOptions.heartRate?.options ?? familyZones ?? [];
  const paceUnit = targetKind === "swimPace" ? "min/100 m" : "min/km";
  const update = (key: string, patch: Partial<BlockDraft>) => {
    setBlocks((current) => current.map((block) => (block.key === key ? { ...block, ...patch } : block)));
  };
  const totals = totalsOfDrafts(blocks);
  const totalSeconds = totals.durationSeconds ?? 0;
  const totalMeters = totals.distanceMeters ?? 0;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/55">
          Estrutura do treino
        </h3>
        <p className="text-xs text-foreground/50" data-testid="builder-totals">
          {[
            totalSeconds > 0 ? `⏱ ${totals.durationIsPartial ? "≥ " : ""}${formatDuration(totalSeconds)}` : null,
            totalMeters > 0 ? `📏 ${totals.distanceIsPartial ? "≥ " : ""}${formatDistance(totalMeters)}` : null,
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
          <li key={block.key} className="space-y-3 rounded-[20px] border border-white/10 bg-white/5 p-4" data-testid="builder-block">
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
              {/* SAM-18 — a zone from the sheet fills the bounds below; the coach may still edit them. */}
              <label className="space-y-1">
                <span className="block text-xs text-foreground/55">
                  Zona{zoneOptions.heartRate ? ` (${zoneOptions.heartRate.method})` : ""}
                </span>
                <select
                  value={block.zone}
                  onChange={(event) => {
                    const zone = toNumber(event.target.value);
                    update(block.key, zone === undefined ? { zone: "" } : zonePrefill(zoneOptions, targetKind, zone));
                  }}
                  className={fieldClass(false)}
                  data-testid="block-zone"
                >
                  <option value="">Sem zona</option>
                  {(zoneSelectOptions.length > 0 ? zoneSelectOptions : [1, 2, 3, 4, 5].map((zone) => ({ zone, label: `Z${zone}` })))
                    .map((option) => (
                      <option key={option.zone} value={option.zone}>{option.label}</option>
                    ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="block text-xs text-foreground/55">FC mín. (bpm)</span>
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
                <span className="block text-xs text-foreground/55">FC máx. (bpm)</span>
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
              {(targetKind === "pace" || targetKind === "swimPace") && (
                <label className="space-y-1">
                  <span className="block text-xs text-foreground/55">Ritmo ({paceUnit})</span>
                  <input
                    placeholder={targetKind === "swimPace" ? "1:45" : "4:30"}
                    value={block.pace}
                    onChange={(event) => update(block.key, { pace: event.target.value })}
                    className={fieldClass(false)}
                  />
                </label>
              )}
              {targetKind === "power" && (
                <label className="space-y-1">
                  <span className="block text-xs text-foreground/55">Potência (W)</span>
                  <input
                    type="number"
                    min={10}
                    max={3000}
                    inputMode="numeric"
                    value={block.power}
                    onChange={(event) => update(block.key, { power: event.target.value })}
                    className={fieldClass(false)}
                  />
                </label>
              )}
              <label className="space-y-1">
                <span className="block text-xs text-foreground/55">RPE (1–10)</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  inputMode="numeric"
                  value={block.rpe}
                  onChange={(event) => update(block.key, { rpe: event.target.value })}
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
  );
}
