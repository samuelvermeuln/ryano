import type { Prisma, PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { TemplateStatus, WorkoutBlockType, WorkoutOwnerType, WorkoutStatus } from "@/modules/school/domain/enums";
import { createWorkoutBlock } from "@/modules/school/domain/workout-block";
import { createWorkoutTemplate } from "@/modules/school/domain/workout-template";
import { createWorkout, createWorkoutSnapshot } from "@/modules/school/domain/workout";
import { WorkoutRepository } from "@/modules/school/infrastructure/workout-repository";
import { WorkoutTemplateRepository } from "@/modules/school/infrastructure/workout-template-repository";

const now = new Date("2026-09-16T10:00:00Z");
const template = () => createWorkoutTemplate({
  id: "template-1", ownerType: WorkoutOwnerType.COACH, ownerId: "coach-1", authorCoachId: "coach-1", schoolId: null,
  title: "Threshold", description: null, sportType: "RUN", version: 1,
}, now);
const snapshot = () => ({ templateId: "template-1", templateVersion: 1, title: "Threshold", description: null, sportType: "RUN", content: { blocks: [{ target: { pace: 300 } }] } });
const workout = () => createWorkout({
  id: "workout-1", templateId: "template-1", templateVersion: 1, authorCoachId: "coach-1", originSchoolId: "school-1",
  title: "Threshold", description: null, sportType: "RUN", scheduledDate: null, scheduledStartAt: null, snapshotPayload: snapshot(),
}, now);

it("creates valid template, workout and block entities [T124-T126]", () => {
  expect(template().status).toBe(TemplateStatus.DRAFT);
  expect(workout().status).toBe(WorkoutStatus.DRAFT);
  expect(createWorkoutBlock({ id: "block-1", workoutId: "workout-1", position: 0, blockType: WorkoutBlockType.INTERVAL, title: null, distanceM: 400, durationS: null, repetitions: 10, targetPayload: { pace: 300 }, restPayload: { durationS: 20 } }, now)).toMatchObject({ position: 0, repetitions: 10 });
  expect(() => createWorkoutTemplate({ ...template(), ownerType: WorkoutOwnerType.COACH, ownerId: "other", authorCoachId: "coach-1" }, now)).toThrow();
  expect(() => createWorkout({ ...workout(), templateVersion: null }, now)).toThrow();
});

it("creates a detached, deeply immutable workout snapshot [T127, T147]", () => {
  const raw = snapshot();
  const stored = createWorkoutSnapshot(raw);
  raw.content.blocks[0].target.pace = 99;
  expect(stored.content).toEqual({ blocks: [{ target: { pace: 300 } }] });
  expect(Object.isFrozen(stored)).toBe(true);
  expect(Object.isFrozen(stored.content)).toBe(true);
  expect(() => { (stored.content as { blocks: unknown[] }).blocks = []; }).toThrow();
  expect(Object.isFrozen(workout().snapshotPayload)).toBe(true);
});

describe("workout repositories [T128-T129]", () => {
  it("accepts a transaction client", () => {
    const tx = {} as Prisma.TransactionClient;
    expect(new WorkoutTemplateRepository(tx)).toBeInstanceOf(WorkoutTemplateRepository);
    expect(new WorkoutRepository(tx)).toBeInstanceOf(WorkoutRepository);
  });

  it("persists validated templates and pages reusable owner entries", async () => {
    const db = { workoutTemplate: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() } };
    const repo = new WorkoutTemplateRepository(db as unknown as Pick<PrismaClient, "workoutTemplate">);
    db.workoutTemplate.create.mockResolvedValue(template());
    await expect(repo.create(template())).resolves.toEqual(template());
    await expect(repo.create({ ...template(), version: 0 })).rejects.toThrow();
    db.workoutTemplate.findMany.mockResolvedValue([template(), { ...template(), id: "template-2" }]);
    const result = await repo.listActiveByOwner(WorkoutOwnerType.COACH, "coach-1", { limit: 1 });
    expect(result.items).toEqual([template()]);
    expect(db.workoutTemplate.findMany).toHaveBeenCalledWith({ where: { ownerType: WorkoutOwnerType.COACH, ownerId: "coach-1", status: TemplateStatus.ACTIVE }, orderBy: { id: "asc" }, take: 2 });
  });

  it("persists prescriptions, their blocks, and lists historical rows deterministically", async () => {
    const db = { workout: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() }, workoutBlock: { create: vi.fn(), findMany: vi.fn() } };
    const repo = new WorkoutRepository(db as unknown as Pick<PrismaClient, "workout" | "workoutBlock">);
    db.workout.create.mockResolvedValue(workout());
    await expect(repo.create(workout())).resolves.toEqual(workout());
    db.workout.findMany.mockResolvedValue([workout()]);
    await expect(repo.listByTemplate("template-1")).resolves.toEqual({ items: [workout()], nextCursor: null });
    expect(db.workout.findMany).toHaveBeenCalledWith({ where: { templateId: "template-1" }, orderBy: { id: "asc" }, take: 21 });
    const block = createWorkoutBlock({ id: "block-1", workoutId: "workout-1", position: 0, blockType: WorkoutBlockType.WARMUP, title: null, distanceM: 400, durationS: null, repetitions: null, targetPayload: null, restPayload: null }, now);
    db.workoutBlock.create.mockResolvedValue(block);
    await expect(repo.createBlock(block)).resolves.toEqual(block);
    db.workoutBlock.findMany.mockResolvedValue([block]);
    await expect(repo.listBlocks("workout-1")).resolves.toEqual([block]);
    expect(db.workoutBlock.findMany).toHaveBeenCalledWith({ where: { workoutId: "workout-1" }, orderBy: { position: "asc" } });
  });
});
