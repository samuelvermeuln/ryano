import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { createHistoryAccessGrant, historyAccessGrantSchema } from "@/modules/school/domain/history-access-grant";

const now = new Date("2026-09-15T12:00:00Z");
const later = new Date("2026-09-16T12:00:00Z");
const input = {
  id: "grant", athleteId: "athlete", granteeType: "SCHOOL" as const,
  granteeId: "school", schoolId: "school", coachId: null, grantedBy: "athlete",
  fromDate: new Date("2020-01-01"), toDate: new Date("2020-12-31"),
  scope: { activities: true, metrics: true, prescribedWorkouts: false, compliance: false,
    coachScores: false, coachComments: false, assessments: false, athleteFeedback: false },
};
const active = () => createHistoryAccessGrant(input, now);

describe("HistoryAccessGrant entity [T102]", () => {
  it.each(Object.keys(input.scope))("requires an explicit choice for %s [T103]", (category) => {
    const scope: Record<string, unknown> = { ...input.scope };
    delete scope[category];
    expect(() => historyAccessGrantSchema.parse({ ...active(), scope })).toThrow(ZodError);
  });

  it.each([null, "true", 1, [], {}])("never coerces category consent from %j [T103]", (value) => {
    expect(() => historyAccessGrantSchema.parse({ ...active(), scope: { ...input.scope, activities: value } }))
      .toThrow(ZodError);
  });

  it.each([
    { granteeType: "SCHOOL" as const, granteeId: "school", schoolId: "school", coachId: null },
    { granteeType: "COACH" as const, granteeId: "coach", schoolId: null, coachId: "coach" },
  ])("creates explicit $granteeType consent even for a past data period", (recipient) => {
    expect(createHistoryAccessGrant({ ...input, ...recipient }, now)).toEqual({
      ...input, ...recipient, status: "ACTIVE", grantedAt: now,
      revokedBy: null, revokedAt: null, createdAt: now, updatedAt: now,
    });
  });

  it.each([
    { athleteId: "" }, { granteeId: " other " }, { grantedBy: "manager" },
    { granteeType: "ADMIN" }, { schoolId: null }, { coachId: "coach" },
    { granteeId: "other-school" }, { granteeType: "COACH" },
    { fromDate: later, toDate: now }, { fromDate: now },
    { toDate: new Date(NaN) }, { scope: {} },
    { scope: { ...input.scope, metrics: "true" } },
    { scope: { ...input.scope, all: true } },
    { status: "REVOKED" }, { revokedBy: "athlete" }, { revokedAt: now },
    { status: "EXPIRED", revokedBy: "athlete", revokedAt: now },
    { status: "REVOKED", revokedBy: "athlete", revokedAt: later },
    { status: "REVOKED", revokedBy: "athlete", revokedAt: new Date("2026-09-14") },
    { grantedAt: later }, { updatedAt: new Date("2026-09-14") }, { extra: true },
  ])("rejects invalid or broadened restored consent %j", (invalid) => {
    expect(() => historyAccessGrantSchema.parse({ ...active(), ...invalid })).toThrow(ZodError);
  });

  it("restores revoked or expired consent without losing the recipient, scope or period", () => {
    for (const state of [
      { status: "REVOKED", revokedBy: "athlete", revokedAt: later, updatedAt: later },
      { status: "EXPIRED", updatedAt: later },
    ]) expect(historyAccessGrantSchema.parse({ ...active(), ...state })).toMatchObject({ ...input, ...state });
  });

  it("accepts open and single-day periods without enabling denied categories", () => {
    for (const period of [
      { fromDate: null, toDate: null }, { fromDate: null, toDate: input.toDate },
      { fromDate: input.fromDate, toDate: null }, { fromDate: input.fromDate, toDate: input.fromDate },
    ]) expect(createHistoryAccessGrant({ ...input, ...period }, now)).toMatchObject({ ...period, scope: input.scope });
  });

  it("rejects injected lifecycle fields at creation", () => {
    expect(() => createHistoryAccessGrant({ ...input, status: "REVOKED" } as typeof input, now)).toThrow(ZodError);
    expect(() => createHistoryAccessGrant(input, new Date(NaN))).toThrow(ZodError);
  });

  it("copies dates and scope so later caller mutations cannot broaden consent", () => {
    const raw = structuredClone(input);
    const clock = new Date(now);
    const grant = createHistoryAccessGrant(raw, clock);
    raw.scope.coachComments = true;
    raw.fromDate.setUTCFullYear(1999);
    clock.setUTCFullYear(1999);
    expect(grant.scope.coachComments).toBe(false);
    expect(grant.fromDate).toEqual(input.fromDate);
    expect(grant.grantedAt).toEqual(now);
    expect(grant.createdAt).toEqual(now);
    expect(grant.updatedAt).toEqual(now);
  });
});
