import { describe, expect, it } from "vitest";
import { createHistoryAccessGrant } from "@/modules/school/domain/history-access-grant";
import { createHistoryAccessGranted } from "@/modules/school/domain/history-access-granted";
import { createHistoryAccessRevoked } from "@/modules/school/domain/history-access-revoked";

const now = new Date("2026-09-16T12:00:00.000Z");
const scope = {
  activities: true, metrics: false, prescribedWorkouts: false, compliance: false,
  coachScores: false, coachComments: false, assessments: false, athleteFeedback: false,
};
function grant() {
  return createHistoryAccessGrant({
    id: "grant-1", athleteId: "athlete-1", grantedBy: "athlete-1", granteeType: "SCHOOL",
    granteeId: "school-1", schoolId: "school-1", coachId: null, scope, fromDate: null, toDate: null,
  }, now);
}

describe("history access domain events", () => {
  it("creates an immutable grant event from explicit consent", () => {
    expect(createHistoryAccessGranted(grant())).toMatchObject({
      type: "HistoryAccessGranted", grantId: "grant-1", athleteId: "athlete-1", granteeId: "school-1", scope,
    });
  });

  it("requires revocation metadata before creating a revocation event", () => {
    expect(() => createHistoryAccessRevoked(grant())).toThrow("requires a revoked");
    expect(createHistoryAccessRevoked({ ...grant(), status: "REVOKED", revokedBy: "athlete-1", revokedAt: now, updatedAt: now })).toMatchObject({
      type: "HistoryAccessRevoked", grantId: "grant-1", revokedBy: "athlete-1",
    });
  });
});
