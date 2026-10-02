/**
 * SAM-42 — ingest the daily health of every connected connection whose
 * provider has the `dailyHealth` capability (Garmin first) into
 * `AthleteDailyHealth`, one row per (user, provider, local day).
 *
 *   npx tsx scripts/ingest-daily-health.ts                    # today, everyone
 *   npx tsx scripts/ingest-daily-health.ts --date=2026-10-01  # one local day
 *   npx tsx scripts/ingest-daily-health.ts --user=<userId>    # one athlete
 *   npx tsx scripts/ingest-daily-health.ts --provider=GARMIN
 *
 * Idempotent: re-running updates the day in place. Schedule it daily (and
 * once more a few hours later: sleep/HRV of the night arrive during the
 * morning). Nothing here decides by provider name — the registry does.
 */
import { prisma } from "../server/db";
import { IngestDailyHealth } from "../modules/shared/health";
import { providerRegistry } from "../modules/shared/integrations/registry";
import type { ProviderId } from "../modules/shared/integrations/types";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const result = await new IngestDailyHealth(prisma, providerRegistry).execute({
    date: arg("date"),
    userId: arg("user"),
    provider: arg("provider") as ProviderId | undefined,
  });
  console.log(`daily health: ${result.considered} connections, ${result.ingested} ingested, ${result.empty} without data, ${result.skipped} skipped (no capability), ${result.failed} failed`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
