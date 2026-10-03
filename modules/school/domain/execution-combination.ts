/**
 * SAM-62 — several activities linked to ONE prescribed session (§17.3: a
 * session recorded in two files). The pieces add up once: an activity whose
 * time overlaps one already counted is the same effort recorded twice (a
 * mirror from another connection) and is not added again.
 */
export type CombinableExecution = {
  id: string;
  startedAt: Date;
  durationSeconds: number | null;
  distanceMeters: number | null;
};

export type CombinedExecution<T extends CombinableExecution> = {
  /** The first piece in time: the reference for per-session metrics (HR, compliance). */
  primary: T;
  pieces: T[];
  /** Pieces left out because they overlap a counted one. */
  overlapping: T[];
  durationSeconds: number | null;
  distanceMeters: number | null;
};

const end = (execution: CombinableExecution) => execution.startedAt.getTime() + (execution.durationSeconds ?? 0) * 1000;

export function combineExecutions<T extends CombinableExecution>(executions: readonly T[]): CombinedExecution<T> | null {
  if (executions.length === 0) return null;
  const sorted = [...executions].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const pieces: T[] = [];
  const overlapping: T[] = [];
  for (const execution of sorted) {
    const overlaps = pieces.some((counted) => execution.startedAt.getTime() < end(counted) && end(execution) > counted.startedAt.getTime())
      || pieces.some((counted) => counted.startedAt.getTime() === execution.startedAt.getTime());
    (overlaps ? overlapping : pieces).push(execution);
  }
  const sum = (key: "durationSeconds" | "distanceMeters") =>
    pieces.some((piece) => piece[key] !== null) ? pieces.reduce((total, piece) => total + (piece[key] ?? 0), 0) : null;
  return { primary: pieces[0]!, pieces, overlapping, durationSeconds: sum("durationSeconds"), distanceMeters: sum("distanceMeters") };
}
