import { describe, expect, it } from "vitest";
import { RevokeHistoryAccess } from "@/modules/athlete-history";

const grant = { id: "grant-1", athleteId: "athlete-1", status: "ACTIVE" };
type GrantUpdate = Partial<typeof grant>;

function database(status = "ACTIVE") {
  const tx = {
    historyAccessGrant: {
      findUnique: async () => ({ ...grant, status }),
      update: async ({ data }: { data: GrantUpdate }) => ({ ...grant, ...data }),
    },
  };
  return { $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx) };
}

describe("RevokeHistoryAccess", () => {
  it("ends future access without deleting its historical grant", async () => {
    await expect(new RevokeHistoryAccess(database() as never, () => new Date("2026-09-16")).execute("athlete-1", "grant-1"))
      .resolves.toMatchObject({ status: "REVOKED", revokedBy: "athlete-1" });
  });

  it("does not allow another athlete to revoke a grant", async () => {
    await expect(new RevokeHistoryAccess(database() as never).execute("other-athlete", "grant-1"))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
