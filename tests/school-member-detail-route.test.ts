import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  school: vi.fn(),
  membershipFirst: vi.fn(),
  membershipUnique: vi.fn(),
  roles: vi.fn(),
  user: vi.fn(),
  athleteMembership: vi.fn(),
  coachProfile: vi.fn(),
  coachMembership: vi.fn(),
  env: { SCHOOL_MODULE_ENABLED: "true" },
}));
vi.mock("@/server/env", () => ({ env: mocks.env }));
vi.mock("@/server/auth", () => ({ auth: mocks.auth }));
vi.mock("@/server/db", () => ({ prisma: {
  school: { findUnique: mocks.school },
  schoolMembership: { findFirst: mocks.membershipFirst, findUnique: mocks.membershipUnique },
  schoolMembershipRole: { findMany: mocks.roles },
  user: { findUnique: mocks.user },
  schoolAthleteMembership: { findFirst: mocks.athleteMembership },
  coachProfile: { findUnique: mocks.coachProfile },
  coachSchoolMembership: { findFirst: mocks.coachMembership },
} }));

import { GET } from "@/app/api/schools/[id]/members/[membershipId]/route";

const now = new Date("2026-09-16T12:00:00Z");
const context = { params: Promise.resolve({ id: "school", membershipId: "member" }) };
const manager = {
  id: "manager", schoolId: "school", userId: "owner", status: "ACTIVE",
  startedAt: now, endedAt: null, createdAt: now, updatedAt: now,
};
const target = { ...manager, id: "member", userId: "athlete" };
const request = () => new Request("http://localhost/api/schools/school/members/member");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.SCHOOL_MODULE_ENABLED = "true";
  mocks.auth.mockResolvedValue({ user: { id: "owner" } });
  mocks.school.mockResolvedValue({ id: "school", ownerUserId: "owner" });
  mocks.membershipFirst.mockResolvedValue(manager);
  mocks.membershipUnique.mockResolvedValue(target);
  mocks.roles.mockResolvedValue([{ id: "r", membershipId: "manager", role: "OWNER", createdAt: now }]);
  mocks.user.mockResolvedValue({
    id: "athlete", name: "Atleta", email: "atleta@example.com", image: null,
    status: "ACTIVE", createdAt: now,
    profile: { phoneE164: "+5511987654321" },
    address: { postalCode: "01310-100", street: "Av. Paulista", number: "1000",
      complement: null, district: "Bela Vista", city: "São Paulo", state: "SP", country: "Brasil" },
  });
  mocks.athleteMembership.mockResolvedValue(null);
  mocks.coachProfile.mockResolvedValue(null);
  mocks.coachMembership.mockResolvedValue(null);
});

it("returns contact data for a manager", async () => {
  const response = await GET(request(), context);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.user).toMatchObject({ email: "atleta@example.com", phoneE164: "+5511987654321" });
  expect(body.user.address).toMatchObject({ city: "São Paulo" });
});

it("never exposes the CPF of the member", async () => {
  const body = await (await GET(request(), context)).json();
  expect(JSON.stringify(body)).not.toMatch(/cpf/i);
});

it("rejects an anonymous caller before reading the member", async () => {
  mocks.auth.mockResolvedValue(null);
  const response = await GET(request(), context);
  expect(response.status).toBe(401);
  expect(mocks.membershipUnique).not.toHaveBeenCalled();
});

it("rejects a caller who cannot manage members", async () => {
  mocks.membershipFirst.mockResolvedValue(null);
  const response = await GET(request(), context);
  expect(response.status).toBe(403);
  expect(mocks.membershipUnique).not.toHaveBeenCalled();
});

it("refuses to read a membership of another school through this URL", async () => {
  mocks.membershipUnique.mockResolvedValue({ ...target, schoolId: "other-school" });
  const response = await GET(request(), context);
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ code: "SCHOOL_MEMBERSHIP_NOT_FOUND" });
  expect(mocks.user).not.toHaveBeenCalled();
});

it("flags the school owner so the UI can protect the last owner", async () => {
  mocks.membershipUnique.mockResolvedValue({ ...target, userId: "owner" });
  const body = await (await GET(request(), context)).json();
  expect(body.isOwner).toBe(true);
});

it("hides the module behind its feature flag", async () => {
  mocks.env.SCHOOL_MODULE_ENABLED = "false";
  const response = await GET(request(), context);
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ code: "SCHOOL_MODULE_DISABLED" });
});
