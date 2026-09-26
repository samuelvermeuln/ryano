import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { AssignmentStatus } from "@/modules/school/domain/enums";
import { coachAthleteAssignmentSchema, createCoachAthleteAssignment, transitionCoachAthleteAssignment } from "@/modules/school/domain/coach-athlete-assignment";

const requestedAt = new Date("2026-09-11T10:00:00Z");
const assignedAt = new Date("2026-09-11T11:00:00Z");
const endedAt = new Date("2026-09-11T12:00:00Z");
const input = { id: "assignment-opaque", athleteId: "athlete-opaque", coachId: "coach-opaque", schoolId: "school-opaque", isPrimary: true, sportType: null };
const pending = () => createCoachAthleteAssignment(input, requestedAt);
const active = () => transitionCoachAthleteAssignment(pending(), AssignmentStatus.ACTIVE, assignedAt, "admin-opaque");

describe("CoachAthleteAssignment entity [T061]", () => {
  it("creates an inert pending period without granting an assignment", () => {
    expect(pending()).toEqual({ ...input, reason: null, status: "PENDING", startedAt: null, endedAt: null, assignedBy: null, endedBy: null, createdAt: requestedAt, updatedAt: requestedAt });
  });

  it.each(["id", "athleteId", "coachId"])('rejects blank or padded %s', (field) => {
    for (const value of ["", " ", " padded "]) expect(() => createCoachAthleteAssignment({ ...input, [field]: value }, requestedAt)).toThrow(ZodError);
  });

  it("copies dates and keeps private-coach assignments valid", () => {
    const now = new Date(requestedAt);
    const assignment = createCoachAthleteAssignment({ ...input, schoolId: null, isPrimary: false, sportType: "RUNNING" }, now);
    now.setUTCFullYear(2000);
    expect(assignment.createdAt).toEqual(requestedAt);
    expect(assignment.createdAt).not.toBe(now);
    const restored = coachAthleteAssignmentSchema.parse(active());
    expect(restored.startedAt).toEqual(assignedAt);
    expect(restored.startedAt).not.toBe(active().startedAt);
  });

  it("allows actorless assignments restored from a nullable persisted audit field", () => {
    expect(coachAthleteAssignmentSchema.parse({ ...active(), assignedBy: null })).toMatchObject({ status: "ACTIVE", assignedBy: null });
  });

  it("allows only temporal transitions and preserves the prior period", () => {
    const request = pending();
    const assigned = transitionCoachAthleteAssignment(request, AssignmentStatus.ACTIVE, assignedAt, "admin-opaque");
    const ended = transitionCoachAthleteAssignment(assigned, AssignmentStatus.ENDED, endedAt, "admin-opaque");
    expect(request).toEqual(pending());
    expect(assigned).toMatchObject({ status: "ACTIVE", startedAt: assignedAt, endedAt: null, assignedBy: "admin-opaque", endedBy: null });
    expect(ended).toMatchObject({ status: "ENDED", startedAt: assignedAt, endedAt, assignedBy: "admin-opaque", endedBy: "admin-opaque" });
    expect(() => transitionCoachAthleteAssignment(ended, AssignmentStatus.ACTIVE, endedAt, "admin-opaque")).toThrow(expect.objectContaining({ code: "COACH_ATHLETE_ASSIGNMENT_INVALID_TRANSITION" }));
  });

  it("rejects inconsistent restored periods and invalid transitions", () => {
    expect(() => coachAthleteAssignmentSchema.parse({ ...pending(), status: "ACTIVE", startedAt: assignedAt })).toThrow(ZodError);
    expect(() => coachAthleteAssignmentSchema.parse({ ...active(), endedAt })).toThrow(ZodError);
    expect(() => transitionCoachAthleteAssignment(pending(), AssignmentStatus.ENDED, assignedAt, "admin-opaque")).toThrow();
    expect(() => transitionCoachAthleteAssignment(active(), AssignmentStatus.REJECTED, endedAt, "admin-opaque")).toThrow();
    expect(() => transitionCoachAthleteAssignment(active(), AssignmentStatus.ENDED, requestedAt, "admin-opaque")).toThrow(ZodError);
  });
});
