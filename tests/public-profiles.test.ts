/**
 * SAM-28 — editable public profiles: the coach's own profile and the school's
 * public fields (achievements, specialties, administrative contact).
 */
import { describe, expect, it, vi } from "vitest";
import { SchoolService } from "@/modules/school/application/school-service";
import { UpdateCoachProfile } from "@/modules/school/application/update-coach-profile";
import { updateSchoolDtoSchema } from "@/modules/school/infrastructure/school-repository";

const earlier = new Date("2026-09-01T12:00:00Z");
const now = new Date("2026-09-10T12:00:00Z");
type Row = Record<string, unknown>;

describe("UpdateCoachProfile [SAM-28]", () => {
  function fixture(existing: Row | null = { id: "coach:1" }) {
    const stored: Row = {
      id: "coach:1", userId: "user:coach", displayName: "Carlos", bio: null, status: "ACTIVE",
      sportTypes: [], credentials: [], acceptsIndependentAthletes: true, createdAt: earlier, updatedAt: earlier,
    };
    const db = {
      coachProfile: {
        findUnique: vi.fn(async () => existing),
        update: vi.fn(async ({ data }: { data: Row }) => Object.assign(stored, data)),
      },
    };
    return { db, stored, update: new UpdateCoachProfile(db as never, () => now) };
  }

  it("updates sports, credentials and the independent-athletes switch for the signed-in coach only", async () => {
    const { db, update } = fixture();
    const result = await update.execute("user:coach", { sportTypes: ["swim", "run"], credentials: [" CREF 1234 "], acceptsIndependentAthletes: false });
    expect(result).toMatchObject({ sportTypes: ["swim", "run"], credentials: ["CREF 1234"], acceptsIndependentAthletes: false, displayName: "Carlos", updatedAt: now });
    expect(db.coachProfile.findUnique).toHaveBeenCalledWith({ where: { userId: "user:coach" }, select: { id: true } });
    expect(db.coachProfile.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "coach:1" } }));
  });

  it("clears the bio with null or an empty string and keeps untouched fields", async () => {
    const { update, stored } = fixture();
    stored.bio = "Antiga";
    await expect(update.execute("user:coach", { bio: "" })).resolves.toMatchObject({ bio: null, sportTypes: [] });
    await expect(update.execute("user:coach", { bio: "Nova" })).resolves.toMatchObject({ bio: "Nova" });
  });

  it("rejects unknown sports, oversized lists, empty patches, strangers and users without a profile", async () => {
    const { db, update } = fixture();
    await expect(update.execute("user:coach", { sportTypes: ["natação"] })).rejects.toMatchObject({ name: "ZodError" });
    await expect(update.execute("user:coach", { sportTypes: ["default"] })).rejects.toMatchObject({ name: "ZodError" });
    await expect(update.execute("user:coach", { credentials: Array.from({ length: 11 }, () => "x") })).rejects.toMatchObject({ name: "ZodError" });
    await expect(update.execute("user:coach", {})).rejects.toMatchObject({ name: "ZodError" });
    await expect(update.execute("user:coach", { status: "INACTIVE" })).rejects.toMatchObject({ name: "ZodError" });
    await expect(update.execute(null, { bio: "x" })).rejects.toMatchObject({ status: 401 });
    expect(db.coachProfile.update).not.toHaveBeenCalled();

    const missing = fixture(null);
    await expect(missing.update.execute("user:other", { bio: "x" })).rejects.toMatchObject({ code: "COACH_PROFILE_NOT_FOUND", status: 404 });
  });
});

describe("SchoolService.update — public profile [SAM-28]", () => {
  function fixture() {
    const school: Row = {
      id: "school:1", slug: "alpha", name: "Alpha", ownerUserId: "user:owner", status: "ACTIVE",
      achievements: [], specialties: [], adminContactUserId: null, sportTypes: [], createdAt: earlier, updatedAt: earlier,
    };
    const roles: Record<string, string[]> = { "m:owner": ["OWNER"], "m:admin": ["ADMIN"], "m:coach": ["COACH"] };
    const members: Record<string, string> = { "user:owner": "m:owner", "user:admin": "m:admin", "user:coach": "m:coach" };
    const db = {
      school: {
        findUnique: vi.fn(async () => school),
        update: vi.fn(async ({ data }: { data: Row }) => Object.assign(school, data)),
      },
      schoolMembership: {
        findFirst: vi.fn(async ({ where }: { where: { userId: string } }) => {
          const id = members[where.userId];
          return id ? { id, schoolId: "school:1", userId: where.userId, status: "ACTIVE", startedAt: earlier, endedAt: null, createdAt: earlier, updatedAt: earlier } : null;
        }),
      },
      schoolMembershipRole: {
        findMany: vi.fn(async ({ where }: { where: { membershipId: string } }) =>
          (roles[where.membershipId] ?? []).map((role, index) => ({ id: `${where.membershipId}:${index}`, membershipId: where.membershipId, role, createdAt: earlier }))),
      },
    };
    return { db, school, service: new SchoolService(db as never, () => now) };
  }

  it("accepts the public profile fields and the DTO bounds them", () => {
    expect(updateSchoolDtoSchema.parse({ achievements: [" Campeã 2025 "], specialties: ["Travessias"], adminContactUserId: null }))
      .toEqual({ achievements: ["Campeã 2025"], specialties: ["Travessias"], adminContactUserId: null });
    expect(() => updateSchoolDtoSchema.parse({ achievements: Array.from({ length: 21 }, () => "x") })).toThrow();
    expect(() => updateSchoolDtoSchema.parse({ achievements: ["x".repeat(121)] })).toThrow();
    expect(() => updateSchoolDtoSchema.parse({ adminContactUserId: " padded " })).toThrow();
  });

  it("saves achievements, specialties and an OWNER/ADMIN as administrative contact", async () => {
    const { db, service } = fixture();
    const updated = await service.update("user:owner", "school:1", { achievements: ["Campeã estadual"], specialties: ["Travessias"], adminContactUserId: "user:admin" });
    expect(updated).toMatchObject({ achievements: ["Campeã estadual"], specialties: ["Travessias"], adminContactUserId: "user:admin", updatedAt: now });
    expect(db.school.update).toHaveBeenCalledOnce();
  });

  it("refuses a contact who is not an active OWNER/ADMIN, and lets the contact be cleared", async () => {
    const { db, service } = fixture();
    await expect(service.update("user:owner", "school:1", { adminContactUserId: "user:coach" })).rejects.toMatchObject({ code: "SCHOOL_ADMIN_CONTACT_NOT_MANAGER", status: 409 });
    await expect(service.update("user:owner", "school:1", { adminContactUserId: "user:stranger" })).rejects.toMatchObject({ code: "SCHOOL_ADMIN_CONTACT_NOT_MANAGER", status: 409 });
    expect(db.school.update).not.toHaveBeenCalled();
    await expect(service.update("user:owner", "school:1", { adminContactUserId: null })).resolves.toMatchObject({ adminContactUserId: null });
  });

  it("still requires a manager to edit", async () => {
    const { db, service } = fixture();
    await expect(service.update("user:coach", "school:1", { achievements: ["x"] })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(db.school.update).not.toHaveBeenCalled();
  });
});
