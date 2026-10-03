/**
 * SAM-58 — how a template's computed summary reads (§9.2 "Resumo calculado"):
 * distance exact or "≥" when a part has none; duration exact, or "estimada"
 * with the parts that have no duration and why. Never a made-up number.
 */
import { formatDistance, formatDuration } from "@/lib/format";
import type { TemplateSummary } from "../domain/workout-template-content";

export function describeTemplateSummary(summary: TemplateSummary | null): { distance: string | null; duration: string; missing: string[] } {
  if (!summary) return { distance: null, duration: "sem conteúdo", missing: [] };
  const distance = summary.distanceMeters ? `${summary.distanceIsPartial ? "≥ " : ""}${formatDistance(summary.distanceMeters)}` : null;
  const missing = summary.partsWithoutDuration.map((part) => `bloco ${part.position}${part.title ? ` (${part.title})` : ""}: ${part.reason}`);
  let duration: string;
  if (summary.durationSeconds && !summary.durationIsPartial) duration = formatDuration(summary.durationSeconds);
  else if (summary.durationSeconds) duration = `duração estimada (≥ ${formatDuration(summary.durationSeconds)})`;
  else duration = missing.length > 0 ? "duração estimada (depende do ritmo)" : "sem duração";
  return { distance, duration, missing };
}
