/**
 * SAM-60 — relative targets (§10.2, §18.2): "70–75% do FTP" in a template is
 * resolved per athlete against THEIR technical sheet at assignment time, and
 * the reference, value, sheet revision and formula are frozen with the
 * prescription — a later assessment never changes what was published (AC14).
 *
 * A missing or incompatible reference is NOT resolved and nothing is
 * invented: the athlete's row is blocked with the reason until the coach
 * records the reference or changes how the session is guided (RPE or heart
 * rate are not equivalents of FTP — AC07).
 */
import { z } from "zod";

export const RELATIVE_REFERENCES = ["FTP", "CSS", "THRESHOLD_PACE", "THRESHOLD_HR", "MAX_HR", "HRR"] as const;
export type RelativeReference = (typeof RELATIVE_REFERENCES)[number];
export const RELATIVE_REFERENCE_LABELS: Record<RelativeReference, string> = {
  FTP: "FTP", CSS: "CSS", THRESHOLD_PACE: "ritmo de limiar", THRESHOLD_HR: "FC de limiar", MAX_HR: "FC máxima", HRR: "FC de reserva",
};

export const relativeTargetSchema = z.strictObject({
  reference: z.enum(RELATIVE_REFERENCES),
  minPct: z.number().min(1).max(200),
  maxPct: z.number().min(1).max(200),
}).refine((value) => value.minPct <= value.maxPct, { message: "O mínimo não pode passar do máximo.", path: ["maxPct"] });
export type RelativeTarget = z.infer<typeof relativeTargetSchema>;

/** What the sheet offers; null = not recorded. */
export type SheetReferences = {
  sheetRevisionId: string | null;
  ftpWatts: number | null;
  cssSecPer100m: number | null;
  thresholdPaceSecPerKm: number | null;
  thresholdHeartRate: number | null;
  maxHeartRate: number | null;
  restingHeartRate: number | null;
};

export type ResolvedFrom = { reference: RelativeReference; value: number; sheetRevisionId: string | null; formula: string };

export type Resolution =
  | { ok: true; target: Record<string, number>; resolvedFrom: ResolvedFrom }
  | { ok: false; reason: string };

const round = (value: number) => Math.round(value);

/** One relative target against one athlete's sheet. */
export function resolveRelativeTarget(relative: RelativeTarget, sheet: SheetReferences): Resolution {
  const missing = (label: string): Resolution => ({ ok: false, reason: `Sem ${label} na ficha técnica: cadastre a referência ou oriente de outra forma.` });
  const from = (value: number, formula: string): ResolvedFrom => ({ reference: relative.reference, value, sheetRevisionId: sheet.sheetRevisionId, formula });
  const { minPct, maxPct } = relative;
  switch (relative.reference) {
    case "FTP": {
      if (!sheet.ftpWatts) return missing("FTP");
      return { ok: true, target: { powerMin: round(sheet.ftpWatts * minPct / 100), powerMax: round(sheet.ftpWatts * maxPct / 100) }, resolvedFrom: from(sheet.ftpWatts, `${minPct}–${maxPct}% × FTP ${sheet.ftpWatts} W`) };
    }
    case "CSS": {
      if (!sheet.cssSecPer100m) return missing("CSS");
      // % of CSS speed: a higher percentage is a faster (smaller) pace.
      return { ok: true, target: { paceSec100mMin: round(sheet.cssSecPer100m * 100 / maxPct), paceSec100mMax: round(sheet.cssSecPer100m * 100 / minPct) }, resolvedFrom: from(sheet.cssSecPer100m, `ritmo = CSS ${sheet.cssSecPer100m} s/100 m ÷ ${minPct}–${maxPct}% da velocidade`) };
    }
    case "THRESHOLD_PACE": {
      if (!sheet.thresholdPaceSecPerKm) return missing("ritmo de limiar");
      return { ok: true, target: { paceSecPerKmMin: round(sheet.thresholdPaceSecPerKm * 100 / maxPct), paceSecPerKmMax: round(sheet.thresholdPaceSecPerKm * 100 / minPct) }, resolvedFrom: from(sheet.thresholdPaceSecPerKm, `ritmo = limiar ${sheet.thresholdPaceSecPerKm} s/km ÷ ${minPct}–${maxPct}% da velocidade`) };
    }
    case "THRESHOLD_HR": {
      if (!sheet.thresholdHeartRate) return missing("FC de limiar");
      return { ok: true, target: { heartRateMin: round(sheet.thresholdHeartRate * minPct / 100), heartRateMax: round(sheet.thresholdHeartRate * maxPct / 100) }, resolvedFrom: from(sheet.thresholdHeartRate, `${minPct}–${maxPct}% × FC de limiar ${sheet.thresholdHeartRate} bpm`) };
    }
    case "MAX_HR": {
      if (!sheet.maxHeartRate) return missing("FC máxima");
      return { ok: true, target: { heartRateMin: round(sheet.maxHeartRate * minPct / 100), heartRateMax: round(sheet.maxHeartRate * maxPct / 100) }, resolvedFrom: from(sheet.maxHeartRate, `${minPct}–${maxPct}% × FC máxima ${sheet.maxHeartRate} bpm`) };
    }
    case "HRR": {
      if (!sheet.maxHeartRate || !sheet.restingHeartRate) return missing("FC máxima e de repouso");
      const reserve = sheet.maxHeartRate - sheet.restingHeartRate;
      return {
        ok: true,
        target: { heartRateMin: round(sheet.restingHeartRate + reserve * minPct / 100), heartRateMax: round(sheet.restingHeartRate + reserve * maxPct / 100) },
        resolvedFrom: from(reserve, `repouso ${sheet.restingHeartRate} + ${minPct}–${maxPct}% × reserva ${reserve} bpm (Karvonen)`),
      };
    }
  }
}

type BlockWithTargets = { target?: Record<string, unknown> | undefined; title?: string | null } & Record<string, unknown>;

/**
 * Resolves every block with a relative target; the resolved values replace the
 * relative one and `resolvedFrom` is kept in the target (frozen in the
 * snapshot). The first block that cannot be resolved blocks the athlete.
 */
export function resolveTargets<T extends BlockWithTargets>(blocks: readonly T[], sheet: SheetReferences): { ok: true; blocks: T[]; references: ResolvedFrom[] } | { ok: false; reason: string; position: number } {
  const resolved: T[] = [];
  const references: ResolvedFrom[] = [];
  for (const [index, block] of blocks.entries()) {
    const relative = (block.target as { relative?: RelativeTarget } | undefined)?.relative;
    if (!relative) {
      resolved.push(block);
      continue;
    }
    const result = resolveRelativeTarget(relative, sheet);
    if (!result.ok) return { ok: false, reason: `Bloco ${index + 1}: ${result.reason}`, position: index + 1 };
    const { relative: _relative, ...rest } = block.target as Record<string, unknown>;
    void _relative;
    resolved.push({ ...block, target: { ...rest, ...result.target, resolvedFrom: result.resolvedFrom } });
    references.push(result.resolvedFrom);
  }
  return { ok: true, blocks: resolved, references };
}

export function hasRelativeTargets(blocks: ReadonlyArray<{ target?: unknown }>): boolean {
  return blocks.some((block) => Boolean((block.target as { relative?: unknown } | undefined)?.relative));
}
