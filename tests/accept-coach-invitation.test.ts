/**
 * TM073 — AcceptCoachInvitation (RF-302). Only the invited coach can accept;
 * PENDING -> ACTIVE; duplicate accept reports ENGAGEMENT_ALREADY_ACTIVE.
 */
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { AcceptCoachInvitation } from "@/modules/school/application/accept-coach-invitation";

const now = new Date("2026-09-24T12:00:00Z");

function makeDb(over: Record<string, unknown> = {}) {
  const db = {
    licenseCoachEngagement: {
      findUnique: vi.fn().mockResolvedValue({ id: "eng-1", coachId: "coach-1", licenseId: "lic-1", status: "PENDING" }),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: "eng-1", ...data })),
    },
    coachProfile: {
      findUnique: vi.fn().mockResolvedValue({ id: "coach-1", userId: "coach-user-1", status: "ACTIVE" }),
    },
    trainingLicense: {
      findUnique: vi.fn().mockResolvedValue({ status: "ACTIVE" }),
    },
    ...over,
  };
  return Object.assign(db, {
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  });
}

describe("AcceptCoachInvitation [TM073]", () => {
  it("coach convidado aceita — PENDING vira ACTIVE", async () => {
    const db = makeDb();
    const out = await new AcceptCoachInvitation(db as unknown as PrismaClient, () => now).execute("coach-user-1", { engagementId: "eng-1" });
    expect(out).toMatchObject({ status: "ACTIVE" });
    expect(db.licenseCoachEngagement.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "eng-1" }, data: expect.objectContaining({ status: "ACTIVE", acceptedAt: now }),
    }));
  });

  it("coach diferente do convidado tentando aceitar recebe 403", async () => {
    const db = makeDb({
      coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach-1", userId: "outro-coach-user", status: "ACTIVE" }) },
    });
    await expect(new AcceptCoachInvitation(db as unknown as PrismaClient, () => now).execute("intruso-user", { engagementId: "eng-1" }))
      .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(db.licenseCoachEngagement.update).not.toHaveBeenCalled();
  });

  it("convite inexistente retorna ENGAGEMENT_NOT_FOUND", async () => {
    const db = makeDb({ licenseCoachEngagement: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() } });
    await expect(new AcceptCoachInvitation(db as unknown as PrismaClient, () => now).execute("coach-user-1", { engagementId: "eng-x" }))
      .rejects.toMatchObject({ code: "ENGAGEMENT_NOT_FOUND", status: 404 });
  });

  it("aceite duplicado (já ACTIVE) retorna ENGAGEMENT_ALREADY_ACTIVE, não erro genérico", async () => {
    const db = makeDb({
      licenseCoachEngagement: {
        findUnique: vi.fn().mockResolvedValue({ id: "eng-1", coachId: "coach-1", licenseId: "lic-1", status: "ACTIVE" }),
        update: vi.fn(),
      },
    });
    await expect(new AcceptCoachInvitation(db as unknown as PrismaClient, () => now).execute("coach-user-1", { engagementId: "eng-1" }))
      .rejects.toMatchObject({ code: "ENGAGEMENT_ALREADY_ACTIVE", status: 409 });
    expect(db.licenseCoachEngagement.update).not.toHaveBeenCalled();
  });

  it("convite ENDED (revogado) não pode mais ser aceito", async () => {
    const db = makeDb({
      licenseCoachEngagement: {
        findUnique: vi.fn().mockResolvedValue({ id: "eng-1", coachId: "coach-1", licenseId: "lic-1", status: "ENDED" }),
        update: vi.fn(),
      },
    });
    await expect(new AcceptCoachInvitation(db as unknown as PrismaClient, () => now).execute("coach-user-1", { engagementId: "eng-1" }))
      .rejects.toMatchObject({ code: "ENGAGEMENT_NOT_PENDING", status: 409 });
  });

  it("licença não mais ativa impede o aceite", async () => {
    const db = makeDb({ trainingLicense: { findUnique: vi.fn().mockResolvedValue({ status: "REVOKED" }) } });
    await expect(new AcceptCoachInvitation(db as unknown as PrismaClient, () => now).execute("coach-user-1", { engagementId: "eng-1" }))
      .rejects.toMatchObject({ code: "LICENSE_NOT_ACTIVE", status: 409 });
  });

  it("exige sessão (UNAUTHORIZED sem actorUserId)", async () => {
    const db = makeDb();
    await expect(new AcceptCoachInvitation(db as unknown as PrismaClient, () => now).execute(null, { engagementId: "eng-1" }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
  });
});
