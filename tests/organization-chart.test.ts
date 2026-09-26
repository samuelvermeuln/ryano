import { describe, expect, it, vi } from "vitest";
import { GetOrganizationChart } from "@/modules/school/application/get-organization-chart";
import { GetAthleteOrganizationDetail } from "@/modules/school/application/get-athlete-organization-detail";

const now = new Date("2026-09-20T12:00:00Z");
const prior = new Date("2026-09-01T10:00:00Z");

type Overrides = {
  role?: string;
  member?: boolean;
  coaches?: unknown[];
  assignments?: unknown[];
  athletes?: unknown[];
};

function coach(id: string, extra: Record<string, unknown> = {}) {
  return {
    id: `m-${id}`, coachId: id, startedAt: prior, suspendedAt: null,
    coach: { id, userId: `u-${id}`, displayName: id, user: { image: null } },
    ...extra,
  };
}

function assignment(athleteId: string, coachId: string, extra: Record<string, unknown> = {}) {
  return {
    id: `a-${athleteId}`, athleteId, coachId, sportType: "RUNNING", startedAt: prior,
    athlete: { id: athleteId, name: athleteId, email: `${athleteId}@e.com`, image: null, status: "ACTIVE" },
    ...extra,
  };
}

function athleteMembership(athleteId: string) {
  return {
    id: `sm-${athleteId}`, athleteId,
    athlete: { id: athleteId, name: athleteId, email: `${athleteId}@e.com`, image: null, status: "ACTIVE" },
  };
}

function fixture(overrides: Overrides = {}) {
  const calls: Record<string, unknown> = {};
  const db = {
    school: {
      findUnique: vi.fn(async () => ({
        id: "school", name: "Escola", slug: "escola", logoUrl: null, status: "ACTIVE",
      })),
    },
    schoolMembership: {
      findFirst: vi.fn(async () => overrides.member === false
        ? null
        : { id: "manager", schoolId: "school", userId: "owner", status: "ACTIVE", endedAt: null }),
    },
    schoolMembershipRole: {
      findMany: vi.fn(async () => [{ membershipId: "manager", role: overrides.role ?? "OWNER" }]),
    },
    coachSchoolMembership: {
      findMany: vi.fn(async (args: { where: unknown }) => {
        calls.coaches = args.where;
        return overrides.coaches ?? [coach("ana"), coach("bruno")];
      }),
    },
    coachAthleteAssignment: {
      findMany: vi.fn(async (args: { where: unknown }) => {
        calls.assignments = args.where;
        return overrides.assignments ?? [assignment("caio", "ana")];
      }),
    },
    schoolAthleteMembership: {
      findMany: vi.fn(async (args: { where: unknown }) => {
        calls.athletes = args.where;
        return overrides.athletes ?? [athleteMembership("caio"), athleteMembership("dora")];
      }),
    },
  };
  return { db, calls, chart: new GetOrganizationChart(db as never) };
}

describe("GetOrganizationChart", () => {
  it("nests athletes under the coach that follows them", async () => {
    const result = await fixture().chart.execute("owner", "school");
    expect(result.coaches.map((c) => c.displayName)).toEqual(["ana", "bruno"]);
    expect(result.coaches[0].athletes.map((a) => a.name)).toEqual(["caio"]);
    expect(result.coaches[1].athletes).toEqual([]);
  });

  it("surfaces athletes with no coach instead of hiding them", async () => {
    const result = await fixture().chart.execute("owner", "school");
    expect(result.unassigned.map((a) => a.name)).toEqual(["dora"]);
    expect(result.school.assignedAthleteCount).toBe(1);
    expect(result.school.athleteCount).toBe(2);
  });

  it("scopes every read to the requested school", async () => {
    const f = fixture();
    await f.chart.execute("owner", "school");
    // Without schoolId on all three, one school's chart would show another's people.
    expect(f.calls.coaches).toMatchObject({ schoolId: "school" });
    expect(f.calls.assignments).toMatchObject({ schoolId: "school" });
    expect(f.calls.athletes).toMatchObject({ schoolId: "school" });
  });

  it("marks a suspended coach inactive while keeping their athletes visible", async () => {
    const f = fixture({
      coaches: [coach("ana", { suspendedAt: now })],
      assignments: [assignment("caio", "ana")],
    });
    const result = await f.chart.execute("owner", "school");
    expect(result.coaches[0].active).toBe(false);
    expect(result.coaches[0].athletes).toHaveLength(1);
    expect(result.school.activeCoachCount).toBe(0);
    expect(result.school.coachCount).toBe(1);
  });

  it("refuses a caller who does not belong to the school", async () => {
    const f = fixture({ member: false });
    await expect(f.chart.execute("stranger", "school")).rejects.toMatchObject({ status: 403 });
  });

  it("rejects an anonymous caller", async () => {
    await expect(fixture().chart.execute(null, "school")).rejects.toMatchObject({ status: 401 });
  });

  it("lets a plain member read the chart but not manage it", async () => {
    const f = fixture({ role: "COACH" });
    const result = await f.chart.execute("owner", "school");
    expect(result.canManage).toBe(false);
    expect(result.coaches).toHaveLength(2);
  });

  it("reports canManage for an administrator", async () => {
    const result = await fixture({ role: "ADMIN" }).chart.execute("owner", "school");
    expect(result.canManage).toBe(true);
  });

  it("404s an unknown school rather than returning an empty chart", async () => {
    const f = fixture();
    f.db.school.findUnique.mockResolvedValueOnce(null as never);
    await expect(f.chart.execute("owner", "missing")).rejects.toMatchObject({ status: 404 });
  });

  it("does not list an athlete twice when a coach follows them", async () => {
    const result = await fixture().chart.execute("owner", "school");
    const ids = [
      ...result.coaches.flatMap((c) => c.athletes.map((a) => a.athleteId)),
      ...result.unassigned.map((a) => a.athleteId),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("GetAthleteOrganizationDetail", () => {
  function detailFixture(periods?: unknown[]) {
    const db = {
      school: { findUnique: vi.fn(async () => ({ id: "school" })) },
      schoolMembership: {
        findFirst: vi.fn(async () => ({
          id: "manager", schoolId: "school", userId: "owner", status: "ACTIVE", endedAt: null,
        })),
      },
      schoolMembershipRole: { findMany: vi.fn(async () => [{ membershipId: "manager", role: "OWNER" }]) },
      schoolAthleteMembership: {
        findFirst: vi.fn(async () => ({
          id: "sm", status: "ACTIVE", startedAt: prior, joinSource: "MANUAL_SEARCH",
        })),
      },
      user: {
        findUnique: vi.fn(async () => ({
          id: "caio", name: "Caio", email: "caio@e.com", image: null, status: "ACTIVE",
          profile: { phoneE164: "+5511999999999" },
        })),
        findMany: vi.fn(async () => [{ id: "owner", name: "Dono" }]),
      },
      coachAthleteAssignment: {
        findMany: vi.fn(async () => periods ?? [
          {
            id: "new", coachId: "bruno", status: "ACTIVE", isPrimary: true, sportType: "RUNNING",
            startedAt: now, endedAt: null, assignedBy: "owner", endedBy: null, reason: "Troca de turno",
            coach: { id: "bruno", displayName: "Bruno", userId: "u-bruno" },
          },
          {
            id: "old", coachId: "ana", status: "ENDED", isPrimary: true, sportType: "RUNNING",
            startedAt: prior, endedAt: now, assignedBy: "owner", endedBy: "owner", reason: null,
            coach: { id: "ana", displayName: "Ana", userId: "u-ana" },
          },
        ]),
      },
      trainingLicense: { findMany: vi.fn(async () => []) },
      session: { findFirst: vi.fn(async () => null) },
    };
    return { db, detail: new GetAthleteOrganizationDetail(db as never, () => now) };
  }

  it("returns the current coach and the transfer history with its reason", async () => {
    const result = await detailFixture().detail.execute("owner", "school", "caio");
    expect(result.currentCoach).toMatchObject({ coachId: "bruno" });
    expect(result.history).toHaveLength(2);
    expect(result.history[0]).toMatchObject({ coachName: "Bruno", reason: "Troca de turno" });
    expect(result.history[1]).toMatchObject({ coachName: "Ana", endedAt: now });
  });

  it("resolves who performed each change into a name", async () => {
    const result = await detailFixture().detail.execute("owner", "school", "caio");
    expect(result.history[0].assignedByName).toBe("Dono");
  });

  it("reports no coach rather than failing when the athlete has none", async () => {
    const result = await detailFixture([]).detail.execute("owner", "school", "caio");
    expect(result.currentCoach).toBeNull();
    expect(result.history).toEqual([]);
  });

  it("never exposes the CPF", async () => {
    const f = detailFixture();
    await f.detail.execute("owner", "school", "caio");
    const [args] = f.db.user.findUnique.mock.calls[0] as unknown as [{ select: Record<string, unknown> }];
    const select = args;
    expect(select.select).not.toHaveProperty("profile.cpfEncrypted");
    expect(JSON.stringify(select.select)).not.toContain("cpf");
  });

  it("404s an athlete who is not a member of this school", async () => {
    const f = detailFixture();
    f.db.schoolAthleteMembership.findFirst.mockResolvedValueOnce(null as never);
    await expect(f.detail.execute("owner", "school", "outsider")).rejects.toMatchObject({ status: 404 });
  });

  it("refuses a caller outside the school", async () => {
    const f = detailFixture();
    f.db.schoolMembership.findFirst.mockResolvedValueOnce(null as never);
    await expect(f.detail.execute("stranger", "school", "caio")).rejects.toMatchObject({ status: 403 });
  });
});
