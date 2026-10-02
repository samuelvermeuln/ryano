/**
 * SAM-30 — the IANA zone an independent-coaching calendar is read and written
 * in. A school has its own `School.timezone`; outside a school the only zone the
 * platform knows for a person is `NotificationPreference.timezone`, and the
 * platform default is what every other school-less path already falls back to
 * (`reschedule-workout.ts`, `fulfill-workout-request.ts`).
 */
import type { PrismaClient } from "@prisma/client";
import { isValidTimeZone } from "../domain/local-date";

export const DEFAULT_ATHLETE_TIME_ZONE = "America/Sao_Paulo";

export async function resolveAthleteTimeZone(
  db: Pick<PrismaClient, "notificationPreference">,
  athleteId: string,
): Promise<string> {
  const preference = await db.notificationPreference.findUnique({
    where: { userId: athleteId },
    select: { timezone: true },
  });
  const candidate = preference?.timezone;
  return candidate && isValidTimeZone(candidate) ? candidate : DEFAULT_ATHLETE_TIME_ZONE;
}
