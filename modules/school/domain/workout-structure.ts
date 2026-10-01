/**
 * SAM-19 — the prescribed structure read as numbers: planned totals with
 * repetitions and rest, the "main" effort blocks, and the structure expanded
 * into the sequence of segments a watch records as laps.
 *
 * Pure domain math shared by the compliance formula (domain) and the screens
 * (presentation: `workout-summary.ts`, `workout-insights.ts`), so the number
 * the coach sees as "planned" is the number compliance is scored against.
 */

export interface StructuredBlock {
  blockType: string;
  title?: string | null;
  durationS: number | null;
  distanceM: number | null;
  repetitions: number | null;
  targetPayload: unknown;
  restPayload: unknown;
}

/** Blocks whose intensity is not the point of the session; excluded from intensity targets. */
export const AUXILIARY_BLOCK_TYPES = new Set(["WARMUP", "COOLDOWN", "RECOVERY", "REST"]);

export function numberField(payload: unknown, key: string): number | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function restDurationSeconds(restPayload: unknown): number | null {
  return numberField(restPayload, "durationS");
}

export function repetitionsOf(block: Pick<StructuredBlock, "repetitions">): number {
  return block.repetitions && block.repetitions > 0 ? block.repetitions : 1;
}

export type PlannedTotals = {
  /** Σ reps × (duração + descanso); null when no block has a duration. */
  durationSeconds: number | null;
  /** Σ reps × distância; null when no block has a distance. */
  distanceMeters: number | null;
  /** Σ reps × duração of the main (non-auxiliary) blocks; null when none has a duration. */
  mainDurationSeconds: number | null;
  /** Σ reps × descanso; null when no block prescribes rest. */
  restSeconds: number | null;
};

/** Reads raw snapshot block records defensively: anything not a number is "not prescribed". */
export function asStructuredBlocks(raw: unknown): StructuredBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const block = entry as Record<string, unknown>;
    return [{
      blockType: typeof block.blockType === "string" ? block.blockType : "CUSTOM",
      title: typeof block.title === "string" ? block.title : null,
      durationS: typeof block.durationS === "number" ? block.durationS : null,
      distanceM: typeof block.distanceM === "number" ? block.distanceM : null,
      repetitions: typeof block.repetitions === "number" ? block.repetitions : null,
      targetPayload: block.targetPayload ?? null,
      restPayload: block.restPayload ?? null,
    }];
  });
}

export function plannedTotals(blocks: readonly StructuredBlock[]): PlannedTotals {
  let duration = 0;
  let distance = 0;
  let main = 0;
  let rest = 0;
  let hasDuration = false;
  let hasDistance = false;
  let hasMain = false;
  let hasRest = false;
  for (const block of blocks) {
    const reps = repetitionsOf(block);
    const blockRest = restDurationSeconds(block.restPayload) ?? 0;
    if (blockRest > 0) {
      hasRest = true;
      rest += reps * blockRest;
    }
    if (block.durationS != null) {
      hasDuration = true;
      // The last repetition's rest usually does not exist; the estimate is conservative (all included).
      duration += reps * (block.durationS + blockRest);
      if (!AUXILIARY_BLOCK_TYPES.has(block.blockType)) {
        hasMain = true;
        main += reps * block.durationS;
      }
    }
    if (block.distanceM != null) {
      hasDistance = true;
      distance += reps * block.distanceM;
    }
  }
  return {
    durationSeconds: hasDuration ? Math.round(duration) : null,
    distanceMeters: hasDistance ? Math.round(distance) : null,
    mainDurationSeconds: hasMain ? Math.round(main) : null,
    restSeconds: hasRest ? Math.round(rest) : null,
  };
}

export type StructureSegment = {
  blockIndex: number;
  blockTitle: string;
  repetition: number | null;
  kind: "work" | "rest";
  durationS: number | null;
  distanceM: number | null;
  payload: unknown;
};

/**
 * The prescription as the sequence of efforts a watch would record as laps.
 * Three readings are tried, in order of how coaches usually press the lap
 * button: rest after every repetition except the block's last, rest after
 * every repetition, and work segments only. Identical readings are deduped.
 */
export function expandStructure(blocks: readonly StructuredBlock[]): StructureSegment[][] {
  const build = (restMode: "between" | "after-each" | "none"): StructureSegment[] => {
    const segments: StructureSegment[] = [];
    blocks.forEach((block, blockIndex) => {
      const reps = repetitionsOf(block);
      const rest = restDurationSeconds(block.restPayload);
      const title = block.title ?? block.blockType;
      for (let repetition = 1; repetition <= reps; repetition += 1) {
        segments.push({
          blockIndex, blockTitle: title, repetition: reps > 1 ? repetition : null, kind: "work",
          durationS: block.durationS, distanceM: block.distanceM, payload: block.targetPayload,
        });
        const wantsRest = restMode === "after-each" || (restMode === "between" && repetition < reps);
        if (rest !== null && wantsRest) {
          segments.push({
            blockIndex, blockTitle: title, repetition: reps > 1 ? repetition : null, kind: "rest",
            durationS: rest, distanceM: null, payload: block.restPayload,
          });
        }
      }
    });
    return segments;
  };
  const candidates = [build("between"), build("after-each"), build("none")];
  return candidates.filter((candidate, index) =>
    candidates.findIndex((other) => other.length === candidate.length
      && other.every((segment, position) => segment.kind === candidate[position].kind)) === index);
}

/** The reading whose segment count equals `count`, if any. */
export function alignStructure(blocks: readonly StructuredBlock[], count: number): StructureSegment[] | null {
  return expandStructure(blocks).find((candidate) => candidate.length === count) ?? null;
}
