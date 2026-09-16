import { describe, expect, it } from "vitest";
import {
  createHistoryAccessGrant,
  historyAccessGrantSchema,
} from "@/modules/athlete-history";

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

const schoolGrant = {
  id: "grant-1",
  athleteId: "athlete-1",
  granteeType: "SCHOOL" as const,
  granteeId: "school-1",
  schoolId: "school-1",
  coachId: null,
  scope,
  fromDate: null,
  toDate: null,
  grantedBy: "athlete-1",
};

describe("HistoryAccessGrant", () => {
  it("creates an active, revocable school grant without moving history", () => {
    expect(createHistoryAccessGrant(schoolGrant, now)).toMatchObject({
      ...schoolGrant,
      status: "ACTIVE",
      grantedAt: now,
      revokedBy: null,
      revokedAt: null,
    });
  });

  it("requires a typed recipient and a valid sharing period", () => {
    expect(() => createHistoryAccessGrant({ ...schoolGrant, granteeId: "other-school" }, now)).toThrow();
    expect(() => createHistoryAccessGrant({
      ...schoolGrant,
      fromDate: new Date("2026-02-01"),
      toDate: new Date("2026-01-01"),
    }, now)).toThrow();
  });

  it("requires revocation data to agree with the grant status", () => {
    expect(() => historyAccessGrantSchema.parse({
      ...createHistoryAccessGrant(schoolGrant, now),
      status: "REVOKED",
    })).toThrow();
  });
});
