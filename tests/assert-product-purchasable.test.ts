/**
 * TM058 (RF-201/RF-105) — SCHOOL_ONLY eligibility, shared by the free and
 * paid acquisition paths. Neither path checked this before this task: any
 * authenticated athlete could acquire a SCHOOL_ONLY product regardless of
 * membership.
 *
 * Extended for PRIVATE (per-athlete allow-list): the interesting cases are
 * the ones where the two rules must NOT be confused — a school member with no
 * allow-list row is denied, and an allow-listed athlete of a coach-owned
 * product (no school at all) is allowed.
 */
import { describe, expect, it, vi } from "vitest";
import { assertProductPurchasable } from "@/modules/school/application/assert-product-purchasable";

function db(membership: unknown = null, audience: unknown = null) {
  return {
    schoolAthleteMembership: { findFirst: vi.fn().mockResolvedValue(membership) },
    trainingProductAudience: { findFirst: vi.fn().mockResolvedValue(audience) },
  };
}

describe("assertProductPurchasable [TM058]", () => {
  it("PUBLIC nunca consulta vínculo nem lista — qualquer atleta pode adquirir", async () => {
    const deps = db();
    await expect(assertProductPurchasable(deps, "athlete-1", {
      id: "prod-1", visibility: "PUBLIC", schoolId: null,
    })).resolves.toBeUndefined();
    expect(deps.schoolAthleteMembership.findFirst).not.toHaveBeenCalled();
    expect(deps.trainingProductAudience.findFirst).not.toHaveBeenCalled();
  });

  it("UNLISTED nunca consulta vínculo — link direto basta", async () => {
    const deps = db();
    await expect(assertProductPurchasable(deps, "athlete-1", {
      id: "prod-1", visibility: "UNLISTED", schoolId: null,
    })).resolves.toBeUndefined();
    expect(deps.schoolAthleteMembership.findFirst).not.toHaveBeenCalled();
  });

  it("SCHOOL_ONLY com atleta membro ACTIVE é permitido", async () => {
    const deps = db({ id: "mbr-1" });
    await expect(assertProductPurchasable(deps, "athlete-1", {
      id: "prod-1", visibility: "SCHOOL_ONLY", schoolId: "school-1",
    })).resolves.toBeUndefined();
    expect(deps.schoolAthleteMembership.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { schoolId: "school-1", athleteId: "athlete-1", status: "ACTIVE", endedAt: null },
    }));
  });

  it("SCHOOL_ONLY sem vínculo ativo é rejeitado com PRODUCT_VISIBILITY_DENIED (404, nunca vaza existência)", async () => {
    const deps = db(null);
    await expect(assertProductPurchasable(deps, "athlete-outsider", {
      id: "prod-1", visibility: "SCHOOL_ONLY", schoolId: "school-1",
    })).rejects.toMatchObject({ code: "PRODUCT_VISIBILITY_DENIED", status: 404 });
  });

  it("PRIVATE com atleta na lista (não revogado) é permitido", async () => {
    const deps = db(null, { id: "aud-1" });
    await expect(assertProductPurchasable(deps, "athlete-1", {
      id: "prod-1", visibility: "PRIVATE", schoolId: "school-1",
    })).resolves.toBeUndefined();
    expect(deps.trainingProductAudience.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { productId: "prod-1", athleteId: "athlete-1", revokedAt: null },
    }));
  });

  it("PRIVATE: ser membro da escola NÃO basta — só a lista vale", async () => {
    // Membership resolves, allow-list does not. The mistake this guards
    // against is falling through to the SCHOOL_ONLY branch for PRIVATE.
    const deps = db({ id: "mbr-1" }, null);
    await expect(assertProductPurchasable(deps, "athlete-member", {
      id: "prod-1", visibility: "PRIVATE", schoolId: "school-1",
    })).rejects.toMatchObject({ code: "PRODUCT_VISIBILITY_DENIED", status: 404 });
    expect(deps.schoolAthleteMembership.findFirst).not.toHaveBeenCalled();
  });

  it("PRIVATE de produto sem escola (professor autônomo) ainda exige a lista", async () => {
    const deps = db(null, null);
    await expect(assertProductPurchasable(deps, "athlete-1", {
      id: "prod-1", visibility: "PRIVATE", schoolId: null,
    })).rejects.toMatchObject({ code: "PRODUCT_VISIBILITY_DENIED", status: 404 });
  });
});
