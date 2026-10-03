import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SAM-47 / ADR escola 010 — "a Ryvano não prescreve" (AC23).
 *
 * A prescription (`Workout` + `WorkoutAssignment`) may only be written by a
 * use case that runs on behalf of a human who decided it. This test lists
 * every place in the code that writes one and compares it with the closed
 * list below; adding a new writer — a job, a webhook, a "smart" rule — fails
 * here until someone records in ADR-010 who the actor is and why it is not
 * the platform choosing a stimulus.
 */

type Actor =
  /** A coach (or school staff with coach permission) authors or assigns it. */
  | "coach"
  /** The athlete records what they already did; it is not a prescription to follow. */
  | "athlete-self-record"
  /** The athlete activated a plan the coach authored and published; the platform only lays it on the calendar. */
  | "athlete-activates-coach-plan"
  /** Persistence layer called by the use cases above. */
  | "infrastructure";

const ALLOWED_WRITERS: Record<string, Actor> = {
  "modules/school/application/prescribe-workout-to-athlete.ts": "coach",
  "modules/school/application/assign-workout.ts": "coach",
  "modules/school/application/assign-workout-to-team.ts": "coach",
  "modules/school/application/create-workout.ts": "coach",
  "modules/school/application/fulfill-workout-request.ts": "coach",
  "modules/school/application/log-unplanned-workout.ts": "athlete-self-record",
  "modules/school/application/instantiate-license-calendar.ts": "athlete-activates-coach-plan",
  "modules/school/infrastructure/workout-repository.ts": "infrastructure",
};

/**
 * Creation of a prescription. Updates are out of scope on purpose: matching,
 * status and reschedule legitimately update an assignment, and each of those
 * paths has its own actor checks; what must never appear unreviewed is a NEW
 * prescription.
 */
const WRITE_PATTERNS = [
  /\bworkoutAssignment\.(create|createMany|upsert)\s*\(/,
  /\bworkout\.(create|createMany|upsert)\s*\(/,
  /\b(repo|repository|workoutRepository)\.create\s*\(/,
];

const SCANNED_ROOTS = ["modules", "app", "server", "lib"];

function sourceFiles(dir: string): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** Files under `root` (relative, forward slashes) that write a prescription. */
function prescriptionWriters(root: string, roots = SCANNED_ROOTS): string[] {
  return roots
    .flatMap((dir) => sourceFiles(join(root, dir)))
    .filter((file) => WRITE_PATTERNS.some((pattern) => pattern.test(readFileSync(file, "utf8"))))
    .map((file) => relative(root, file).split(sep).join("/"))
    .sort();
}

describe("ADR-010 — only a human decision writes a prescription", () => {
  it("every writer of Workout/WorkoutAssignment is on the reviewed list", () => {
    const unexpected = prescriptionWriters(process.cwd()).filter((file) => !(file in ALLOWED_WRITERS));
    expect(unexpected).toEqual([]);
  });

  it("the reviewed list has no stale entries", () => {
    // A writer that was removed must leave the list too, or the list stops
    // describing the code and a later file could reuse an old blessing.
    const found = new Set(prescriptionWriters(process.cwd()));
    expect(Object.keys(ALLOWED_WRITERS).filter((file) => !found.has(file))).toEqual([]);
  });

  it("flags a new writer that is not on the list", () => {
    // Guards the guard: a scan that silently stopped matching would keep the
    // first assertion green forever.
    const root = mkdtempSync(join(tmpdir(), "prescription-guard-"));
    try {
      mkdirSync(join(root, "modules", "jobs"), { recursive: true });
      writeFileSync(
        join(root, "modules", "jobs", "auto-plan.ts"),
        "export async function run(tx) { await tx.workoutAssignment.createMany({ data: [] }); }\n",
      );
      writeFileSync(join(root, "modules", "jobs", "auto-plan.test.ts"), "tx.workout.create({})\n");
      writeFileSync(join(root, "modules", "jobs", "reader.ts"), "tx.workoutAssignment.findMany({})\n");
      expect(prescriptionWriters(root)).toEqual(["modules/jobs/auto-plan.ts"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
