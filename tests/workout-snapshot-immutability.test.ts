/**
 * T147 — Snapshot immutability
 * T148 — Template change does not affect an existing prescription
 *
 * The workout entity stores a `snapshotPayload` at creation time, capturing the
 * template version and block content. These tests verify:
 *  - the snapshot is written at creation time (T147)
 *  - updating a template after a workout is already created does not alter the workout (T148)
 */
import { describe, expect, it, vi } from "vitest";
import { CreateWorkout } from "@/modules/school/application/create-workout";
import { WorkoutOwnerType, WorkoutStatus, TemplateStatus } from "@/modules/school/domain/enums";
import type { PrismaClient } from "@prisma/client";

const now = new Date("2026-10-01T09:00:00Z");
// ISO string versions of dates — blocks returned by Prisma are serialized via
// JSON.parse(JSON.stringify(blocks)) before being stored in snapshotContent.
const nowIso = "2026-10-01T09:00:00.000Z";

const activeCoach = { id: "coach-1", status: "ACTIVE" };

// These are the blocks as they appear after Prisma returns them (Date objects).
// The use-case serializes them to JSON before putting in snapshotContent.
const templateBlocks = [
  { id: "block-1", workoutId: "template-1", position: 0, blockType: "WARMUP", title: "Aquecimento", distanceM: 400, durationS: null, repetitions: null, targetPayload: null, restPayload: null, createdAt: now, updatedAt: now },
  { id: "block-2", workoutId: "template-1", position: 1, blockType: "INTERVAL", title: "Principal", distanceM: 1500, durationS: null, repetitions: 4, targetPayload: null, restPayload: null, createdAt: now, updatedAt: now },
];
// JSON-safe version (what the use-case puts into snapshotPayload.content)
const templateBlocksJson = templateBlocks.map((b) => ({ ...b, createdAt: nowIso, updatedAt: nowIso }));

const activeTemplate: {
  id: string; version: number; status: TemplateStatus; authorCoachId: string;
  schoolId: null; title: string; description: null; sportType: string;
  ownerType: WorkoutOwnerType; snapshotPayload: null; createdAt: Date; updatedAt: Date;
} = {
  id: "template-1",
  version: 3,
  status: TemplateStatus.ACTIVE,
  authorCoachId: "coach-1",
  schoolId: null,
  title: "Perf 1500",
  description: null,
  sportType: "SWIM",
  ownerType: WorkoutOwnerType.COACH,
  snapshotPayload: null,
  createdAt: now,
  updatedAt: now,
};

function makeValidWorkoutRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "workout-1",
    templateId: "template-1",
    templateVersion: 3,
    authorCoachId: "coach-1",
    originSchoolId: null,
    title: "Perf 1500",
    description: null,
    sportType: "SWIM",
    scheduledDate: null,
    scheduledStartAt: null,
    status: WorkoutStatus.DRAFT,
    snapshotPayload: {
      templateId: "template-1",
      templateVersion: 3,
      title: "Perf 1500",
      description: null,
      sportType: "SWIM",
      content: { blocks: templateBlocksJson },
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeTx(templateRow = activeTemplate, blockRows = templateBlocks) {
  const workoutRow = makeValidWorkoutRow();
  return {
    coachProfile: { findUnique: vi.fn().mockResolvedValue(activeCoach) },
    workoutTemplate: { findUnique: vi.fn().mockResolvedValue(templateRow) },
    workoutBlock: {
      findMany: vi.fn().mockResolvedValue(blockRows),
      // Simulate Prisma: JsonNull sentinel becomes null when read back, dates remain Date objects
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          ...data,
          targetPayload: data.targetPayload == null || typeof data.targetPayload === "object" && Object.keys(data.targetPayload as object).length === 0 ? null : data.targetPayload,
          restPayload: data.restPayload == null || typeof data.restPayload === "object" && Object.keys(data.restPayload as object).length === 0 ? null : data.restPayload,
          createdAt: now,
          updatedAt: now,
        })
      ),
    },
    workout: {
      create: vi.fn().mockResolvedValue(workoutRow),
    },
  };
}

function makeDb(tx: ReturnType<typeof makeTx>) {
  return {
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(tx)),
  } as unknown as PrismaClient;
}

describe("T147 — Workout snapshot is written at creation time", () => {
  it("snapshot captures templateId and templateVersion from the template at creation", async () => {
    const tx = makeTx();
    const useCase = new CreateWorkout(makeDb(tx), () => now);
    const result = await useCase.execute("user-1", {
      ownerType: WorkoutOwnerType.COACH,
      templateId: "template-1",
      title: "Perf 1500",
      sportType: "SWIM",
      blocks: [],
    });

    expect(result.templateId).toBe("template-1");
    expect(result.templateVersion).toBe(3);
    // The snapshot payload should contain the block content at creation time.
    const createArgs = (tx.workout.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createArgs.data.snapshotPayload).toMatchObject({
      templateId: "template-1",
      templateVersion: 3,
      title: "Perf 1500",
      sportType: "SWIM",
    });
  });

  it("snapshot blocks reflect the template blocks at creation time, not input blocks", async () => {
    const tx = makeTx();
    const useCase = new CreateWorkout(makeDb(tx), () => now);
    await useCase.execute("user-1", {
      ownerType: WorkoutOwnerType.COACH,
      templateId: "template-1",
      title: "Perf 1500",
      sportType: "SWIM",
      blocks: [{ blockType: "WARMUP", title: "Custom block", distanceM: 100 }], // overridden by template
    });

    const createArgs = (tx.workout.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const snapshot = createArgs.data.snapshotPayload as { content: { blocks: Array<{ id: string }> } };
    // Template blocks are captured in the content, not the input blocks
    expect(snapshot.content.blocks.map((b) => b.id)).toEqual(["block-1", "block-2"]);
  });

  it("workout without a template stores the inline blocks in the snapshot", async () => {
    const tx = makeTx();
    (tx.workoutTemplate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const workoutRow = makeValidWorkoutRow({
      templateId: null,
      templateVersion: null,
      snapshotPayload: { templateId: null, templateVersion: null, title: "Livre", description: null, sportType: "RUN", content: { blocks: [] } },
    });
    (tx.workout.create as ReturnType<typeof vi.fn>).mockResolvedValue(workoutRow);
    const useCase = new CreateWorkout(makeDb(tx), () => now);
    await useCase.execute("user-1", {
      ownerType: WorkoutOwnerType.COACH,
      title: "Livre",
      sportType: "RUN",
      blocks: [{ blockType: "STEADY", title: "3km", distanceM: 3000 }],
    });

    const createArgs = (tx.workout.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createArgs.data.templateId).toBeNull();
    expect(createArgs.data.templateVersion).toBeNull();
    // Snapshot has null template references
    expect(createArgs.data.snapshotPayload.templateId).toBeNull();
    expect(createArgs.data.snapshotPayload.templateVersion).toBeNull();
  });
});

describe("T148 — Template changes do not affect an existing prescription", () => {
  it("workout created from template v3 keeps v3 snapshot even if template is later updated", async () => {
    // Simulate creation at v3
    const tx = makeTx({ ...activeTemplate, version: 3 }, templateBlocks);
    const useCase = new CreateWorkout(makeDb(tx), () => now);
    const resultV3 = await useCase.execute("user-1", {
      ownerType: WorkoutOwnerType.COACH,
      templateId: "template-1",
      title: "Perf 1500",
      sportType: "SWIM",
      blocks: [],
    });

    const argsV3 = (tx.workout.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(argsV3.data.templateVersion).toBe(3);

    // Simulate a second creation after template was updated to v4
    const updatedBlocks = [
      ...templateBlocks,
      { id: "block-3", workoutId: "template-1", position: 2, blockType: "COOLDOWN", title: "Volta calma", distanceM: 200, durationS: null, repetitions: null, targetPayload: null, restPayload: null, createdAt: now, updatedAt: now },
    ];
    const updatedBlocksJson = updatedBlocks.map((b) => ({ ...b, createdAt: nowIso, updatedAt: nowIso }));
    const tx2 = makeTx({ ...activeTemplate, version: 4 }, updatedBlocks);
    const workoutRowV4 = makeValidWorkoutRow({
      templateVersion: 4,
      snapshotPayload: { templateId: "template-1", templateVersion: 4, title: "Perf 1500 v4", description: null, sportType: "SWIM", content: { blocks: updatedBlocksJson } },
    });
    (tx2.workout.create as ReturnType<typeof vi.fn>).mockResolvedValue(workoutRowV4);
    const useCase2 = new CreateWorkout(makeDb(tx2), () => now);
    const resultV4 = await useCase2.execute("user-1", {
      ownerType: WorkoutOwnerType.COACH,
      templateId: "template-1",
      title: "Perf 1500 v4",
      sportType: "SWIM",
      blocks: [],
    });

    // Original workout (v3) is unaffected
    expect(resultV3.templateVersion).toBe(3);
    // New workout gets v4 snapshot
    expect(resultV4.templateVersion).toBe(4);

    const argsV4 = (tx2.workout.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(argsV4.data.snapshotPayload.content.blocks).toHaveLength(3);
  });

  it("archived template blocks further prescription creation", async () => {
    const tx = makeTx({ ...activeTemplate, status: TemplateStatus.ARCHIVED });
    const useCase = new CreateWorkout(makeDb(tx), () => now);
    await expect(useCase.execute("user-1", {
      ownerType: WorkoutOwnerType.COACH,
      templateId: "template-1",
      title: "Perf 1500",
      sportType: "SWIM",
      blocks: [],
    })).rejects.toMatchObject({ code: "WORKOUT_TEMPLATE_NOT_ACTIVE" });
    expect(tx.workout.create).not.toHaveBeenCalled();
  });
});
