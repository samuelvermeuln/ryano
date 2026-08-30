import { describe, expect, it } from "vitest";

import {
  normalizeGarminActivity,
  parseGarminActivity,
} from "@/modules/garmin/parsers/parse-garmin-activity";
import { parseGarminSportType } from "@/modules/garmin/parsers/parse-garmin-sport-type";

describe("parseGarminSportType", () => {
  it("maps known Garmin type keys to canonical sport types", () => {
    expect(parseGarminSportType("running")).toBe("run");
    expect(parseGarminSportType("trail_running")).toBe("trail-run");
    expect(parseGarminSportType("cycling")).toBe("bike");
    expect(parseGarminSportType("mountain_biking")).toBe("mtb");
    expect(parseGarminSportType("lap_swimming")).toBe("swim");
    expect(parseGarminSportType("open_water_swimming")).toBe("open-water");
    expect(parseGarminSportType("strength_training")).toBe("gym");
    expect(parseGarminSportType("walking")).toBe("walking");
    expect(parseGarminSportType("hiking")).toBe("hiking");
  });

  it("falls back to keyword matching for free-form and pt-BR labels", () => {
    expect(parseGarminSportType("Corrida na esteira")).toBe("run");
    expect(parseGarminSportType("Natação em piscina")).toBe("swim");
    expect(parseGarminSportType("Pedal de MTB")).toBe("mtb");
    expect(parseGarminSportType("Águas Abertas")).toBe("open-water");
  });

  it("returns default for unknown or empty values", () => {
    expect(parseGarminSportType("")).toBe("default");
    expect(parseGarminSportType("xyz-unknown")).toBe("default");
  });
});

describe("parseGarminActivity", () => {
  it("produces a canonical NormalizedActivity preserving provider sport type", () => {
    const activity = parseGarminActivity({
      activityId: 123,
      activityName: "Corrida leve",
      sportType: "running",
      startTimeLocal: "2026-01-10T10:00:00.000Z",
      durationSeconds: 1800,
      distance: 5000,
      averageHeartRate: 150,
    });

    expect(activity.source).toBe("GARMIN");
    expect(activity.externalId).toBe("123");
    expect(activity.sportType).toBe("run");
    expect(activity.providerSportType).toBe("running");
    expect(activity.durationSeconds).toBe(1800);
    expect(activity.distanceMeters).toBe(5000);
    expect(activity.averageHeartRate).toBe(150);
    expect(activity.raw).toBeDefined();
  });

  it("persists canonical sportType and preserves the raw Garmin value in providerSportType", () => {
    const payload = {
      activityId: 999,
      sportType: "mountain_biking",
      startTimeLocal: "2026-02-01T08:00:00.000Z",
      durationSeconds: 3600,
    };

    const persisted = normalizeGarminActivity(payload);
    const canonical = parseGarminActivity(payload);

    // Persistence now writes the canonical RyvanoSportType (task 3.4)...
    expect(persisted.sportType).toBe("mtb");
    // ...while preserving the original raw Garmin string in providerSportType.
    expect(persisted.providerSportType).toBe("mountain_biking");
    expect(persisted.provider).toBe("GARMIN");
    // Canonical output agrees on the same pair.
    expect(canonical.sportType).toBe("mtb");
    expect(canonical.providerSportType).toBe("mountain_biking");
    // Persistence and canonical output agree on sportType/providerSportType.
    expect(persisted.sportType).toBe(canonical.sportType);
    expect(persisted.providerSportType).toBe(canonical.providerSportType);
    // Both agree on identity and timing derived from the same extraction.
    expect(persisted.externalId).toBe(canonical.externalId);
    expect(persisted.startedAt.getTime()).toBe(canonical.startedAt.getTime());
  });
});
