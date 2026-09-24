/**
 * TM027 — ListOwnTrainingProducts (`GET /api/coach/products`).
 *
 * Rota autenticada "meus produtos" (RF-001/design D-01), distinta do
 * catálogo público: retorna produtos em qualquer status, escopados ao que o
 * ator realmente possui (coachId próprio) ou administra (escolas onde é
 * OWNER/ADMIN).
 */
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { ListOwnTrainingProducts } from "@/modules/school/application/list-own-training-products";

function makeDb(options: {
  coachProfile?: { id: string; status: string } | null;
  managedSchools?: Array<{ schoolId: string }>;
  rows?: unknown[];
} = {}) {
  return {
    coachProfile: { findUnique: vi.fn().mockResolvedValue("coachProfile" in options ? options.coachProfile : { id: "coach-1", status: "ACTIVE" }) },
    schoolMembership: { findMany: vi.fn().mockResolvedValue(options.managedSchools ?? []) },
    trainingProduct: { findMany: vi.fn().mockResolvedValue(options.rows ?? []) },
  } as unknown as PrismaClient;
}

describe("ListOwnTrainingProducts [TM027]", () => {
  it("rejeita ator sem sessão", async () => {
    const db = makeDb();
    await expect(new ListOwnTrainingProducts(db).execute(null, {})).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
  });

  it("rejeita ator sem CoachProfile", async () => {
    const db = makeDb({ coachProfile: null });
    await expect(new ListOwnTrainingProducts(db).execute("user-1", {})).rejects.toMatchObject({ code: "COACH_PROFILE_NOT_FOUND" });
  });

  it("rejeita coach inativo", async () => {
    const db = makeDb({ coachProfile: { id: "coach-1", status: "SUSPENDED" } });
    await expect(new ListOwnTrainingProducts(db).execute("user-1", {})).rejects.toMatchObject({ code: "COACH_INACTIVE" });
  });

  it("consulta apenas coachId próprio quando o coach não administra nenhuma escola", async () => {
    const db = makeDb();
    await new ListOwnTrainingProducts(db).execute("user-1", {});
    expect(db.trainingProduct.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { OR: [{ coachId: "coach-1" }] } }),
    );
  });

  it("inclui produtos das escolas onde o coach é OWNER/ADMIN", async () => {
    const db = makeDb({ managedSchools: [{ schoolId: "school-1" }, { schoolId: "school-2" }] });
    await new ListOwnTrainingProducts(db).execute("user-1", {});
    expect(db.schoolMembership.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: "user-1", status: "ACTIVE", endedAt: null,
        roles: { some: { role: { in: ["OWNER", "ADMIN"] } } },
      }),
    }));
    expect(db.trainingProduct.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { OR: [{ coachId: "coach-1" }, { schoolId: { in: ["school-1", "school-2"] } }] } }),
    );
  });

  it("retorna itens e nextCursor quando há mais páginas", async () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({
      id: `prod-${i}`, schoolId: null, coachId: "coach-1", title: `Plano ${i}`, status: "DRAFT", visibility: "PUBLIC",
      priceCents: null, currency: null, currentVersionId: null, createdAt: new Date(), updatedAt: new Date(),
    }));
    const db = makeDb({ rows });
    const result = await new ListOwnTrainingProducts(db).execute("user-1", {});
    expect(result.items).toHaveLength(20);
    expect(result.nextCursor).not.toBeNull();
  });
});
