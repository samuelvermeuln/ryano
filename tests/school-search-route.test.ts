import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), findMany: vi.fn(), env: { SCHOOL_MODULE_ENABLED: "true" },
}));
vi.mock("@/server/env", () => ({ env: mocks.env }));
vi.mock("@/server/auth", () => ({ auth: mocks.auth }));
vi.mock("@/server/db", () => ({ prisma: { school: { findMany: mocks.findMany } } }));

import { GET } from "@/app/api/schools/search/route";

const request = (query = "q=Escola") => new Request(`http://localhost/api/schools/search?${query}`);
const school = {
  id: "school-a", slug: "escola-a", name: "Escola A", description: null, logoUrl: null,
  joinPolicy: "REQUIRE_APPROVAL", coachSelectionPolicy: "ADMIN_ASSIGNS",
  status: "ACTIVE", ownerUserId: "private-owner", createdAt: new Date(), updatedAt: new Date(),
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.env.SCHOOL_MODULE_ENABLED = "true";
  mocks.auth.mockRejectedValue(new Error("Public search must not authenticate"));
  mocks.findMany.mockResolvedValue([school]);
});

it("returns public discovery fields and defaults pagination without authentication [T092]", async () => {
  const response = await GET(request("q=%20Escola%20"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    items: [{ id: school.id, slug: school.slug, name: school.name, description: null, logoUrl: null,
      joinPolicy: school.joinPolicy, coachSelectionPolicy: school.coachSelectionPolicy }],
    nextCursor: null,
  });
  expect(mocks.auth).not.toHaveBeenCalled();
  expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ status: "ACTIVE", name: { contains: "Escola", mode: "insensitive" } }),
    take: 21,
  }));
});

it("round-trips the opaque cursor using the requested page size [T092]", async () => {
  mocks.findMany.mockResolvedValueOnce([school, { ...school, id: "school-b" }]);
  const first = await GET(request("q=Escola&limit=1"));
  const page = await first.json();
  expect(page.items).toHaveLength(1);
  expect(page.nextCursor).toEqual(expect.any(String));
  mocks.findMany.mockResolvedValueOnce([]);
  const second = await GET(request(`q=Escola&limit=1&cursor=${encodeURIComponent(page.nextCursor)}`));
  expect(second.status).toBe(200);
  expect(await second.json()).toEqual({ items: [], nextCursor: null });
  expect(mocks.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 2 }));
});

it.each(["", "q=", "q=%20", "q=Escola&limit=0", "q=Escola&limit=101", "q=Escola&limit=1.5",
  "q=Escola&limit=abc", "q=Escola&cursor=bad!", "q=Escola&ownerUserId=private"])(
  "rejects invalid query %s before database access [T092]", async (query) => {
    const response = await GET(request(query));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.findMany).not.toHaveBeenCalled();
  },
);

it("gates discovery before query parsing and database access [T092]", async () => {
  mocks.env.SCHOOL_MODULE_ENABLED = "false";
  const response = await GET(request(""));
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ code: "SCHOOL_MODULE_DISABLED" });
  expect(mocks.auth).not.toHaveBeenCalled();
  expect(mocks.findMany).not.toHaveBeenCalled();
});

it("masks database failures [T092]", async () => {
  mocks.findMany.mockRejectedValue(new Error("private database details"));
  const response = await GET(request());
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ code: "INTERNAL_ERROR", message: "Não foi possível concluir a operação." });
});
