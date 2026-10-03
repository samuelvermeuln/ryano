/**
 * SAM-19 — backfill compliance for executions matched before the match flow
 * started scoring automatically, and for rows scored by an older algorithm.
 *
 *   npx tsx scripts/backfill-compliance.ts            # score what is missing or outdated
 *   npx tsx scripts/backfill-compliance.ts --all      # rescore every matched execution
 *   npx tsx scripts/backfill-compliance.ts --dry-run  # only count
 *
 * Idempotent: `CalculateWorkoutCompliance` upserts by execution, and a row
 * already at `COMPLIANCE_ALGORITHM_VERSION` is skipped unless `--all`. Runs
 * through the same use case as the live flow (lap reader included), so a
 * backfilled score is the score the match would have produced. Failures are
 * counted and printed, never fatal to the run.
 */
import { prisma } from "../server/db";
import { CalculateWorkoutCompliance } from "../modules/school/application/calculate-workout-compliance";
import { COMPLIANCE_ALGORITHM_VERSION } from "../modules/school/domain/workout-compliance";
import { loadExecutionLaps } from "../modules/strava/application/activities/activity-visual-with-split-fallback";

const MATCHED = ["AUTO_MATCHED", "CONFIRMED", "OVERRIDDEN"] as const;

async function main() {
  const all = process.argv.includes("--all");
  const dryRun = process.argv.includes("--dry-run");

  const executions = await prisma.workoutExecution.findMany({
    where: {
      matchStatus: { in: [...MATCHED] },
      // Only prescriptions with a workout snapshot can be scored.
      assignment: { workoutId: { not: null } },
      ...(all ? {} : { OR: [{ compliance: null }, { compliance: { algorithmVersion: { lt: COMPLIANCE_ALGORITHM_VERSION } } }] }),
    },
    select: { id: true, compliance: { select: { algorithmVersion: true } } },
    orderBy: { createdAt: "asc" },
  });

  console.log(`${executions.length} execution(s) to score (algorithm v${COMPLIANCE_ALGORITHM_VERSION}${all ? ", --all" : ""})`);
  if (dryRun) return;

  const calc = new CalculateWorkoutCompliance(prisma, () => new Date(), loadExecutionLaps);
  let ok = 0;
  let failed = 0;
  for (const execution of executions) {
    try {
      const saved = await calc.execute({ executionId: execution.id });
      ok += 1;
      console.log(saved
        ? `  ${execution.id}: ${saved.overallScore}/100 (${saved.strategyKey}, was v${execution.compliance?.algorithmVersion ?? "—"})`
        : `  ${execution.id}: sem dados mensuráveis — sem registro (SAM-48)`);
    } catch (error) {
      failed += 1;
      console.error(`  ${execution.id}: FAILED — ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`done: ${ok} scored, ${failed} failed`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
