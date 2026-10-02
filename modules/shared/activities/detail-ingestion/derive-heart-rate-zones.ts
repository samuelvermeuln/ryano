/**
 * SAM-39 — derives a HEART_RATE zone set from a heart-rate stream when the
 * provider has no native zones (Strava today; any stream-only provider later).
 * Reuses the shared %FCmáx computation; the result is labelled `derived` with
 * the max-HR reference it was computed against, so the UI can say "estimadas".
 *
 * Pure: no I/O, no provider import.
 */
import {
  HEART_RATE_ZONE_LABELS,
  computeHeartRateZonesFromStream,
  resolveMaxHeartRateReference,
  type HeartRateSample,
} from "../heart-rate-zones";
import type { NormalizedActivityDetail, NormalizedZoneSet } from "../contracts/rich";

export function heartRateSamplesFromStreams(streams: NormalizedActivityDetail["streams"]): HeartRateSample[] | null {
  const time = streams.find((stream) => stream.key === "time");
  const heartRate = streams.find((stream) => stream.key === "heartRate");
  if (!time || !heartRate) return null;
  const samples: HeartRateSample[] = [];
  const length = Math.min(time.values.length, heartRate.values.length);
  for (let index = 0; index < length; index += 1) {
    const t = time.values[index];
    const bpm = heartRate.values[index];
    if (typeof t !== "number" || typeof bpm !== "number") continue;
    samples.push({ timeSeconds: t, bpm });
  }
  return samples.length > 0 ? samples : null;
}

/**
 * Returns the derived zone set, or null when there is no usable HR stream or
 * no max-HR reference (then nothing is shown — never a guessed zone).
 */
export function deriveHeartRateZoneSet(
  detail: Pick<NormalizedActivityDetail, "provider" | "streams">,
  reference: { maxHeartRate?: number | null; averageHeartRate?: number | null; ageYears?: number | null },
): NormalizedZoneSet | null {
  const samples = heartRateSamplesFromStreams(detail.streams);
  if (!samples) return null;
  const maxHeartRateReference = resolveMaxHeartRateReference(reference);
  if (maxHeartRateReference === null) return null;
  const section = computeHeartRateZonesFromStream(samples, maxHeartRateReference);
  if (!section) return null;
  return {
    zoneType: "HEART_RATE",
    source: { provider: detail.provider, kind: "derived" },
    configurationRef: `max-hr:${maxHeartRateReference}`,
    zones: section.items.map((item, index) => ({
      zoneNumber: index + 1,
      label: HEART_RATE_ZONE_LABELS[index] ?? item.label,
      lowerBound: null,
      upperBound: null,
      durationSeconds: item.seconds ?? 0,
    })),
  };
}
