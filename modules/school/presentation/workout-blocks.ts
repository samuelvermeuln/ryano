/**
 * Presentation of a prescribed workout's structure (blocks and their targets).
 *
 * Pure TypeScript with no directive on purpose: the athlete's own workout page
 * (a Server Component) and the school's athlete screen (which hands plain data
 * to a Client Component) both need it, and importing a helper out of a
 * `"use client"` module into a server file compiles, passes tsc and still 500s
 * at runtime.
 */

export const BLOCK_TYPE_LABEL: Record<string, string> = {
  WARMUP: "Aquecimento",
  INTERVAL: "Intervalo",
  STEADY: "Contínuo",
  RECOVERY: "Recuperação",
  COOLDOWN: "Desaquecimento",
  DRILL: "Exercício técnico",
  FREE: "Livre",
  CUSTOM: "Personalizado",
};

export const BLOCK_TYPE_EMOJI: Record<string, string> = {
  WARMUP: "🔥", INTERVAL: "⚡", STEADY: "➡️", RECOVERY: "💤",
  COOLDOWN: "❄️", DRILL: "🔄", FREE: "🎯", CUSTOM: "📝",
};

function formatRestDuration(totalSeconds: number): string {
  if (totalSeconds % 60 === 0) return `${totalSeconds / 60} min`;
  if (totalSeconds < 60) return `${totalSeconds} s`;
  return `${Math.floor(totalSeconds / 60)} min ${totalSeconds % 60} s`;
}

function formatPaceValue(totalSeconds: number): string {
  const min = Math.floor(totalSeconds / 60);
  const sec = Math.round(totalSeconds % 60);
  return `${min}:${String(sec).padStart(2, "0")}`;
}

/**
 * Human-readable target lines for one block's `targetPayload` / `restPayload`.
 *
 * The payload is free-form JSON written by coaches and the plan marketplace, so
 * every field is checked by type and anything unrecognised is ignored rather
 * than rendered.
 */
export function describeBlockTargets(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const t = payload as Record<string, unknown>;
  const lines: string[] = [];
  // SAM-5 — `restPayload` stores the rest length as `durationS` (prescription
  // builder's `restDurationS`); without this line "Descanso" never rendered.
  if (typeof t.durationS === "number") lines.push(formatRestDuration(t.durationS));
  if (typeof t.heartRateMin === "number" && typeof t.heartRateMax === "number") {
    lines.push(`FC: ${t.heartRateMin}–${t.heartRateMax} bpm`);
  } else if (typeof t.heartRateMin === "number") {
    lines.push(`FC: mín. ${t.heartRateMin} bpm`);
  } else if (typeof t.heartRateMax === "number") {
    lines.push(`FC: máx. ${t.heartRateMax} bpm`);
  } else if (typeof t.heartRate === "number") {
    lines.push(`FC: ${t.heartRate} bpm`);
  }
  if (typeof t.power === "number") lines.push(`Potência: ${t.power} W`);
  if (typeof t.paceSecPerKm === "number") lines.push(`Pace: ${formatPaceValue(t.paceSecPerKm)} /km`);
  if (typeof t.paceSec100m === "number") lines.push(`Pace nado: ${formatPaceValue(t.paceSec100m)} /100 m`);
  if (typeof t.zone === "string" || typeof t.zone === "number") lines.push(`Zona ${t.zone}`);
  if (typeof t.rpe === "number") lines.push(`RPE ${t.rpe}/10`);
  return lines;
}
