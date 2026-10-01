/**
 * SAM-27 — the athlete acting on a prescription: comments, review requests,
 * absence reports and change requests, plus who counts as a participant.
 */
import { describe, expect, it, vi } from "vitest";
import { CommentWorkoutAssignment, ListWorkoutAssignmentComments } from "@/modules/school/application/comment-workout-assignment";
import { ReportWorkoutAbsence } from "@/modules/school/application/report-workout-absence";
import { RequestWorkoutChangeAsAthlete } from "@/modules/school/application/request-workout-change-as-athlete";
import { resolveWorkoutAssignmentParticipant } from "@/modules/school/application/workout-assignment-participant";

const earlier = new Date("2026-09-01T12:00:00Z");
const now = new Date("2026-09-10T12:00:00Z");
type Row = Record<string, unknown>;

function fixture(assignmentOverrides: Row = {}) {
  const assignment: Row = {
    id: "asg:1", workoutId: "w:1", workoutTemplateId: null, athleteId: "user:athlete", assignedBy: "user:coach",
    schoolId: "school:1", coachId: "coach:1", teamId: null, scheduledAt: now, dueAt: null, status: "SCHEDULED",
    matchStatus: null, matchedActivityId: null, matchedAt: null, matchScore: null, trainingLicenseId: null,
    createdAt: earlier, updatedAt: earlier, ...assignmentOverrides,
  };
  const comments: Row[] = [];
  const history: Row[] = [];
  const changeRequests: Row[] = [];
  const audits: Row[] = [];
  const db = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
    workoutAssignment: {
      findUnique: vi.fn(async () => ({ ...assignment })),
      update: vi.fn(async ({ data }: { data: Row }) => Object.assign(assignment, data)),
    },
    workoutAssignmentHistory: { create: vi.fn(async ({ data }: { data: Row }) => { history.push(data); return data; }) },
    workoutAssignmentComment: {
      findFirst: vi.fn(async () => comments.find((row) => row.kind === "REVIEW_REQUEST" && row.resolvedAt === null) ?? null),
      findMany: vi.fn(async () => comments.map((row) => ({ ...row, author: { id: row.authorUserId, name: "Alguém", image: null } }))),
      create: vi.fn(async ({ data }: { data: Row }) => { comments.push(data); return data; }),
    },
    workoutExecution: { findFirst: vi.fn(async () => null as Row | null) },
    workoutChangeRequest: {
      findFirst: vi.fn(async () => null as Row | null),
      create: vi.fn(async ({ data }: { data: Row }) => { changeRequests.push(data); return data; }),
    },
    coachProfile: { findUnique: vi.fn(async ({ where }: { where: { userId: string } }) => where.userId === "user:coach" ? { id: "coach:1" } : null) },
    schoolMembership: { findFirst: vi.fn(async ({ where }: { where: { userId: string } }) =>
      where.userId === "user:owner" ? { id: "m:owner", schoolId: "school:1", userId: "user:owner", status: "ACTIVE", startedAt: earlier, endedAt: null, createdAt: earlier, updatedAt: earlier } : null) },
    schoolMembershipRole: { findMany: vi.fn(async () => [{ id: "r:1", membershipId: "m:owner", role: "OWNER", createdAt: earlier }]) },
    schoolAuditLog: { create: vi.fn(async ({ data }: { data: Row }) => { audits.push(data); return data; }) },
  };
  const clock = () => now;
  return {
    db, assignment, comments, history, changeRequests, audits,
    comment: new CommentWorkoutAssignment(db as never, clock),
    list: new ListWorkoutAssignmentComments(db as never),
    absence: new ReportWorkoutAbsence(db as never, clock),
    change: new RequestWorkoutChangeAsAthlete(db as never, clock),
  };
}

describe("resolveWorkoutAssignmentParticipant [SAM-27]", () => {
  it("recognises the athlete, the owning coach and a school manager; hides the prescription from anyone else", async () => {
    const { db } = fixture();
    await expect(resolveWorkoutAssignmentParticipant(db as never, "user:athlete", "asg:1")).resolves.toMatchObject({ role: "athlete" });
    await expect(resolveWorkoutAssignmentParticipant(db as never, "user:coach", "asg:1")).resolves.toMatchObject({ role: "coach" });
    await expect(resolveWorkoutAssignmentParticipant(db as never, "user:owner", "asg:1")).resolves.toMatchObject({ role: "manager" });
    await expect(resolveWorkoutAssignmentParticipant(db as never, "user:stranger", "asg:1")).rejects.toMatchObject({ code: "WORKOUT_ASSIGNMENT_NOT_FOUND", status: 404 });
    await expect(resolveWorkoutAssignmentParticipant(db as never, null, "asg:1")).rejects.toMatchObject({ status: 401 });
  });
});

describe("CommentWorkoutAssignment [SAM-27]", () => {
  it("appends a comment from the athlete and audits it in the school", async () => {
    const { comment, comments, audits } = fixture();
    const saved = await comment.execute("user:athlete", "asg:1", { body: "  Consegui fazer só metade.  " });
    expect(saved).toMatchObject({ kind: "COMMENT", body: "Consegui fazer só metade.", authorUserId: "user:athlete", resolvedAt: null, createdAt: now });
    expect(comments).toHaveLength(1);
    expect(audits[0]).toMatchObject({ schoolId: "school:1", action: "workout.commented", entityType: "WorkoutAssignmentComment", metadata: { role: "athlete" } });
  });

  it("lets the coach answer in the same thread and lists it oldest first", async () => {
    const { comment, list, comments } = fixture();
    await comment.execute("user:athlete", "asg:1", { body: "Pergunta" });
    await comment.execute("user:coach", "asg:1", { body: "Resposta" });
    expect(comments.map((row) => row.authorUserId)).toEqual(["user:athlete", "user:coach"]);
    const items = await list.execute("user:owner", "asg:1");
    expect(items.map((item) => item.body)).toEqual(["Pergunta", "Resposta"]);
  });

  it("rejects an empty body and a stranger", async () => {
    const { comment } = fixture();
    await expect(comment.execute("user:athlete", "asg:1", { body: "   " })).rejects.toThrow();
    await expect(comment.execute("user:stranger", "asg:1", { body: "oi" })).rejects.toMatchObject({ status: 404 });
  });

  it("review request: only the athlete, only with a matched execution, only one open at a time", async () => {
    const { comment, db, audits } = fixture();
    await expect(comment.execute("user:athlete", "asg:1", { body: "Revisa?", kind: "REVIEW_REQUEST" }))
      .rejects.toMatchObject({ code: "WORKOUT_REVIEW_NO_EXECUTION", status: 409 });

    db.workoutExecution.findFirst.mockResolvedValue({ id: "exec:1" });
    await expect(comment.execute("user:coach", "asg:1", { body: "Revisa?", kind: "REVIEW_REQUEST" }))
      .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    const saved = await comment.execute("user:athlete", "asg:1", { body: "Revisa?", kind: "REVIEW_REQUEST" });
    expect(saved).toMatchObject({ kind: "REVIEW_REQUEST", resolvedAt: null, resolvedBy: null });
    expect(audits.at(-1)).toMatchObject({ action: "workout.review_requested" });

    await expect(comment.execute("user:athlete", "asg:1", { body: "De novo", kind: "REVIEW_REQUEST" }))
      .rejects.toMatchObject({ code: "WORKOUT_REVIEW_ALREADY_REQUESTED", status: 409 });
  });

  it("skips the school audit for an independent prescription", async () => {
    const { comment, audits } = fixture({ schoolId: null });
    await comment.execute("user:athlete", "asg:1", { body: "oi" });
    expect(audits).toHaveLength(0);
  });
});

describe("ReportWorkoutAbsence [SAM-27]", () => {
  it("with a reason the prescription becomes JUSTIFIED and the history keeps the reason", async () => {
    const { absence, history, audits } = fixture();
    const result = await absence.execute("user:athlete", "asg:1", { reason: "Viagem de trabalho" });
    expect(result).toMatchObject({ status: "JUSTIFIED", updatedAt: now });
    expect(history[0]).toMatchObject({ workoutAssignmentId: "asg:1", eventType: "JUSTIFIED", actorUserId: "user:athlete", payload: { previousStatus: "SCHEDULED", reason: "Viagem de trabalho" } });
    expect(audits[0]).toMatchObject({ action: "workout.absence_reported", metadata: { status: "JUSTIFIED", justified: true } });
  });

  it("without a reason it becomes MISSED; an empty body is the same as no reason", async () => {
    const { absence } = fixture();
    await expect(absence.execute("user:athlete", "asg:1", {})).resolves.toMatchObject({ status: "MISSED" });
    const second = fixture({ status: "AVAILABLE" });
    await expect(second.absence.execute("user:athlete", "asg:1", { reason: null })).resolves.toMatchObject({ status: "MISSED" });
  });

  it("a MISSED prescription can still be justified afterwards", async () => {
    const { absence } = fixture({ status: "MISSED" });
    await expect(absence.execute("user:athlete", "asg:1", { reason: "Lesão" })).resolves.toMatchObject({ status: "JUSTIFIED" });
  });

  it("refuses the coach, a stranger, and a prescription already done or closed", async () => {
    const { absence, db } = fixture();
    await expect(absence.execute("user:coach", "asg:1", { reason: "x" })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(absence.execute("user:stranger", "asg:1", {})).rejects.toMatchObject({ status: 404 });
    expect(db.workoutAssignment.update).not.toHaveBeenCalled();

    for (const status of ["COMPLETED", "PARTIALLY_COMPLETED", "CANCELLED", "JUSTIFIED"]) {
      const closed = fixture({ status });
      await expect(closed.absence.execute("user:athlete", "asg:1", {})).rejects.toMatchObject({ code: "WORKOUT_ABSENCE_NOT_APPLICABLE", status: 409 });
    }
  });
});

describe("RequestWorkoutChangeAsAthlete [SAM-27]", () => {
  it("opens a PENDING change request addressed to the responsible coach, signed by the athlete", async () => {
    const { change, changeRequests, audits } = fixture();
    const saved = await change.execute("user:athlete", "asg:1", { reason: "Distância acima do que consigo." });
    expect(saved).toMatchObject({ schoolId: "school:1", workoutAssignmentId: "asg:1", coachId: "coach:1", requestedBy: "user:athlete", status: "PENDING", resolvedAt: null, createdAt: now });
    expect(changeRequests).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: "workout_change_request.requested", entityType: "WorkoutChangeRequest", metadata: { requestedByRole: "athlete" } });
  });

  it("refuses a second open request, a prescription without coach or school, and anyone but the athlete", async () => {
    const open = fixture();
    open.db.workoutChangeRequest.findFirst.mockResolvedValue({ id: "cr:1" });
    await expect(open.change.execute("user:athlete", "asg:1", { reason: "x" })).rejects.toMatchObject({ code: "WORKOUT_CHANGE_REQUEST_ALREADY_OPEN", status: 409 });

    const noCoach = fixture({ coachId: null });
    await expect(noCoach.change.execute("user:athlete", "asg:1", { reason: "x" })).rejects.toMatchObject({ code: "WORKOUT_CHANGE_REQUEST_NO_COACH", status: 409 });

    const noSchool = fixture({ schoolId: null });
    await expect(noSchool.change.execute("user:athlete", "asg:1", { reason: "x" })).rejects.toMatchObject({ code: "WORKOUT_CHANGE_REQUEST_NO_SCHOOL", status: 409 });

    const { change, db } = fixture();
    await expect(change.execute("user:coach", "asg:1", { reason: "x" })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(change.execute("user:owner", "asg:1", { reason: "x" })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(db.workoutChangeRequest.create).not.toHaveBeenCalled();
  });
});
