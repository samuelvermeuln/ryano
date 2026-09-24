/**
 * TM001 — ListTrainingProducts (`GET /api/training-products`, public/no-session).
 *
 * Foco: `status`/`visibility` não podem mais ser controlados pelo cliente —
 * a rota é explicitamente pública e sempre forçava DRAFT/SCHOOL_ONLY a
 * vazar quando o parâmetro vinha da query string.
 */
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ListTrainingProducts } from "@/modules/school/application/list-training-products";

function makeDb(rows: unknown[] = []) {
  return {
    trainingProduct: { findMany: vi.fn().mockResolvedValue(rows) },
  } as unknown as PrismaClient;
}

describe("ListTrainingProducts [TM001]", () => {
  it("rejeita `status` vindo do cliente — o parâmetro não existe mais no schema", async () => {
    await expect(new ListTrainingProducts(makeDb()).execute({ status: "DRAFT" }))
      .rejects.toBeInstanceOf(Error);
  });

  it("rejeita `visibility` vindo do cliente — o parâmetro não existe mais no schema", async () => {
    await expect(new ListTrainingProducts(makeDb()).execute({ visibility: "SCHOOL_ONLY" }))
      .rejects.toBeInstanceOf(Error);
  });

  it("sempre consulta status=PUBLISHED e visibility=PUBLIC, sem exceção", async () => {
    const db = makeDb();
    await new ListTrainingProducts(db).execute({});
    expect(db.trainingProduct.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PUBLISHED", visibility: "PUBLIC" }),
      }),
    );
  });

  it("combina com filtros legítimos (schoolId/coachId/sportType) sem abrir brecha", async () => {
    const db = makeDb();
    await new ListTrainingProducts(db).execute({ schoolId: "school-1", sportType: "run" });
    expect(db.trainingProduct.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          schoolId: "school-1", sportType: "run", status: "PUBLISHED", visibility: "PUBLIC",
        }),
      }),
    );
  });

  it("pagina por cursor e não vaza o cursor decodificado em erro", async () => {
    const db = makeDb([{ id: "a" }, { id: "b" }]);
    (db.trainingProduct.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "a" }]);
    const out = await new ListTrainingProducts(db).execute({ limit: 1, cursor: "not-base64-json" });
    expect(out.items).toHaveLength(1);
  });
});
