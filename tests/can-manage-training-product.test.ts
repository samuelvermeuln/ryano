/**
 * TM018 — CanManageTrainingProduct: guard de professor autorizado.
 *
 * Cobre a matriz de autorização: ator sem CoachProfile, coach inativo, coach
 * sem OWNER/ADMIN na escola dona do produto, coach independente (sem escola)
 * e coach com OWNER/ADMIN na escola — todos avaliados no servidor (RF-101).
 */
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { CanManageTrainingProduct } from "@/modules/school/application/can-manage-training-product";
import { MembershipStatus, SchoolRole } from "@/modules/school/domain/enums";

function makeDb(coachProfile: unknown) {
  return { coachProfile: { findUnique: vi.fn().mockResolvedValue(coachProfile) } } as unknown as Pick<PrismaClient, "coachProfile">;
}

function makeMemberships(membership: unknown, roles: Array<{ membershipId: string; role: string }> = []) {
  return {
    findActiveBySchoolAndUser: vi.fn().mockResolvedValue(membership),
    findRoles: vi.fn().mockResolvedValue(roles),
  };
}

describe("CanManageTrainingProduct [TM018]", () => {
  it("rejeita ator sem sessão (userId nulo)", async () => {
    const guard = new CanManageTrainingProduct(makeDb(null), makeMemberships(null));
    await expect(guard.assertAuthorCoach(null, null)).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
  });

  it("rejeita atleta sem CoachProfile", async () => {
    const guard = new CanManageTrainingProduct(makeDb(null), makeMemberships(null));
    await expect(guard.assertAuthorCoach("user-athlete", null))
      .rejects.toMatchObject({ code: "COACH_PROFILE_NOT_FOUND", status: 404 });
  });

  it("rejeita coach inativo", async () => {
    const guard = new CanManageTrainingProduct(
      makeDb({ id: "coach-1", status: "SUSPENDED" }),
      makeMemberships(null),
    );
    await expect(guard.assertAuthorCoach("user-1", null))
      .rejects.toMatchObject({ code: "COACH_INACTIVE", status: 409 });
  });

  it("aprova coach independente (sem escola) sem checar vínculo algum", async () => {
    const memberships = makeMemberships(null);
    const guard = new CanManageTrainingProduct(makeDb({ id: "coach-1", status: "ACTIVE" }), memberships);
    const result = await guard.assertAuthorCoach("user-1", null);
    expect(result).toEqual({ coachId: "coach-1" });
    expect(memberships.findActiveBySchoolAndUser).not.toHaveBeenCalled();
  });

  it("rejeita coach ativo sem OWNER/ADMIN na escola dona do produto", async () => {
    const memberships = makeMemberships(
      { id: "m-1", schoolId: "school-1", userId: "user-1", status: MembershipStatus.ACTIVE, endedAt: null },
      [{ membershipId: "m-1", role: SchoolRole.COACH }],
    );
    const guard = new CanManageTrainingProduct(makeDb({ id: "coach-1", status: "ACTIVE" }), memberships);
    await expect(guard.assertAuthorCoach("user-1", "school-1"))
      .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("rejeita coach sem nenhum vínculo com a escola dona do produto", async () => {
    const memberships = makeMemberships(null);
    const guard = new CanManageTrainingProduct(makeDb({ id: "coach-1", status: "ACTIVE" }), memberships);
    await expect(guard.assertAuthorCoach("user-1", "school-1"))
      .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("aprova coach OWNER da escola dona do produto", async () => {
    const memberships = makeMemberships(
      { id: "m-1", schoolId: "school-1", userId: "user-1", status: MembershipStatus.ACTIVE, endedAt: null },
      [{ membershipId: "m-1", role: SchoolRole.OWNER }],
    );
    const guard = new CanManageTrainingProduct(makeDb({ id: "coach-1", status: "ACTIVE" }), memberships);
    const result = await guard.assertAuthorCoach("user-1", "school-1");
    expect(result).toEqual({ coachId: "coach-1" });
  });

  it("aprova coach ADMIN da escola dona do produto", async () => {
    const memberships = makeMemberships(
      { id: "m-1", schoolId: "school-1", userId: "user-1", status: MembershipStatus.ACTIVE, endedAt: null },
      [{ membershipId: "m-1", role: SchoolRole.ADMIN }],
    );
    const guard = new CanManageTrainingProduct(makeDb({ id: "coach-1", status: "ACTIVE" }), memberships);
    const result = await guard.assertAuthorCoach("user-1", "school-1");
    expect(result).toEqual({ coachId: "coach-1" });
  });
});
