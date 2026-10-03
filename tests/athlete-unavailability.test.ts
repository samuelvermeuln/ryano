/**
 * SAM-57 — athlete unavailability periods.
 */
import { describe, expect, it, vi } from "vitest";

import { AthleteUnavailabilityService } from "@/modules/school/application/athlete-unavailability";

function makeDb() {
  return {
    athleteUnavailability: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(data)),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    coachAthleteAssignment: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
    schoolAthleteMembership: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
  };
}

describe("indisponibilidade", () => {
  it("o atleta registra o próprio período; fim antes do início é recusado", async () => {
    const db = makeDb();
    const service = new AthleteUnavailabilityService(db as never);
    await expect(service.create("maria", { startLocalDate: "2026-11-02", endLocalDate: "2026-11-06", reason: "viagem a trabalho" }))
      .resolves.toMatchObject({ athleteId: "maria", createdByUserId: "maria" });
    await expect(service.create("maria", { startLocalDate: "2026-11-06", endLocalDate: "2026-11-02", reason: "viagem" })).rejects.toThrow(/antes do início/);
  });

  it("só remove os próprios; consulta exige vínculo (404 para estranhos)", async () => {
    const db = makeDb();
    const service = new AthleteUnavailabilityService(db as never);
    db.athleteUnavailability.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.remove("outro", "u1")).rejects.toMatchObject({ status: 404 });
    expect(db.athleteUnavailability.deleteMany).toHaveBeenCalledWith({ where: { id: "u1", athleteId: "outro" } });
    await expect(service.list("estranho", "maria", { from: "2026-11-01", to: "2026-11-30" })).rejects.toMatchObject({ status: 404 });
    await service.list("maria", "maria", { from: "2026-11-01", to: "2026-11-30" });
    expect(db.athleteUnavailability.findMany.mock.calls[0][0].where).toEqual({ athleteId: "maria", startLocalDate: { lte: "2026-11-30" }, endLocalDate: { gte: "2026-11-01" } });
  });
});
