/**
 * TM058 (RF-201/RF-105) — SCHOOL_ONLY eligibility, shared by the free and
 * paid acquisition paths. Neither path checked this before this task: any
 * authenticated athlete could acquire a SCHOOL_ONLY product regardless of
 * membership.
 */
import { describe, expect, it, vi } from "vitest";
import { assertProductPurchasable } from "@/modules/school/application/assert-product-purchasable";

describe("assertProductPurchasable [TM058]", () => {
  it("PUBLIC nunca chama schoolAthleteMembership — qualquer atleta pode adquirir", async () => {
    const findFirst = vi.fn();
    await expect(assertProductPurchasable({ schoolAthleteMembership: { findFirst } }, "athlete-1", {
      id: "prod-1", visibility: "PUBLIC", schoolId: null,
    })).resolves.toBeUndefined();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("UNLISTED nunca chama schoolAthleteMembership — link direto basta", async () => {
    const findFirst = vi.fn();
    await expect(assertProductPurchasable({ schoolAthleteMembership: { findFirst } }, "athlete-1", {
      id: "prod-1", visibility: "UNLISTED", schoolId: null,
    })).resolves.toBeUndefined();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("SCHOOL_ONLY com atleta membro ACTIVE é permitido", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "mbr-1" });
    await expect(assertProductPurchasable({ schoolAthleteMembership: { findFirst } }, "athlete-1", {
      id: "prod-1", visibility: "SCHOOL_ONLY", schoolId: "school-1",
    })).resolves.toBeUndefined();
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { schoolId: "school-1", athleteId: "athlete-1", status: "ACTIVE", endedAt: null },
    }));
  });

  it("SCHOOL_ONLY sem vínculo ativo é rejeitado com PRODUCT_VISIBILITY_DENIED (404, nunca vaza existência)", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    await expect(assertProductPurchasable({ schoolAthleteMembership: { findFirst } }, "athlete-outsider", {
      id: "prod-1", visibility: "SCHOOL_ONLY", schoolId: "school-1",
    })).rejects.toMatchObject({ code: "PRODUCT_VISIBILITY_DENIED", status: 404 });
  });
});
