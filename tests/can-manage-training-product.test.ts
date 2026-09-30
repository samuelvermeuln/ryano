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

  // SAM-9 — a escola é vendedora de primeira classe: quem administra a escola
  // autoriza produto DELA sem precisar ser professor. O caminho do professor
  // (produto em nome próprio) segue exigindo CoachProfile ACTIVE.
  describe("produto da escola sem CoachProfile [SAM-9]", () => {
    function managerMemberships(role: string = SchoolRole.OWNER) {
      return makeMemberships(
        { id: "m-1", schoolId: "school-1", userId: "user-1", status: MembershipStatus.ACTIVE, endedAt: null },
        [{ membershipId: "m-1", role }],
      );
    }

    it("aprova OWNER da escola que NÃO tem CoachProfile, devolvendo coachId null", async () => {
      const guard = new CanManageTrainingProduct(makeDb(null), managerMemberships(SchoolRole.OWNER));
      await expect(guard.assertAuthorCoach("user-1", "school-1")).resolves.toEqual({ coachId: null });
    });

    it("aprova ADMIN da escola que NÃO tem CoachProfile", async () => {
      const guard = new CanManageTrainingProduct(makeDb(null), managerMemberships(SchoolRole.ADMIN));
      await expect(guard.assertAuthorCoach("user-1", "school-1")).resolves.toEqual({ coachId: null });
    });

    it("rejeita membro da escola sem papel administrativo, mesmo sem CoachProfile", async () => {
      const guard = new CanManageTrainingProduct(makeDb(null), managerMemberships(SchoolRole.COACH));
      await expect(guard.assertAuthorCoach("user-1", "school-1"))
        .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    });

    it("rejeita gestor de OUTRA escola (isolamento multi-tenant)", async () => {
      // Membership ativa em school-1; o produto é da school-2.
      const memberships = makeMemberships(null);
      const guard = new CanManageTrainingProduct(makeDb(null), memberships);
      await expect(guard.assertAuthorCoach("user-1", "school-2"))
        .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
      expect(memberships.findActiveBySchoolAndUser).toHaveBeenCalledWith("school-2", "user-1");
    });

    it("rejeita quem não tem CoachProfile nem vínculo administrativo", async () => {
      const guard = new CanManageTrainingProduct(makeDb(null), makeMemberships(null));
      await expect(guard.assertAuthorCoach("user-athlete", "school-1"))
        .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    });

    it("não deixa suspensão do professor ser lavada pelo papel de gestor", async () => {
      const guard = new CanManageTrainingProduct(
        makeDb({ id: "coach-1", status: "SUSPENDED" }),
        managerMemberships(SchoolRole.OWNER),
      );
      await expect(guard.assertAuthorCoach("user-1", "school-1"))
        .rejects.toMatchObject({ code: "COACH_INACTIVE", status: 409 });
    });

    it("não regride o caminho do professor: produto em nome próprio ainda exige CoachProfile", async () => {
      const guard = new CanManageTrainingProduct(makeDb(null), managerMemberships(SchoolRole.OWNER));
      await expect(guard.assertAuthorCoach("user-1", null))
        .rejects.toMatchObject({ code: "COACH_PROFILE_NOT_FOUND", status: 404 });
    });
  });
});
