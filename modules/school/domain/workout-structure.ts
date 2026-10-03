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
  /** Σ (reps × duração + pausas × descanso); null when no block has a duration. */
  durationSeconds: number | null;
  /** Σ reps × distância; null when no block has a distance. */
  distanceMeters: number | null;
  /** Σ reps × duração of the main (non-auxiliary) blocks; null when none has a duration. */
  mainDurationSeconds: number | null;
  /** Σ pausas × descanso; null when no block prescribes rest. */
  restSeconds: number | null;
  /**
   * SAM-48 — some block has no duration (distance-only, so its time depends on
   * the athlete's pace): `durationSeconds` covers only part of the session and
   * is shown as an estimate, never as an exact total.
   */
  durationIsPartial: boolean;
  /** Some block has no distance: `distanceMeters` covers only part of the session. */
  distanceIsPartial: boolean;
};

/**
 * SAM-48 / §11.2 — how many rest periods a block's prescribed rest produces.
 * The v1 snapshot has one "rest" per block, read as rest BETWEEN repetitions:
 * "6 × 100 m com 20 s" has five pauses, not six. A single-repetition block
 * with rest keeps that one rest — the only reading in which the coach's field
 * means anything. The v2 builder (SAM-69) makes the placement explicit.
 */
export function restPeriodsOf(block: Pick<StructuredBlock, "repetitions">): number {
  const reps = repetitionsOf(block);
  return reps > 1 ? reps - 1 : 1;
}

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
  let missingDuration = false;
  let missingDistance = false;
  for (const block of blocks) {
    const reps = repetitionsOf(block);
    const blockRest = restDurationSeconds(block.restPayload) ?? 0;
    const blockRestTotal = blockRest > 0 ? restPeriodsOf(block) * blockRest : 0;
    if (blockRestTotal > 0) {
      hasRest = true;
      rest += blockRestTotal;
    }
    if (block.durationS != null) {
      hasDuration = true;
      duration += reps * block.durationS + blockRestTotal;
      if (!AUXILIARY_BLOCK_TYPES.has(block.blockType)) {
        hasMain = true;
        main += reps * block.durationS;
      }
    } else {
      missingDuration = true;
    }
    if (block.distanceM != null) {
      hasDistance = true;
      distance += reps * block.distanceM;
    } else {
      missingDistance = true;
    }
  }
  return {
    durationSeconds: hasDuration ? Math.round(duration) : null,
    distanceMeters: hasDistance ? Math.round(distance) : null,
    mainDurationSeconds: hasMain ? Math.round(main) : null,
    restSeconds: hasRest ? Math.round(rest) : null,
    durationIsPartial: hasDuration && missingDuration,
    distanceIsPartial: hasDistance && missingDistance,
  };
}

/** A persisted `WorkoutBlock` row (Prisma `Decimal` distance) or a snapshot block. */
export type PlannedBlockRow = {
  blockType?: string | null;
  durationS: number | null;
  distanceM: number | string | { toNumber(): number } | null;
  repetitions?: number | null;
  restPayload?: unknown;
  targetPayload?: unknown;
};

/**
 * SAM-48 — the single way to total prescription blocks read from the
 * database. Every screen and use case that shows or compares "planned
 * duration/distance" goes through here, so the athlete card, the coach hub,
 * matching and compliance can never disagree about the same prescription.
 */
export function plannedTotalsOfRows(rows: readonly PlannedBlockRow[] | null | undefined): PlannedTotals {
  return plannedTotals((rows ?? []).map((row) => ({
    blockType: row.blockType ?? "CUSTOM",
    durationS: row.durationS,
    distanceM: row.distanceM == null ? null : Number(row.distanceM),
    repetitions: row.repetitions ?? null,
    targetPayload: row.targetPayload ?? null,
    restPayload: row.restPayload ?? null,
  })));
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
