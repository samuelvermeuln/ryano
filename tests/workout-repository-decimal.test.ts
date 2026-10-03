/**
 * SAM-48 — `WorkoutBlock.distanceM` comes back from Prisma as a `Decimal`.
 * Parsing that row with the domain schema threw inside the prescription
 * transaction, so every prescription with a distance was rolled back.
 */
import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

import { createWorkoutBlock } from "@/modules/school/domain/workout-block";
import { WorkoutRepository } from "@/modules/school/infrastructure/workout-repository";

const NOW = new Date("2026-10-03T10:00:00.000Z");

describe("WorkoutRepository — Decimal distance from the database", () => {
  it("createBlock and listBlocks return metres as a number", async () => {
    const block = createWorkoutBlock({
      id: "b1", workoutId: "w1", position: 0, blockType: "INTERVAL", title: null,
      distanceM: 100, durationS: 120, repetitions: 6, targetPayload: null, restPayload: { durationS: 60 },
    }, NOW);
    const asRow = { ...block, distanceM: new Prisma.Decimal("100.00"), targetPayload: null };
    const db = {
      workout: {},
      workoutBlock: {
        create: vi.fn().mockResolvedValue(asRow),
        findMany: vi.fn().mockResolvedValue([asRow, { ...asRow, id: "b2", position: 1, distanceM: null }]),
      },
    };
    const repository = new WorkoutRepository(db as never);

    await expect(repository.createBlock(block)).resolves.toMatchObject({ distanceM: 100 });
    const listed = await repository.listBlocks("w1");
    expect(listed.map((row) => row.distanceM)).toEqual([100, null]);
  });
});
