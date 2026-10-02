/**
 * SAM-34/37 — the list of what an athlete did, as the coach and the school
 * read it: one card per imported activity (linking to its detail) or
 * self-logged session, with origin, volume, the prescribed × executed outcome
 * and the prescription it fulfilled. Server Component; the caller decides the
 * hrefs, so the same list serves the coach hub and the school sheet.
 */
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { formatDistance, formatDuration, formatHeartRate } from "@/lib/format";
import type { CoachAthleteActivityItem } from "@/modules/school/application/get-coach-athlete-activities";
import { formatScheduledDateTime } from "@/modules/school/presentation/format";
import { PRESCRIPTION_OUTCOME_LABELS } from "@/modules/school/presentation/workout-labels";
import { resolveSportLabel } from "@/modules/shared/activities/sport-types";
import { getProviderDefinition } from "@/modules/shared/integrations/catalog";
import type { ProviderId } from "@/modules/shared/integrations/types";

export function outcomeTone(outcome: CoachAthleteActivityItem["outcome"]) {
  switch (outcome) {
    case "EXECUTED_AS_PLANNED": return "success" as const;
    case "EXECUTED_PARTIALLY": return "warning" as const;
    case "EXECUTED_DIFFERENTLY": return "warning" as const;
    case "UNPLANNED_ACTIVITY": return "neutral" as const;
    default: return "neutral" as const;
  }
}

function providerLabel(provider: string | null): string {
  if (!provider) return "Registro do atleta";
  return getProviderDefinition(provider as ProviderId)?.name ?? provider;
}

export function AthleteActivitiesList({
  items,
  timeZone,
  activityHref,
  prescriptionHref,
}: {
  items: CoachAthleteActivityItem[];
  timeZone: string;
  /** Detail page of an imported activity. */
  activityHref: (activityId: string) => string;
  /** Detail page of a prescription of this scope; null hides the link. */
  prescriptionHref: ((assignmentId: string) => string) | null;
}) {
  return (
    <ul className="space-y-2" data-testid="athlete-activities">
      {items.map((item) => {
        const body = (
          <>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{item.name ?? resolveSportLabel(item.sportType)}</span>
              <span className="block text-xs text-foreground/55">
                {[formatScheduledDateTime(item.startedAt, timeZone), resolveSportLabel(item.sportType), providerLabel(item.provider)]
                  .filter(Boolean).join(" · ")}
              </span>
              <span className="mt-1 flex flex-wrap gap-x-3 text-xs text-foreground/50">
                {(item.movingSeconds ?? item.durationSeconds) != null && (
                  <span>⏱ {formatDuration(item.movingSeconds ?? item.durationSeconds)}</span>
                )}
                {item.distanceMeters != null && <span>📏 {formatDistance(item.distanceMeters)}</span>}
                {item.averageHeartRate != null && <span>♥ {formatHeartRate(item.averageHeartRate)}</span>}
              </span>
              {item.prescription && (
                <span className="mt-1 block text-xs text-foreground/60">
                  {"Prescrição: "}
                  {prescriptionHref
                    ? (
                      <Link href={prescriptionHref(item.prescription.assignmentId)} className="underline-offset-4 hover:underline">
                        {item.prescription.title}
                      </Link>
                    )
                    : item.prescription.title}
                </span>
              )}
            </span>
            <span className="flex shrink-0 flex-wrap items-center gap-2">
              {item.outcome
                ? <StatusBadge tone={outcomeTone(item.outcome)}>{PRESCRIPTION_OUTCOME_LABELS[item.outcome]}</StatusBadge>
                : <StatusBadge tone="neutral">Prescrição de outro vínculo</StatusBadge>}
            </span>
          </>
        );
        const className = "flex flex-col gap-2 rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between";
        return (
          <li key={`${item.kind}:${item.id}`} data-testid="athlete-activity" data-outcome={item.outcome ?? "other-scope"}>
            {item.kind === "imported" ? (
              <Link
                href={activityHref(item.id)}
                aria-label={`Abrir atividade ${item.name ?? resolveSportLabel(item.sportType)}`}
                className={`${className} transition-colors hover:bg-white/10`}
              >
                {body}
              </Link>
            ) : (
              <div className={className}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
