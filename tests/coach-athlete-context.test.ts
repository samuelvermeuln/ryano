import { describe, expect, it, vi } from "vitest";
import { ResolveCoachAthleteContext } from "@/modules/school/application/resolve-coach-athlete-context";
import { SchoolError } from "@/modules/school/domain/errors";

/**
 * SAM-11 — the gate every coach-facing athlete screen goes through.
 *
 * What is under test is the boundary, not the formatting: the ids in the URL are
 * navigation context, so each of the four conditions (coach profile, coach's
 * membership in *this* school, athlete's membership in *this* school, and the
 * read permission) must be able to refuse on its own, and refusal must not leak
 * which of them refused.
 */
const NOW = new Date("2026-09-29T15:00:00.000Z");
const PERIOD_START = new Date("2026-09-01T00:00:00.000Z");

function makeDb(overrides: Record<string, unknown> = {}) {
  return {
    school: {
      findUnique: vi.fn().mockResolvedValue({
        id: "school", name: "Escola Ryvano", status: "ACTIVE", timezone: "America/Sao_Paulo",
      }),
    },
    coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach", status: "ACTIVE" }) },
    coachSchoolMembership: { findFirst: vi.fn().mockResolvedValue({ id: "coach-membership" }) },
    schoolAthleteMembership: {
      findFirst: vi.fn().mockResolvedValue({ startedAt: PERIOD_START, createdAt: PERIOD_START }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: "athlete", name: "Ana", email: "ana@example.com", image: null,
      }),
    },
    coachAthleteAssignment: {
      findFirst: vi.fn().mockResolvedValue({
        id: "assignment", coachId: "coach",
        coach: { displayName: "Prof. Carlos", user: { name: "Carlos" } },
      }),
    },
    teamAthlete: { findMany: vi.fn().mockResolvedValue([{ team: { name: "Turma A" } }]) },
    schoolMembership: { findFirst: vi.fn().mockResolvedValue(null) },
    schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides,
  } as never;
}

/**
 * Answers the two distinct assignment lookups the gate makes — "who is primary"
 * and "does the actor hold one" — by inspecting the query instead of counting
 * calls, because the read-permission check queries assignments too.
 */
function assignmentLookup(
  actorAssignment: { id: string } | null,
  options: { primary?: { coachId: string; coach: { displayName: string | null; user: { name: string | null } } } | null } = {},
) {
  const primary = options.primary === undefined
    ? { coachId: "other-coach", coach: { displayName: "Prof. Marina", user: { name: "Marina" } } }
    : options.primary;
  return (args: { where: Record<string, unknown> }) => {
    if (args.where.isPrimary === true) return Promise.resolve(primary);
    return Promise.resolve(actorAssignment);
  };
}

function resolve(db: unknown) {
  return new ResolveCoachAthleteContext(db as never, () => NOW);
}

describe("ResolveCoachAthleteContext — who may open an athlete", () => {
  it("resolves the athlete for the assigned coach of that school", async () => {
    const context = await resolve(makeDb()).execute("user", "school", "athlete");

    expect(context.coachId).toBe("coach");
    expect(context.athlete.name).toBe("Ana");
    expect(context.isResponsibleCoach).toBe(true);
    expect(context.teams).toEqual(["Turma A"]);
    expect(context.periodStart).toEqual(PERIOD_START);
    expect(context.timeZone).toBe("America/Sao_Paulo");
  });

  it("refuses a coach with no membership in this school, without saying why", async () => {
    const db = makeDb({ coachSchoolMembership: { findFirst: vi.fn().mockResolvedValue(null) } });

    await expect(resolve(db).execute("user", "other-school", "athlete"))
      .rejects.toThrow(new SchoolError("ATHLETE_NOT_FOUND", "Atleta não encontrado nesta escola.", 404));
  });

  it("refuses when the athlete is not an active member of this school", async () => {
    const db = makeDb({ schoolAthleteMembership: { findFirst: vi.fn().mockResolvedValue(null) } });

    await expect(resolve(db).execute("user", "school", "athlete"))
      .rejects.toMatchObject({ code: "ATHLETE_NOT_FOUND", status: 404 });
  });

  it("refuses a coach whose profile is not active", async () => {
    const db = makeDb({
      coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach", status: "SUSPENDED" }) },
    });

    await expect(resolve(db).execute("user", "school", "athlete"))
      .rejects.toMatchObject({ code: "ATHLETE_NOT_FOUND" });
  });

  it("refuses a coach of the school who is not assigned to this athlete", async () => {
    // No assignment at all: `CanReadAthleteCurrentData` denies, and an unassigned
    // coach must not read a colleague's athlete just by editing the URL.
    const db = makeDb({
      coachAthleteAssignment: { findFirst: vi.fn().mockResolvedValue(null) },
    });

    await expect(resolve(db).execute("user", "school", "athlete"))
      .rejects.toMatchObject({ code: "ATHLETE_NOT_FOUND" });
  });

  it("requires a signed-in actor", async () => {
    await expect(resolve(makeDb()).execute(null, "school", "athlete"))
      .rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
  });

  it("refuses to open an athlete in an inactive school", async () => {
    const db = makeDb({
      school: { findUnique: vi.fn().mockResolvedValue({ id: "school", name: "Escola", status: "INACTIVE" }) },
    });

    await expect(resolve(db).execute("user", "school", "athlete"))
      .rejects.toMatchObject({ code: "SCHOOL_INACTIVE", status: 409 });
  });

  it("scopes the athlete's membership lookup to this school, not just to the athlete", async () => {
    const db = makeDb();
    await resolve(db).execute("user", "school", "athlete");

    expect((db as never as { schoolAthleteMembership: { findFirst: ReturnType<typeof vi.fn> } })
      .schoolAthleteMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ schoolId: "school", athleteId: "athlete", status: "ACTIVE" }),
      }),
    );
  });
});

describe("ResolveCoachAthleteContext — who is responsible", () => {
  it("marks an administrator reading the sheet as not the responsible coach", async () => {
    // The primary assignment belongs to someone else and the actor holds none, so
    // they may read (they are an admin) but must not be offered the prescription
    // actions. Dispatching on the query rather than on call order: the read
    // permission check also queries assignments, and its position is an internal
    // detail of the gate.
    const db = makeDb({
      coachAthleteAssignment: { findFirst: vi.fn().mockImplementation(assignmentLookup(null)) },
      // `CanManageSchool` re-verifies endedAt, userId and the role's membershipId,
      // so a partial membership row would be rejected as not manageable.
      schoolMembership: {
        findFirst: vi.fn().mockResolvedValue({
          id: "membership", schoolId: "school", userId: "user", status: "ACTIVE", endedAt: null,
        }),
      },
      schoolMembershipRole: {
        findMany: vi.fn().mockResolvedValue([{ membershipId: "membership", role: "ADMIN" }]),
      },
    });

    const context = await resolve(db).execute("user", "school", "athlete");

    expect(context.isResponsibleCoach).toBe(false);
    // `displayName` wins over the user's own name: it is what the school chose to show.
    expect(context.currentCoach).toEqual({ coachId: "other-coach", name: "Prof. Marina" });
  });

  it("reports no responsible coach when the athlete has no primary assignment", async () => {
    const db = makeDb({
      coachAthleteAssignment: {
        findFirst: vi.fn().mockImplementation(assignmentLookup({ id: "own-assignment" }, { primary: null })),
      },
    });

    const context = await resolve(db).execute("user", "school", "athlete");

    expect(context.currentCoach).toBeNull();
    // Still the responsible coach: they hold an active assignment even though
    // nobody is flagged primary.
    expect(context.isResponsibleCoach).toBe(true);
  });
});
