import { describe, expect, it } from "vitest";
import { GrantHistoryAccess } from "@/modules/athlete-history";

const scope = {
  activities: true,
  metrics: false,
  prescribedWorkouts: false,
  compliance: false,
  coachScores: false,
  coachComments: false,
  assessments: false,
  athleteFeedback: false,
};
const now = new Date("2026-09-16T12:00:00.000Z");

function database() {
  const created: unknown[] = [];
  const tx = {
    school: { findUnique: async () => ({ id: "school-1", status: "ACTIVE" }) },
    coachProfile: { findUnique: async () => ({ id: "coach-1", status: "ACTIVE" }) },
    historyAccessGrant: { create: async ({ data }: { data: unknown }) => { created.push(data); return data; } },
  };
  return {
    created,
    db: { $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx) },
  };
}

describe("GrantHistoryAccess", () => {
  it("persists an explicit athlete-owned school grant", async () => {
    const { db, created } = database();
    const result = await new GrantHistoryAccess(db as never, () => now).execute("athlete-1", {
      athleteId: "athlete-1", granteeType: "SCHOOL", granteeId: "school-1", scope,
    });
    expect(result).toMatchObject({ athleteId: "athlete-1", schoolId: "school-1", status: "ACTIVE" });
    expect(created).toHaveLength(1);
  });

  it("rejects attempts to share another athlete's history", async () => {
    const { db } = database();
    await expect(new GrantHistoryAccess(db as never, () => now).execute("actor-1", {
      athleteId: "athlete-1", granteeType: "SCHOOL", granteeId: "school-1", scope,
    })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });
});
