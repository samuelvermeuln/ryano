/**
 * SAM-59 — a legible diff between two versions of a prescription, shown
 * before publishing a change (§9.4): what was added, removed or changed —
 * fields and blocks, including targets. Pure; used by the coach's builder
 * and by the history of the athlete and the coach.
 */
import type { PrescriptionBlock } from "../domain/prescription-block";
import { BLOCK_TYPE_LABEL, describeBlockTargets } from "./workout-blocks";

export type PrescriptionShape = {
  title: string;
  description: string | null;
  sportType: string;
  scheduledAtLocal: string | null;
  blocks: PrescriptionBlock[];
};

export type FieldChange = { field: string; label: string; from: string; to: string };
export type BlockChange =
  | { kind: "added"; position: number; summary: string }
  | { kind: "removed"; position: number; summary: string }
  | { kind: "changed"; position: number; changes: FieldChange[] };

const FIELD_LABELS: Record<string, string> = {
  title: "Título", description: "Orientações", sportType: "Modalidade", scheduledAtLocal: "Data e hora",
  blockType: "Tipo", durationS: "Duração", distanceM: "Distância", repetitions: "Repetições", restDurationS: "Descanso", target: "Alvos", name: "Nome",
};

const show = (value: unknown) => (value === null || value === undefined || value === "" ? "—" : String(value));

function minutes(seconds: number | null) {
  if (!seconds) return null;
  return seconds % 60 === 0 ? `${seconds / 60} min` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

function blockSummary(block: PrescriptionBlock): string {
  return [
    BLOCK_TYPE_LABEL[block.blockType] ?? block.blockType,
    block.title,
    block.repetitions && block.repetitions > 1 ? `${block.repetitions}×` : null,
    block.distanceM ? `${block.distanceM} m` : null,
    minutes(block.durationS),
    block.restDurationS ? `descanso ${minutes(block.restDurationS)}` : null,
  ].filter(Boolean).join(" · ");
}

function targets(block: PrescriptionBlock): string {
  return describeBlockTargets(block.target ?? null).join(", ") || "—";
}

function blockFieldChanges(before: PrescriptionBlock, after: PrescriptionBlock): FieldChange[] {
  const pairs: Array<[string, unknown, unknown]> = [
    ["blockType", BLOCK_TYPE_LABEL[before.blockType] ?? before.blockType, BLOCK_TYPE_LABEL[after.blockType] ?? after.blockType],
    ["name", before.title, after.title],
    ["durationS", minutes(before.durationS), minutes(after.durationS)],
    ["distanceM", before.distanceM ? `${before.distanceM} m` : null, after.distanceM ? `${after.distanceM} m` : null],
    ["repetitions", before.repetitions, after.repetitions],
    ["restDurationS", minutes(before.restDurationS), minutes(after.restDurationS)],
    ["target", targets(before), targets(after)],
  ];
  return pairs
    .filter(([, from, to]) => show(from) !== show(to))
    .map(([field, from, to]) => ({ field, label: FIELD_LABELS[field] ?? field, from: show(from), to: show(to) }));
}

export function diffPrescription(before: PrescriptionShape, after: PrescriptionShape): { fields: FieldChange[]; blocks: BlockChange[]; changed: boolean } {
  const fields = (["title", "description", "sportType", "scheduledAtLocal"] as const)
    .filter((field) => show(before[field]) !== show(after[field]))
    .map((field) => ({ field, label: FIELD_LABELS[field]!, from: show(before[field]), to: show(after[field]) }));
  const blocks: BlockChange[] = [];
  const length = Math.max(before.blocks.length, after.blocks.length);
  for (let index = 0; index < length; index += 1) {
    const old = before.blocks[index];
    const next = after.blocks[index];
    if (old && !next) blocks.push({ kind: "removed", position: index + 1, summary: blockSummary(old) });
    else if (!old && next) blocks.push({ kind: "added", position: index + 1, summary: blockSummary(next) });
    else if (old && next) {
      const changes = blockFieldChanges(old, next);
      if (changes.length > 0) blocks.push({ kind: "changed", position: index + 1, changes });
    }
  }
  return { fields, blocks, changed: fields.length > 0 || blocks.length > 0 };
}
