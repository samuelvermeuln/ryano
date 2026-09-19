import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { UpdateWorkoutTemplate } from "@/modules/school/application/update-workout-template";

const now = new Date("2026-09-17T12:00:00Z");
const personal: { id: string; ownerType: string; ownerId: string; authorCoachId: string | null; schoolId: string | null; title: string; description: string | null; sportType: string; version: number; status: string; createdAt: Date; updatedAt: Date } = {
  id: "template-1", ownerType: "COACH", ownerId: "coach-1", authorCoachId: "coach-1", schoolId: null,
  title: "Intervals", description: null, sportType: "RUN", version: 1, status: "DRAFT",
  createdAt: new Date("2026-09-16T12:00:00Z"), updatedAt: new Date("2026-09-16T12:00:00Z"),
};

function setup(template = personal) {
  const tx = {
    coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach-1", status: "ACTIVE" }) }, school: { findUnique: vi.fn().mockResolvedValue({ status: "ACTIVE" }) }, coachSchoolMembership: { findFirst: vi.fn().mockResolvedValue({ id: "membership-1" }) },
    workoutTemplate: { findUnique: vi.fn().mockResolvedValue(template), update: vi.fn().mockImplementation(async ({ data }) => ({ ...template, ...data })) },
  };
  const db = { $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)) };
  return { tx, db, useCase: new UpdateWorkoutTemplate(db as unknown as PrismaClient, () => now) };
}

describe("UpdateWorkoutTemplate [T131]", () => {
  it("updates editable fields and creates the next template version", async () => {
    const { useCase, tx } = setup();
    const updated = await useCase.execute("user-1", { templateId: "template-1", title: "Threshold", description: "20 minutes" });
    expect(updated).toMatchObject({ title: "Threshold", description: "20 minutes", version: 2, updatedAt: now });
    expect(tx.workoutTemplate.update).toHaveBeenCalledWith({ where: { id: "template-1" }, data: expect.objectContaining({ sportType: "RUN", status: "DRAFT" }) });
  });

  it("permits an active school coach to update a school template", async () => {
    const schoolTemplate = { ...personal, ownerType: "SCHOOL", ownerId: "school-1", schoolId: "school-1" };
    const { useCase, tx } = setup(schoolTemplate);
    await useCase.execute("user-1", { templateId: "template-1", status: "ACTIVE" });
    expect(tx.coachSchoolMembership.findFirst).toHaveBeenCalledWith({ where: { schoolId: "school-1", coachId: "coach-1", status: "ACTIVE", endedAt: null }, select: { id: true } });
  });

  it.each([null, "", " user-1"])("rejects unauthenticated actor %s", async (actor) => {
    const { useCase, db } = setup();
    await expect(useCase.execute(actor, { templateId: "template-1", title: "New" })).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each([{ templateId: "template-1" }, { templateId: "template-1", ownerId: "injected" }, { templateId: "template-1", version: 4 }, { templateId: "template-1", status: "ARCHIVED" }])("rejects empty or protected updates", async (input) => {
    const { useCase, db } = setup();
    await expect(useCase.execute("user-1", input)).rejects.toBeInstanceOf(ZodError);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each([[null, "WORKOUT_TEMPLATE_NOT_FOUND", 404], [{ ...personal, ownerId: "coach-2", authorCoachId: "coach-2" }, "FORBIDDEN", 403], [{ ...personal, ownerType: "SYSTEM", ownerId: "system", authorCoachId: null }, "FORBIDDEN", 403]])("rejects missing or unauthorized templates", async (template, code, status) => {
    const { useCase, tx } = setup(template as typeof personal);
    await expect(useCase.execute("user-1", { templateId: "template-1", title: "New" })).rejects.toMatchObject({ code, status });
    expect(tx.workoutTemplate.update).not.toHaveBeenCalled();
  });

  it.each([["school", null, "SCHOOL_NOT_FOUND", 404], ["school", { status: "INACTIVE" }, "SCHOOL_INACTIVE", 409], ["coachSchoolMembership", null, "COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE", 403]] as const)("requires an active school context", async (dependency, value, code, status) => {
    const schoolTemplate = { ...personal, ownerType: "SCHOOL", ownerId: "school-1", schoolId: "school-1" };
    const { useCase, tx } = setup(schoolTemplate);
    if (dependency === "school") tx.school.findUnique.mockResolvedValue(value);
    else tx.coachSchoolMembership.findFirst.mockResolvedValue(value);
    await expect(useCase.execute("user-1", { templateId: "template-1", title: "New" })).rejects.toMatchObject({ code, status });
  });

  it("maps serializable transaction conflicts", async () => {
    const { useCase, tx } = setup();
    tx.workoutTemplate.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("internal", { code: "P2034", clientVersion: "test" }));
    await expect(useCase.execute("user-1", { templateId: "template-1", title: "New" })).rejects.toMatchObject({ code: "WORKOUT_TEMPLATE_UPDATE_CONFLICT", status: 409 });
  });
});
