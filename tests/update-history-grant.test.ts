import { describe, expect, it } from "vitest";
import { UpdateHistoryGrant } from "@/modules/athlete-history";

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
const grant = {
  id: "grant-1", athleteId: "athlete-1", status: "ACTIVE", scope,
  fromDate: null, toDate: null,
};

function database() {
  const tx = {
    historyAccessGrant: {
      findUnique: async () => grant,
      update: async ({ data }: { data: unknown }) => ({ ...grant, ...data }),
    },
  };
  return { $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx) };
}

describe("UpdateHistoryGrant", () => {
  it("allows the owning athlete to narrow future history access", async () => {
    await expect(new UpdateHistoryGrant(database() as never).execute("athlete-1", "grant-1", {
      scope: { ...scope, metrics: true },
    })).resolves.toMatchObject({ scope: { ...scope, metrics: true } });
  });

  it("refuses a different athlete and an invalid period", async () => {
    await expect(new UpdateHistoryGrant(database() as never).execute("other-athlete", "grant-1", { scope }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(new UpdateHistoryGrant(database() as never).execute("athlete-1", "grant-1", {
      fromDate: new Date("2026-02-01"), toDate: new Date("2026-01-01"),
    })).rejects.toMatchObject({ code: "HISTORY_GRANT_INVALID_PERIOD" });
  });
});
