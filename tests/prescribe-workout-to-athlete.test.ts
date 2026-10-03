import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import {
  PrescribeWorkoutToAthlete,
  prescribeWorkoutSchema,
} from "@/modules/school/application/prescribe-workout-to-athlete";
import { SchoolError } from "@/modules/school/domain/errors";

/**
 * SAM-11 — prescribing from the athlete's own screen.
 *
 * Two things are under test: that only the responsible coach may write (reading
 * the sheet is not enough), and that the structure the coach submits survives
 * into the stored blocks with its units intact — a block whose targets are
 * dropped is a prescription the athlete cannot follow.
 */
const NOW = new Date("2026-09-29T15:00:00.000Z");
const SCHEDULED = new Date("2026-09-30T09:00:00.000Z");
const PERIOD_START = new Date("2026-09-01T00:00:00.000Z");

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    title: "Intervalado de 400m",
    sportType: "running",
    scheduledAt: SCHEDULED.toISOString(),
    blocks: [
      { blockType: "WARMUP", durationS: 600 },
      {
        blockType: "INTERVAL", distanceM: 400, repetitions: 8,
        target: { heartRateMin: 160, heartRateMax: 175 },
        restDurationS: 90,
      },
    ],
    ...overrides,
  };
}

/**
 * The gate's own queries are exercised by `coach-athlete-context.test.ts`; here
 * they are satisfied so the test can reach the write, with `isPrimary` driving
 * whether the actor is the responsible coach.
 */
function makeDb(options: { responsible?: boolean; team?: { id: string } | null } = {}) {
  const responsible = options.responsible ?? true;
  const createdBlocks: Array<Record<string, unknown>> = [];
  const createdWorkouts: Array<Record<string, unknown>> = [];
  const createdAssignments: Array<Record<string, unknown>> = [];

  const tx = {
    coachSchoolMembership: { findFirst: vi.fn().mockResolvedValue({ id: "coach-membership" }) },
    team: { findFirst: vi.fn().mockResolvedValue(options.team ?? null) },
    workout: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        createdWorkouts.push(data);
        return Promise.resolve({ ...data });
      }),
    },
    workoutBlock: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        createdBlocks.push(data);
        // The repository writes `Prisma.JsonNull` for an absent payload and the
        // database reads it back as a real null; echoing the sentinel would make
        // the row fail its own schema.
        return Promise.resolve({ ...data, ...readBackJson(data) });
      }),
    },
    workoutAssignment: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        createdAssignments.push(data);
        return Promise.resolve({ ...data });
      }),
    },
    workoutAssignmentHistory: { create: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };

  const db = {
    school: {
      findUnique: vi.fn().mockResolvedValue({ id: "school", name: "Escola", status: "ACTIVE" }),
    },
    coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach", status: "ACTIVE" }) },
    // SAM-70 — no sheet: nothing to freeze as the reference.
    athleteTechnicalSheet: { findFirst: vi.fn().mockResolvedValue(null) },
    coachSchoolMembership: { findFirst: vi.fn().mockResolvedValue({ id: "coach-membership" }) },
    schoolAthleteMembership: {
      findFirst: vi.fn().mockResolvedValue({ startedAt: PERIOD_START, createdAt: PERIOD_START }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: "athlete", name: "Ana", email: "ana@x.com", image: null }),
    },
    coachAthleteAssignment: {
      findFirst: vi.fn().mockImplementation((args: { where: Record<string, unknown> }) => {
        if (args.where.isPrimary === true) {
          return Promise.resolve({
            coachId: responsible ? "coach" : "other-coach",
            coach: { displayName: null, user: { name: responsible ? "Carlos" : "Marina" } },
          });
        }
        return Promise.resolve(responsible ? { id: "own-assignment" } : null);
      }),
    },
    teamAthlete: { findMany: vi.fn().mockResolvedValue([]) },
    schoolMembership: {
      findFirst: vi.fn().mockResolvedValue(
        // An administrator so a non-responsible actor still passes the read gate
        // and is refused by the prescription rule specifically.
        responsible ? null : { id: "m", schoolId: "school", userId: "user", status: "ACTIVE", endedAt: null },
      ),
    },
    schoolMembershipRole: {
      findMany: vi.fn().mockResolvedValue(responsible ? [] : [{ membershipId: "m", role: "ADMIN" }]),
    },
    $transaction: vi.fn().mockImplementation((fn: (client: unknown) => unknown) => fn(tx)),
  };

  return { db, tx, createdBlocks, createdWorkouts, createdAssignments };
}

/** Mirrors what Postgres returns for the JSON columns the repository writes. */
function readBackJson(data: Record<string, unknown>): Record<string, unknown> {
  const fields = ["targetPayload", "restPayload"] as const;
  return Object.fromEntries(
    fields
      .filter((field) => field in data)
      .map((field) => [field, data[field] === Prisma.JsonNull ? null : data[field]]),
  );
}

function prescribe(db: unknown) {
  return new PrescribeWorkoutToAthlete(db as never, () => NOW);
}

describe("PrescribeWorkoutToAthlete — who may prescribe", () => {
  it("lets the athlete's responsible coach prescribe", async () => {
    const { db, createdAssignments } = makeDb();

    await prescribe(db).execute("user", "school", "athlete", validInput());

    expect(createdAssignments).toHaveLength(1);
    expect(createdAssignments[0]).toMatchObject({
      athleteId: "athlete", schoolId: "school", coachId: "coach", status: "SCHEDULED",
    });
  });

  it("refuses an administrator who may read the sheet but is not the responsible coach", async () => {
    const { db, createdWorkouts } = makeDb({ responsible: false });

    await expect(prescribe(db).execute("user", "school", "athlete", validInput()))
      .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    // Nothing was written — the refusal happens before the transaction.
    expect(createdWorkouts).toHaveLength(0);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("refuses when the coach's school membership ended between check and write", async () => {
    const { db, tx } = makeDb();
    tx.coachSchoolMembership.findFirst.mockResolvedValue(null);

    await expect(prescribe(db).execute("user", "school", "athlete", validInput()))
      .rejects.toMatchObject({ code: "COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE", status: 403 });
  });

  it("refuses a team that does not belong to this school", async () => {
    const { db } = makeDb({ team: null });

    await expect(prescribe(db).execute("user", "school", "athlete", validInput({ teamId: "other-team" })))
      .rejects.toMatchObject({ code: "TEAM_NOT_FOUND", status: 404 });
  });

  it("requires a signed-in actor", async () => {
    const { db } = makeDb();

    await expect(prescribe(db).execute(null, "school", "athlete", validInput()))
      .rejects.toBeInstanceOf(SchoolError);
  });
});

describe("PrescribeWorkoutToAthlete — the stored structure", () => {
  it("keeps block order, units and intensity targets", async () => {
    const { db, createdBlocks } = makeDb();

    await prescribe(db).execute("user", "school", "athlete", validInput());

    expect(createdBlocks).toHaveLength(2);
    expect(createdBlocks[0]).toMatchObject({ position: 0, blockType: "WARMUP", durationS: 600 });
    expect(createdBlocks[1]).toMatchObject({
      position: 1, blockType: "INTERVAL", repetitions: 8,
      targetPayload: { heartRateMin: 160, heartRateMax: 175 },
    });
    // The rest duration travels with the rest targets, so the structure renders
    // the recovery in one place.
    expect(createdBlocks[1]?.restPayload).toEqual({ durationS: 90 });
  });

  it("stores no target payload for a block the coach left plain", async () => {
    const { db, createdBlocks } = makeDb();

    await prescribe(db).execute("user", "school", "athlete", validInput({
      blocks: [{ blockType: "STEADY", durationS: 1800 }],
    }));

    expect(readBackJson(createdBlocks[0]!)).toEqual({ targetPayload: null, restPayload: null });
  });

  it("records the prescribing coach as the workout's author", async () => {
    const { db, createdWorkouts } = makeDb();

    await prescribe(db).execute("user", "school", "athlete", validInput());

    expect(createdWorkouts[0]).toMatchObject({ authorCoachId: "coach", originSchoolId: "school" });
  });
});

describe("prescribeWorkoutSchema — what the domain refuses", () => {
  it("refuses a block with neither duration nor distance", () => {
    const result = prescribeWorkoutSchema.safeParse(validInput({
      blocks: [{ blockType: "STEADY" }],
    }));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Cada bloco precisa de duração ou distância.");
  });

  it("refuses an inverted heart-rate range", () => {
    const result = prescribeWorkoutSchema.safeParse(validInput({
      blocks: [{ blockType: "INTERVAL", durationS: 300, target: { heartRateMin: 180, heartRateMax: 150 } }],
    }));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("A FC mínima não pode ser maior que a máxima.");
  });

  it("refuses a prescription with no blocks at all", () => {
    const result = prescribeWorkoutSchema.safeParse(validInput({ blocks: [] }));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Adicione ao menos um bloco.");
  });

  it("refuses an unknown key instead of silently dropping it", () => {
    // `strictObject`: a typo in a field name must not be accepted as "no value".
    const result = prescribeWorkoutSchema.safeParse(validInput({ sportTypes: "running" }));

    expect(result.success).toBe(false);
  });

  it("rejects an empty title", () => {
    expect(() => prescribeWorkoutSchema.parse(validInput({ title: "   " }))).toThrow(ZodError);
  });
});
