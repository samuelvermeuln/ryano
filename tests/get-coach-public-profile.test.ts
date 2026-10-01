import { describe, expect, it, vi } from "vitest";
import { GetCoachPublicProfile } from "@/modules/school/application/get-coach-public-profile";

const createdAt = new Date("2025-01-10T12:00:00Z");
const requestedAt = new Date("2026-09-10T12:00:00Z");

function coachRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "coach:1", userId: "user:coach", displayName: "Ricardo Souza", bio: "Personal", status: "ACTIVE", createdAt,
    sportTypes: ["run"], credentials: ["CREF 012345-G/SP"], acceptsIndependentAthletes: false,
    user: { image: null, email: "prof.ricardo@ryvano-e2e.test" },
    schoolMemberships: [{ school: { id: "school:alpha", name: "Escola Alpha", city: "São Paulo", state: "SP" } }],
    ...overrides,
  };
}

function fixture(options: {
  coach?: Record<string, unknown> | null;
  assignments?: Array<{ id: string; schoolId: string | null; status: string; createdAt: Date }>;
  viewerSchools?: Array<{ schoolId: string }>;
} = {}) {
  const db = {
    coachProfile: { findUnique: vi.fn(async () => (options.coach === null ? null : coachRow(options.coach ?? {}))) },
    coachAthleteAssignment: {
      count: vi.fn(async () => 9),
      findMany: vi.fn(async () => options.assignments ?? []),
    },
    schoolAthleteMembership: { findMany: vi.fn(async () => options.viewerSchools ?? []) },
  };
  return { db, useCase: new GetCoachPublicProfile(db as never) };
}

describe("GetCoachPublicProfile [SAM-25]", () => {
  it.each([null, "", " "])("requires a session before reading: %j", async (actor) => {
    const { db, useCase } = fixture();
    await expect(useCase.execute(actor, "coach:1")).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    expect(db.coachProfile.findUnique).not.toHaveBeenCalled();
  });

  it.each([{ coach: null }, { coach: { status: "INACTIVE" } }])("hides absent or inactive coaches as 404: %j", async (options) => {
    const { db, useCase } = fixture(options);
    await expect(useCase.execute("user:athlete", "coach:1")).rejects.toMatchObject({ code: "COACH_PROFILE_NOT_FOUND", status: 404 });
    expect(db.coachAthleteAssignment.count).not.toHaveBeenCalled();
  });

  it("maps the public fields and the viewer's relationship without exposing the coach's e-mail", async () => {
    const { db, useCase } = fixture({
      assignments: [{ id: "a:1", schoolId: null, status: "PENDING", createdAt: requestedAt }],
      viewerSchools: [{ schoolId: "school:alpha" }],
    });
    const profile = await useCase.execute("user:athlete", "coach:1");
    expect(profile).toMatchObject({
      id: "coach:1", displayName: "Ricardo Souza", since: createdAt, activeAthleteCount: 9,
      schools: [{ id: "school:alpha", name: "Escola Alpha", city: "São Paulo", state: "SP" }],
      // SAM-28
      sportTypes: ["run"], credentials: ["CREF 012345-G/SP"], acceptsIndependentAthletes: false,
      viewer: {
        assignments: [{ id: "a:1", schoolId: null, status: "PENDING", requestedAt }],
        sharedSchoolIds: ["school:alpha"],
        isSelf: false,
      },
    });
    expect(JSON.stringify(profile)).not.toMatch(/ryvano-e2e|user:coach/);
    expect(db.schoolAthleteMembership.findMany).toHaveBeenCalledWith({
      where: { athleteId: "user:athlete", status: "ACTIVE", schoolId: { in: ["school:alpha"] } }, select: { schoolId: true },
    });
  });

  it("flags the coach viewing their own profile and skips the shared-school lookup without schools", async () => {
    const { db, useCase } = fixture({ coach: { schoolMemberships: [] } });
    const profile = await useCase.execute("user:coach", "coach:1");
    expect(profile.viewer.isSelf).toBe(true);
    expect(profile.viewer.sharedSchoolIds).toEqual([]);
    expect(db.schoolAthleteMembership.findMany).not.toHaveBeenCalled();
  });
});
