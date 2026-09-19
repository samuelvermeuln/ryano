import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { CreateWorkoutTemplate } from "@/modules/school/application/create-workout-template";
import { TemplateStatus, WorkoutOwnerType } from "@/modules/school/domain/enums";

const now = new Date("2026-09-16T12:00:00Z");
const personalInput = { ownerType: WorkoutOwnerType.COACH, title: "Intervals", description: null, sportType: "RUN" };

function setup() {
  const tx = {
    coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach-1", status: "ACTIVE" }) },
    school: { findUnique: vi.fn().mockResolvedValue({ id: "school-1", status: "ACTIVE" }) },
    coachSchoolMembership: { findFirst: vi.fn().mockResolvedValue({ id: "membership-1" }) },
    workoutTemplate: { create: vi.fn().mockImplementation(async ({ data }) => data) },
  };
  const db = { $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)) };
  return { tx, db, useCase: new CreateWorkoutTemplate(db as unknown as PrismaClient, () => now) };
}

describe("CreateWorkoutTemplate [T130]", () => {
  it("creates a personal draft for the authenticated active coach", async () => {
    const { useCase, tx, db } = setup();
    const template = await useCase.execute("user-1", personalInput);
    expect(template).toMatchObject({ ownerType: "COACH", ownerId: "coach-1", authorCoachId: "coach-1", schoolId: null, version: 1, status: "DRAFT", createdAt: now, updatedAt: now });
    expect(tx.workoutTemplate.create).toHaveBeenCalledWith({ data: expect.objectContaining({ title: "Intervals", sportType: "RUN" }) });
    expect(tx.school.findUnique).not.toHaveBeenCalled();
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });

  it("creates an active school template only for an active school membership", async () => {
    const { useCase, tx } = setup();
    const template = await useCase.execute("user-1", { ...personalInput, ownerType: "SCHOOL", schoolId: "school-1", status: TemplateStatus.ACTIVE });
    expect(template).toMatchObject({ ownerType: "SCHOOL", ownerId: "school-1", authorCoachId: "coach-1", schoolId: "school-1", status: "ACTIVE" });
    expect(tx.coachSchoolMembership.findFirst).toHaveBeenCalledWith({ where: { schoolId: "school-1", coachId: "coach-1", status: "ACTIVE", endedAt: null }, select: { id: true } });
  });

  it.each([null, "", " user-1"])("rejects unauthenticated actor %s before writing", async (actor) => {
    const { useCase, db } = setup();
    await expect(useCase.execute(actor, personalInput)).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    { ...personalInput, ownerType: "SYSTEM" },
    { ...personalInput, ownerType: "COACH", schoolId: "school-1" },
    { ...personalInput, ownerType: "SCHOOL" },
    { ...personalInput, authorCoachId: "other-coach" },
    { ...personalInput, ownerId: "other-owner" },
    { ...personalInput, version: 4 },
    { ...personalInput, status: "ARCHIVED" },
  ])("rejects injected or invalid ownership: %j", async (input) => {
    const { useCase, db } = setup();
    await expect(useCase.execute("user-1", input)).rejects.toBeInstanceOf(ZodError);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects missing, inactive, or unlinked coach and school contexts", async () => {
    for (const [dependency, result, code, status] of [
      ["coachProfile", null, "COACH_PROFILE_NOT_FOUND", 404],
      ["coachProfile", { id: "coach-1", status: "INACTIVE" }, "COACH_INACTIVE", 409],
      ["school", null, "SCHOOL_NOT_FOUND", 404],
      ["school", { id: "school-1", status: "INACTIVE" }, "SCHOOL_INACTIVE", 409],
      ["coachSchoolMembership", null, "COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE", 403],
    ] as const) {
      const { useCase, tx } = setup();
      if (dependency === "coachProfile") tx.coachProfile.findUnique.mockResolvedValue(result);
      if (dependency === "school") tx.school.findUnique.mockResolvedValue(result);
      if (dependency === "coachSchoolMembership") tx.coachSchoolMembership.findFirst.mockResolvedValue(result);
      await expect(useCase.execute("user-1", { ...personalInput, ownerType: "SCHOOL", schoolId: "school-1" })).rejects.toMatchObject({ code, status });
      expect(tx.workoutTemplate.create).not.toHaveBeenCalled();
    }
  });

  it.each(["P2002", "P2003", "P2034"])("maps %s to a stable conflict", async (code) => {
    const { useCase, tx } = setup();
    tx.workoutTemplate.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("internal", { code, clientVersion: "test" }));
    await expect(useCase.execute("user-1", personalInput)).rejects.toMatchObject({ code: "WORKOUT_TEMPLATE_CREATE_CONFLICT", status: 409 });
  });
});
