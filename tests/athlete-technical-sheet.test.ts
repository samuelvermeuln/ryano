import { describe, expect, it, vi } from "vitest";
import {
  athleteTechnicalSheetInputSchema,
  deriveHeartRateZones,
} from "@/modules/school/domain/athlete-technical-sheet";
import { SaveAthleteTechnicalSheet } from "@/modules/school/application/save-athlete-technical-sheet";

/**
 * SAM-11 — the athlete's technical sheet.
 *
 * The sheet is what the prescription reads its intensity from, so the rules that
 * matter are: every field optional (a half-filled sheet is legitimate), the heart
 * rates orderable, and the audit trail recording which parameters were touched
 * without copying the athlete's values into a second table.
 */
const NOW = new Date("2026-09-29T15:00:00.000Z");
const PERIOD_START = new Date("2026-09-01T00:00:00.000Z");

describe("athleteTechnicalSheetInputSchema", () => {
  it("accepts a sheet with nothing but a goal", () => {
    const parsed = athleteTechnicalSheetInputSchema.parse({ goals: "Terminar a primeira maratona" });

    expect(parsed.goals).toBe("Terminar a primeira maratona");
    expect(parsed.sportTypes).toEqual([]);
    expect(parsed.maxHeartRate).toBeNull();
  });

  it("accepts a completely empty sheet", () => {
    // Every field optional is a deliberate rule, not an oversight: a coach can
    // start the sheet with a single number and fill the rest later.
    expect(() => athleteTechnicalSheetInputSchema.parse({})).not.toThrow();
  });

  it("normalises blank text to null instead of storing empty strings", () => {
    const parsed = athleteTechnicalSheetInputSchema.parse({ goals: "   ", notes: "" });

    expect(parsed.goals).toBeNull();
    expect(parsed.notes).toBeNull();
  });

  it("drops a repeated modality, since order carries no meaning", () => {
    const parsed = athleteTechnicalSheetInputSchema.parse({
      sportTypes: ["run", "bike", "run"],
    });

    expect(parsed.sportTypes).toEqual(["run", "bike"]);
  });

  it("refuses a modality outside the canonical taxonomy", () => {
    const result = athleteTechnicalSheetInputSchema.safeParse({ sportTypes: ["corrida-na-praia"] });

    expect(result.success).toBe(false);
  });

  it("refuses a threshold heart rate above the maximum", () => {
    const result = athleteTechnicalSheetInputSchema.safeParse({
      maxHeartRate: 180, thresholdHeartRate: 190,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("A FC de limiar não pode ser maior que a FC máxima.");
  });

  it("refuses a resting heart rate at or above the maximum", () => {
    // Both values inside their own bounds (resting is capped at 150), so it is
    // the cross-field rule that refuses and not a range check.
    const result = athleteTechnicalSheetInputSchema.safeParse({
      maxHeartRate: 140, restingHeartRate: 140,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message)
      .toBe("A FC de repouso não pode ser maior ou igual à FC máxima.");
  });

  it("allows a threshold heart rate with no maximum to compare against", () => {
    // Half-filled is valid; the cross-field rule only applies when both exist.
    const parsed = athleteTechnicalSheetInputSchema.parse({ thresholdHeartRate: 168 });

    expect(parsed.thresholdHeartRate).toBe(168);
    expect(parsed.maxHeartRate).toBeNull();
  });

  it("refuses physiologically impossible values", () => {
    expect(athleteTechnicalSheetInputSchema.safeParse({ maxHeartRate: 400 }).success).toBe(false);
    expect(athleteTechnicalSheetInputSchema.safeParse({ maxHeartRate: 10 }).success).toBe(false);
    expect(athleteTechnicalSheetInputSchema.safeParse({ ftpWatts: 9000 }).success).toBe(false);
  });

  it("refuses an unknown field instead of silently discarding it", () => {
    const result = athleteTechnicalSheetInputSchema.safeParse({ vo2max: 62 });

    expect(result.success).toBe(false);
  });
});

describe("deriveHeartRateZones", () => {
  it("derives the five zones from the reference maximum", () => {
    const zones = deriveHeartRateZones(200);

    expect(zones).toHaveLength(5);
    expect(zones[0]).toMatchObject({ zone: 1, fromPercent: 50, toPercent: 60, fromBpm: 100, toBpm: 120 });
    expect(zones[4]).toMatchObject({ zone: 5, fromBpm: 180, toBpm: 200 });
  });

  it("returns nothing when there is no reference, so a screen can say so", () => {
    // Not five zero-width bars: those read as data the athlete does not have.
    expect(deriveHeartRateZones(null)).toEqual([]);
    expect(deriveHeartRateZones(0)).toEqual([]);
  });

  it("leaves no gap or overlap between consecutive zones", () => {
    const zones = deriveHeartRateZones(186);

    for (let index = 1; index < zones.length; index += 1) {
      expect(zones[index]!.fromBpm).toBe(zones[index - 1]!.toBpm);
    }
  });
});

function makeDb(options: { existing?: boolean } = {}) {
  const upserts: Array<Record<string, unknown>> = [];
  const audits: Array<Record<string, unknown>> = [];

  const tx = {
    athleteTechnicalSheet: {
      upsert: vi.fn().mockImplementation((args: Record<string, unknown>) => {
        upserts.push(args);
        return Promise.resolve({ id: options.existing ? "existing-sheet" : "new-sheet" });
      }),
    },
    // `AuditService` writes to `schoolAuditLog` and swallows its own failures, so
    // a wrong delegate name here would silently record nothing.
    schoolAuditLog: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        audits.push(data);
        return Promise.resolve(data);
      }),
    },
  };

  const db = {
    school: { findUnique: vi.fn().mockResolvedValue({ id: "school", name: "Escola", status: "ACTIVE" }) },
    coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach", status: "ACTIVE" }) },
    coachSchoolMembership: { findFirst: vi.fn().mockResolvedValue({ id: "coach-membership" }) },
    schoolAthleteMembership: {
      findFirst: vi.fn().mockResolvedValue({ startedAt: PERIOD_START, createdAt: PERIOD_START }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: "athlete", name: "Ana", email: "ana@x.com", image: null }),
    },
    coachAthleteAssignment: {
      findFirst: vi.fn().mockImplementation((args: { where: Record<string, unknown> }) =>
        Promise.resolve(
          args.where.isPrimary === true
            ? { coachId: "coach", coach: { displayName: null, user: { name: "Carlos" } } }
            : { id: "own-assignment" },
        )),
    },
    teamAthlete: { findMany: vi.fn().mockResolvedValue([]) },
    schoolMembership: { findFirst: vi.fn().mockResolvedValue(null) },
    schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn().mockImplementation((fn: (client: unknown) => unknown) => fn(tx)),
  };

  return { db, upserts, audits };
}

describe("SaveAthleteTechnicalSheet", () => {
  it("upserts on (schoolId, athleteId) so one athlete has exactly one sheet", async () => {
    const { db, upserts } = makeDb();

    await new SaveAthleteTechnicalSheet(db as never, () => NOW)
      .execute("user", "school", "athlete", { maxHeartRate: 190, sportTypes: ["run"] });

    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      where: { schoolId_athleteId: { schoolId: "school", athleteId: "athlete" } },
    });
  });

  it("refuses the write when the athlete does not belong to this school", async () => {
    const { db, upserts } = makeDb();
    db.schoolAthleteMembership.findFirst.mockResolvedValue(null);

    await expect(
      new SaveAthleteTechnicalSheet(db as never, () => NOW)
        .execute("user", "school", "athlete", { maxHeartRate: 190 }),
    ).rejects.toMatchObject({ code: "ATHLETE_NOT_FOUND" });
    expect(upserts).toHaveLength(0);
  });

  it("records which parameters were touched, never their values", async () => {
    const { db, audits } = makeDb();

    await new SaveAthleteTechnicalSheet(db as never, () => NOW).execute("user", "school", "athlete", {
      maxHeartRate: 190,
      goals: "Sub 3h na maratona",
      sportTypes: ["run"],
    });

    expect(audits).toHaveLength(1);
    const metadata = audits[0]?.metadata as { athleteId: string; fieldsProvided: string[] };
    expect(metadata.fieldsProvided).toEqual(
      expect.arrayContaining(["maxHeartRate", "goals", "sportTypes"]),
    );
    // Empty fields are not listed, and no value is copied into the trail.
    expect(metadata.fieldsProvided).not.toContain("ftpWatts");
    expect(JSON.stringify(audits[0])).not.toContain("Sub 3h na maratona");
    expect(JSON.stringify(audits[0])).not.toContain("190");
  });

  it("refuses an invalid sheet before opening a transaction", async () => {
    const { db, upserts } = makeDb();

    await expect(
      new SaveAthleteTechnicalSheet(db as never, () => NOW)
        .execute("user", "school", "athlete", { maxHeartRate: 170, thresholdHeartRate: 190 }),
    ).rejects.toThrow();
    expect(upserts).toHaveLength(0);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
