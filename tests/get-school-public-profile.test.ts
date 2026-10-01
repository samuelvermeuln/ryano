import { describe, expect, it, vi } from "vitest";
import { GetSchoolPublicProfile } from "@/modules/school/application/get-school-public-profile";

const createdAt = new Date("2024-03-01T12:00:00Z");
const requestedAt = new Date("2026-09-10T12:00:00Z");

function schoolRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "school:opaque", slug: "alpha", name: "Escola Alpha", description: "Natação para todos", logoUrl: null,
    status: "ACTIVE", createdAt, sportTypes: ["swim", "run"],
    street: "Av. Paulista", addressNumber: "100", district: "Bela Vista", city: "São Paulo", state: "SP",
    phoneE164: "+5511912340001", email: "contato@alpha.test", joinPolicy: "REQUIRE_APPROVAL", coachSelectionPolicy: "ADMIN_ASSIGNS",
    owner: { name: "Dona Alpha", image: "https://img/owner.png" },
    achievements: ["Campeã estadual 2025"], specialties: ["Travessias"], adminContact: null,
    ...overrides,
  };
}

function fixture(options: { school?: Record<string, unknown> | null; viewer?: { status: string; createdAt: Date } | null } = {}) {
  const db = {
    school: { findUnique: vi.fn(async () => (options.school === null ? null : schoolRow(options.school ?? {}))) },
    schoolAthleteMembership: {
      count: vi.fn(async () => 23),
      findFirst: vi.fn(async () => options.viewer ?? null),
    },
    coachSchoolMembership: {
      findMany: vi.fn(async () => [
        { startedAt: createdAt, coach: { id: "coach:1", displayName: "Carlos", bio: "Natação", status: "ACTIVE", user: { image: "https://img/c1.png" } } },
        { startedAt: createdAt, coach: { id: "coach:2", displayName: "Inativo", bio: null, status: "INACTIVE", user: { image: null } } },
      ]),
    },
  };
  return { db, useCase: new GetSchoolPublicProfile(db as never) };
}

describe("GetSchoolPublicProfile [SAM-24]", () => {
  it.each([null, "", " ", "x".repeat(257)])("requires a session before reading: %j", async (actor) => {
    const { db, useCase } = fixture();
    await expect(useCase.execute(actor, "school:opaque")).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    expect(db.school.findUnique).not.toHaveBeenCalled();
  });

  it.each([{ school: null }, { school: { status: "INACTIVE" } }])("hides absent or inactive schools as 404: %j", async (options) => {
    const { db, useCase } = fixture(options);
    await expect(useCase.execute("athlete:opaque", "school:opaque")).rejects.toMatchObject({ code: "SCHOOL_NOT_FOUND", status: 404 });
    expect(db.schoolAthleteMembership.count).not.toHaveBeenCalled();
  });

  it("maps the public fields, filters inactive coaches and never selects the CNPJ or the postal code", async () => {
    const { db, useCase } = fixture();
    const profile = await useCase.execute("athlete:opaque", "school:opaque");

    expect(profile).toMatchObject({
      id: "school:opaque", name: "Escola Alpha", since: createdAt, sportTypes: ["swim", "run"],
      address: { street: "Av. Paulista", number: "100", district: "Bela Vista", city: "São Paulo", state: "SP" },
      phoneE164: "+5511912340001", email: "contato@alpha.test",
      activeAthleteCount: 23,
      achievements: ["Campeã estadual 2025"], specialties: ["Travessias"],
      responsible: { name: "Dona Alpha", image: "https://img/owner.png" },
      coaches: [{ id: "coach:1", displayName: "Carlos", bio: "Natação", image: "https://img/c1.png" }],
      viewer: { membershipStatus: "NONE", requestedAt: null },
    });
    expect(JSON.stringify(profile)).not.toMatch(/cnpj|postalCode|ownerUserId/i);

    const [firstCall] = db.school.findUnique.mock.calls as unknown as Array<[{ select: Record<string, unknown> }]>;
    const select = firstCall![0].select;
    expect(Object.keys(select)).not.toEqual(expect.arrayContaining(["cnpjHash", "cnpjEncrypted", "postalCode", "ownerUserId"]));
    expect(db.coachSchoolMembership.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { schoolId: "school:opaque", status: "ACTIVE", endedAt: null, suspendedAt: null },
    }));
    expect(db.schoolAthleteMembership.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { schoolId: "school:opaque", athleteId: "athlete:opaque", status: { in: ["PENDING", "ACTIVE"] } },
    }));
  });

  // SAM-28 — the named administrative contact answers for the school; the OWNER is the fallback.
  it("shows the administrative contact as responsible when the school named one", async () => {
    const { useCase } = fixture({ school: { adminContact: { name: "Gestora Bia", image: null } } });
    const profile = await useCase.execute("athlete:opaque", "school:opaque");
    expect(profile.responsible).toEqual({ name: "Gestora Bia", image: null });
  });

  it.each([
    [{ status: "PENDING", createdAt: requestedAt }, { membershipStatus: "PENDING", requestedAt }],
    [{ status: "ACTIVE", createdAt: requestedAt }, { membershipStatus: "ACTIVE", requestedAt: null }],
  ])("reports the viewer's own relationship %j → %j", async (viewer, expected) => {
    const { useCase } = fixture({ viewer });
    const profile = await useCase.execute("athlete:opaque", "school:opaque");
    expect(profile.viewer).toEqual(expected);
  });
});
