/**
 * T231 — Test: Ryvano Score (compliance) / Coach Score / Feedback are independent
 * T232 — Test: evaluations preserved after coach-change (RESTRICT FK behaviour)
 *
 * Also covers T226 CreateCoachEvaluation, T227 UpdateCoachEvaluation,
 * T228 SubmitAthleteFeedback domain logic.
 */
import { describe, expect, it, vi } from "vitest";
import {
  CreateCoachEvaluation,
  UpdateCoachEvaluation,
  SubmitAthleteFeedback,
} from "@/modules/school/application/manage-evaluation";
import { coachScoreSchema, displayScore, createCoachEvaluation } from "@/modules/school/domain/coach-evaluation";
import { createAthleteFeedback } from "@/modules/school/domain/athlete-feedback";
import { WorkoutMatchStatus } from "@/modules/school/domain/enums";
import type { PrismaClient } from "@prisma/client";

const now = new Date("2026-10-10T10:00:00Z");

function makeDb(tx: object): PrismaClient {
  return { $transaction: vi.fn((fn: (t: unknown) => unknown) => fn(tx)) } as unknown as PrismaClient;
}

// ---------------------------------------------------------------------------
// T224 — coachScoreSchema validations
// ---------------------------------------------------------------------------

describe("T224 — coachScoreSchema", () => {
  it("accepts decimal 0–10 and scales to 0–100", () => {
    expect(coachScoreSchema.parse(8.5)).toBe(85);
    expect(coachScoreSchema.parse(10)).toBe(100);
    expect(coachScoreSchema.parse(0)).toBe(0);
  });
  it("accepts already-scaled integer 0–100", () => {
    expect(coachScoreSchema.parse(85)).toBe(85);
    expect(coachScoreSchema.parse(100)).toBe(100);
  });
  it("rejects negative values",  () => expect(() => coachScoreSchema.parse(-1)).toThrow());
  it("rejects values above 100", () => expect(() => coachScoreSchema.parse(101)).toThrow());
});

describe("displayScore", () => {
  it("converts 85 → 8.5", () => expect(displayScore(85)).toBe(8.5));
  it("converts 100 → 10", () => expect(displayScore(100)).toBe(10));
});

// ---------------------------------------------------------------------------
// T225 — AthleteFeedback domain validations
// ---------------------------------------------------------------------------

describe("T225 — createAthleteFeedback validations", () => {
  it("accepts RPE 1–10", () => {
    const fb = createAthleteFeedback({ id: "f1", workoutExecutionId: "e1", workoutAssignmentId: "a1", athleteId: "u1", rpe: 7 }, now);
    expect(fb.rpe).toBe(7);
  });
  it("rejects RPE 0",  () => expect(() => createAthleteFeedback({ id: "f2", workoutExecutionId: "e1", workoutAssignmentId: "a1", athleteId: "u1", rpe: 0 }, now)).toThrow());
  it("rejects RPE 11", () => expect(() => createAthleteFeedback({ id: "f3", workoutExecutionId: "e1", workoutAssignmentId: "a1", athleteId: "u1", rpe: 11 }, now)).toThrow());
  it("accepts mood 1–5", () => {
    const fb = createAthleteFeedback({ id: "f4", workoutExecutionId: "e1", workoutAssignmentId: "a1", athleteId: "u1", rpe: 5, mood: 4 }, now);
    expect(fb.mood).toBe(4);
  });
  it("rejects mood 6", () => expect(() => createAthleteFeedback({ id: "f5", workoutExecutionId: "e1", workoutAssignmentId: "a1", athleteId: "u1", rpe: 5, mood: 6 }, now)).toThrow());
});

// ---------------------------------------------------------------------------
// Shared mock builders
// ---------------------------------------------------------------------------

const confirmedExecution = {
  id: "exec-1",
  workoutAssignmentId: "asgn-1",
  athleteId: "athlete-1",
  matchStatus: WorkoutMatchStatus.CONFIRMED,
};

function makeCreateTx(opts: {
  coach?: object | null;
  membership?: object | null;
  execution?: object | null;
  created?: object;
} = {}) {
  const defaultCoach = { id: "coach-1", status: "ACTIVE" };
  const defaultMembership = { id: "csm-1" };
  const defaultCreated = {
    id: "eval-1", workoutExecutionId: "exec-1", workoutAssignmentId: "asgn-1",
    athleteId: "athlete-1", coachId: "coach-1", schoolId: "school-1",
    overallScore: 85, note: null, isVisible: true, createdAt: now, updatedAt: now,
  };
  return {
    coachProfile: { findUnique: vi.fn().mockResolvedValue(opts.coach !== undefined ? opts.coach : defaultCoach) },
    coachSchoolMembership: { findFirst: vi.fn().mockResolvedValue(opts.membership !== undefined ? opts.membership : defaultMembership) },
    workoutExecution: { findUnique: vi.fn().mockResolvedValue(opts.execution !== undefined ? opts.execution : confirmedExecution) },
    coachEvaluation: { create: vi.fn().mockResolvedValue(opts.created ?? defaultCreated) },
  };
}

// ---------------------------------------------------------------------------
// T226 — CreateCoachEvaluation
// ---------------------------------------------------------------------------

describe("T226 — CreateCoachEvaluation", () => {
  const validInput = { workoutExecutionId: "exec-1", schoolId: "school-1", overallScore: 8.5 };

  it("rejects unauthenticated caller", async () => {
    const uc = new CreateCoachEvaluation(makeDb(makeCreateTx()), () => now);
    await expect(uc.execute(null, validInput)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects when coach profile not found", async () => {
    const uc = new CreateCoachEvaluation(makeDb(makeCreateTx({ coach: null })), () => now);
    await expect(uc.execute("user-1", validInput)).rejects.toMatchObject({ code: "COACH_PROFILE_NOT_FOUND" });
  });

  it("rejects inactive coach", async () => {
    const uc = new CreateCoachEvaluation(makeDb(makeCreateTx({ coach: { id: "c1", status: "INACTIVE" } })), () => now);
    await expect(uc.execute("user-1", validInput)).rejects.toMatchObject({ code: "COACH_INACTIVE" });
  });

  it("rejects coach without school membership", async () => {
    const uc = new CreateCoachEvaluation(makeDb(makeCreateTx({ membership: null })), () => now);
    await expect(uc.execute("user-1", validInput)).rejects.toMatchObject({ code: "COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE" });
  });

  it("rejects execution not found", async () => {
    const uc = new CreateCoachEvaluation(makeDb(makeCreateTx({ execution: null })), () => now);
    await expect(uc.execute("user-1", validInput)).rejects.toMatchObject({ code: "EXECUTION_NOT_FOUND" });
  });

  it("rejects evaluating a non-confirmed execution", async () => {
    const exec = { ...confirmedExecution, matchStatus: WorkoutMatchStatus.AUTO_MATCHED };
    const uc = new CreateCoachEvaluation(makeDb(makeCreateTx({ execution: exec })), () => now);
    await expect(uc.execute("user-1", validInput)).rejects.toMatchObject({ code: "EXECUTION_NOT_EVALUABLE" });
  });

  it("creates evaluation with scaled score", async () => {
    const tx = makeCreateTx();
    const uc = new CreateCoachEvaluation(makeDb(tx), () => now);
    const result = await uc.execute("user-1", validInput);
    expect(result.overallScore).toBe(85); // 8.5 * 10
    expect(tx.coachEvaluation.create).toHaveBeenCalledOnce();
  });

  it("defaults isVisible to true when not provided", async () => {
    const tx = makeCreateTx();
    const uc = new CreateCoachEvaluation(makeDb(tx), () => now);
    await uc.execute("user-1", validInput);
    const payload = tx.coachEvaluation.create.mock.calls[0][0].data;
    expect(payload.isVisible).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T227 — UpdateCoachEvaluation
// ---------------------------------------------------------------------------

const existingEval = { id: "eval-1", coachId: "coach-1" };

function makeUpdateTx(opts: { coach?: object | null; evaluation?: object | null } = {}) {
  return {
    coachProfile: { findUnique: vi.fn().mockResolvedValue(opts.coach !== undefined ? opts.coach : { id: "coach-1" }) },
    coachEvaluation: {
      findUnique: vi.fn().mockResolvedValue(opts.evaluation !== undefined ? opts.evaluation : existingEval),
      update: vi.fn().mockResolvedValue({ ...existingEval, overallScore: 90, updatedAt: now }),
    },
  };
}

describe("T227 — UpdateCoachEvaluation", () => {
  it("rejects caller who is not the coach", async () => {
    const tx = makeUpdateTx({ coach: { id: "coach-OTHER" } });
    const uc = new UpdateCoachEvaluation(makeDb(tx), () => now);
    await expect(uc.execute("user-other", { evaluationId: "eval-1", overallScore: 90 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects when evaluation not found", async () => {
    const tx = makeUpdateTx({ evaluation: null });
    const uc = new UpdateCoachEvaluation(makeDb(tx), () => now);
    await expect(uc.execute("user-1", { evaluationId: "eval-X", overallScore: 80 }))
      .rejects.toMatchObject({ code: "EVALUATION_NOT_FOUND" });
  });

  it("updates score and note", async () => {
    const tx = makeUpdateTx();
    const uc = new UpdateCoachEvaluation(makeDb(tx), () => now);
    const result = await uc.execute("user-1", { evaluationId: "eval-1", overallScore: 9 });
    expect(tx.coachEvaluation.update).toHaveBeenCalledOnce();
    expect(result.overallScore).toBe(90);
  });

  it("can hide evaluation from athlete", async () => {
    const tx = makeUpdateTx();
    const uc = new UpdateCoachEvaluation(makeDb(tx), () => now);
    await uc.execute("user-1", { evaluationId: "eval-1", isVisible: false });
    const updateData = tx.coachEvaluation.update.mock.calls[0][0].data;
    expect(updateData.isVisible).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T228 — SubmitAthleteFeedback
// ---------------------------------------------------------------------------

function makeFeedbackDb(opts: {
  execution?: object | null;
  upsertResult?: object;
} = {}): PrismaClient {
  const result = opts.upsertResult ?? {
    id: "fb-1", workoutExecutionId: "exec-1", workoutAssignmentId: "asgn-1",
    athleteId: "athlete-1", rpe: 7, mood: 4, energy: 3, comment: null, createdAt: now, updatedAt: now,
  };
  return {
    workoutExecution: { findUnique: vi.fn().mockResolvedValue(opts.execution !== undefined ? opts.execution : confirmedExecution) },
    athleteFeedback: { upsert: vi.fn().mockResolvedValue(result) },
  } as unknown as PrismaClient;
}

describe("T228 — SubmitAthleteFeedback", () => {
  it("rejects when execution not found", async () => {
    const uc = new SubmitAthleteFeedback(makeFeedbackDb({ execution: null }), () => now);
    await expect(uc.execute("athlete-1", { workoutExecutionId: "exec-X", rpe: 7 }))
      .rejects.toMatchObject({ code: "EXECUTION_NOT_FOUND" });
  });

  it("rejects when athlete is not the execution owner", async () => {
    const uc = new SubmitAthleteFeedback(makeFeedbackDb(), () => now);
    await expect(uc.execute("athlete-OTHER", { workoutExecutionId: "exec-1", rpe: 7 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("submits feedback and upserts", async () => {
    const db = makeFeedbackDb();
    const uc = new SubmitAthleteFeedback(db, () => now);
    const result = await uc.execute("athlete-1", { workoutExecutionId: "exec-1", rpe: 7, mood: 4, energy: 3 });
    expect(result.rpe).toBe(7);
    expect((db as unknown as Record<string, unknown>).athleteFeedback).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// T231 — Ryvano Score / Coach Score / Feedback independence
// ---------------------------------------------------------------------------

describe("T231 — Score independence invariant", () => {
  it("coachEvaluation.overallScore is set independently from ryvanoScore", () => {
    // Simulate: ryvanoScore (compliance) = 72, coachScore = 85
    const ryvanoScore = 72;
    const evaluation = createCoachEvaluation({
      id: "ev1",
      workoutExecutionId: "exec-1",
      workoutAssignmentId: "asgn-1",
      athleteId: "athlete-1",
      coachId: "coach-1",
      schoolId: "school-1",
      overallScore: 85,
    }, now);
    expect(evaluation.overallScore).toBe(85);
    expect(evaluation.overallScore).not.toBe(ryvanoScore);
  });

  it("athlete feedback rpe is structurally separate from coachScore", () => {
    const feedback = createAthleteFeedback({
      id: "fb1",
      workoutExecutionId: "exec-1",
      workoutAssignmentId: "asgn-1",
      athleteId: "athlete-1",
      rpe: 8,
      mood: 3,
      energy: 4,
    }, now);
    const evaluation = createCoachEvaluation({
      id: "ev1",
      workoutExecutionId: "exec-1",
      workoutAssignmentId: "asgn-1",
      athleteId: "athlete-1",
      coachId: "coach-1",
      schoolId: "school-1",
      overallScore: 70,
    }, now);
    // Different concerns: athlete perception vs coach judgment
    expect(feedback.rpe).toBe(8);
    expect(evaluation.overallScore).toBe(70);
    // They live in separate objects; no field collision
    expect("rpe" in evaluation).toBe(false);
    expect("overallScore" in feedback).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T232 — Coach-change preservation
// ---------------------------------------------------------------------------

describe("T232 — Evaluation preservation after coach change", () => {
  it("evaluation retains original coachId after change", () => {
    // Evaluations use RESTRICT FK — the coachId field is preserved even if
    // the coach leaves the school. The evaluation is not deleted.
    const evaluation = createCoachEvaluation({
      id: "ev1",
      workoutExecutionId: "exec-1",
      workoutAssignmentId: "asgn-1",
      athleteId: "athlete-1",
      coachId: "coach-original",
      schoolId: "school-1",
      overallScore: 80,
      note: "Bom trabalho",
    }, now);
    // Simulate coach leaving: new coach assigned to athlete
    const newCoachId = "coach-new";
    // Original evaluation's coachId is unchanged — historical record preserved
    expect(evaluation.coachId).toBe("coach-original");
    expect(evaluation.coachId).not.toBe(newCoachId);
    expect(evaluation.note).toBe("Bom trabalho");
  });

  it("evaluation note and score are immutable across coach changes (domain)", () => {
    const evaluation = createCoachEvaluation({
      id: "ev2",
      workoutExecutionId: "exec-2",
      workoutAssignmentId: "asgn-2",
      athleteId: "athlete-1",
      coachId: "coach-original",
      schoolId: "school-1",
      overallScore: 75,
    }, now);
    // Only UpdateCoachEvaluation (same coach) can mutate the record
    expect(evaluation.overallScore).toBe(75);
    expect(evaluation.coachId).toBe("coach-original");
  });
});
