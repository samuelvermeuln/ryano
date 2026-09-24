/**
 * TM019 — CreateTrainingProductDraft.
 *
 * Cobre criação por coach independente (produto em nome próprio) e por coach
 * vinculado a escola (produto da escola), além da matriz de rejeição da
 * autorização (TM018). Q3 é resolvida por request: `schoolId` presente →
 * produto da escola (exige OWNER/ADMIN); ausente → produto do coach.
 */
import { describe, expect, it, vi } from "vitest";
import { CreateTrainingProductDraft } from "@/modules/school/application/create-training-product-draft";

const now = new Date("2026-09-23T12:00:00Z");

function withTx<T extends Record<string, Record<string, unknown>>>(db: T) {
  return Object.assign(db, {
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  });
}

function makeDb(over: Record<string, unknown> = {}) {
  const db = {
    coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach-1", status: "ACTIVE" }) },
    school: { findUnique: vi.fn().mockResolvedValue({ status: "ACTIVE" }) },
    schoolMembership: { findFirst: vi.fn().mockResolvedValue(null) },
    schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([]) },
    trainingProduct: { create: vi.fn().mockImplementation(({ data }) => Promise.resolve(data)) },
    ...over,
  };
  return withTx(db);
}

describe("CreateTrainingProductDraft [TM019]", () => {
  it("cria produto em nome próprio para coach independente (sem schoolId)", async () => {
    const db = makeDb();
    const product = await new CreateTrainingProductDraft(db as never, () => now)
      .execute("user-1", { title: "Base 12 semanas" });

    expect(product).toMatchObject({ coachId: "coach-1", schoolId: null, title: "Base 12 semanas", status: "DRAFT" });
    expect(db.schoolMembership.findFirst).not.toHaveBeenCalled();
  });

  it("cria produto da escola para coach OWNER dessa escola", async () => {
    const db = makeDb({
      schoolMembership: {
        findFirst: vi.fn().mockResolvedValue({
          id: "m-1", schoolId: "school-1", userId: "user-1", status: "ACTIVE", endedAt: null,
        }),
      },
      schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([{ membershipId: "m-1", role: "OWNER" }]) },
    });
    const product = await new CreateTrainingProductDraft(db as never, () => now)
      .execute("user-1", { schoolId: "school-1", title: "Plano da escola" });

    expect(product).toMatchObject({ coachId: null, schoolId: "school-1" });
  });

  it("rejeita ator sem CoachProfile", async () => {
    const db = makeDb({ coachProfile: { findUnique: vi.fn().mockResolvedValue(null) } });
    await expect(new CreateTrainingProductDraft(db as never, () => now).execute("user-1", { title: "X" }))
      .rejects.toMatchObject({ code: "COACH_PROFILE_NOT_FOUND" });
    expect(db.trainingProduct.create).not.toHaveBeenCalled();
  });

  it("rejeita coach inativo", async () => {
    const db = makeDb({ coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach-1", status: "SUSPENDED" }) } });
    await expect(new CreateTrainingProductDraft(db as never, () => now).execute("user-1", { title: "X" }))
      .rejects.toMatchObject({ code: "COACH_INACTIVE" });
  });

  it("rejeita coach sem OWNER/ADMIN na escola pedida (produto da escola)", async () => {
    const db = makeDb();
    await expect(new CreateTrainingProductDraft(db as never, () => now)
      .execute("user-1", { schoolId: "school-1", title: "X" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.trainingProduct.create).not.toHaveBeenCalled();
  });

  it("rejeita escola inexistente", async () => {
    const db = makeDb({
      schoolMembership: {
        findFirst: vi.fn().mockResolvedValue({
          id: "m-1", schoolId: "school-1", userId: "user-1", status: "ACTIVE", endedAt: null,
        }),
      },
      schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([{ membershipId: "m-1", role: "OWNER" }]) },
      school: { findUnique: vi.fn().mockResolvedValue(null) },
    });
    await expect(new CreateTrainingProductDraft(db as never, () => now)
      .execute("user-1", { schoolId: "school-1", title: "X" }))
      .rejects.toMatchObject({ code: "SCHOOL_NOT_FOUND" });
  });

  it("rejeita escola inativa", async () => {
    const db = makeDb({
      schoolMembership: {
        findFirst: vi.fn().mockResolvedValue({
          id: "m-1", schoolId: "school-1", userId: "user-1", status: "ACTIVE", endedAt: null,
        }),
      },
      schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([{ membershipId: "m-1", role: "ADMIN" }]) },
      school: { findUnique: vi.fn().mockResolvedValue({ status: "INACTIVE" }) },
    });
    await expect(new CreateTrainingProductDraft(db as never, () => now)
      .execute("user-1", { schoolId: "school-1", title: "X" }))
      .rejects.toMatchObject({ code: "SCHOOL_INACTIVE" });
  });

  it("rejeita ator sem sessão", async () => {
    const db = makeDb();
    await expect(new CreateTrainingProductDraft(db as never, () => now).execute(null, { title: "X" }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
