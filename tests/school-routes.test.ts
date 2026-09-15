import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SchoolService } from "@/modules/school/application/school-service";

const state = vi.hoisted(() => ({ auth: vi.fn(), env: { SCHOOL_MODULE_ENABLED: "true" } }));
vi.mock("@/server/auth", () => ({ auth: state.auth }));
vi.mock("@/server/env", () => ({ env: state.env }));
vi.mock("@/server/db", () => ({ prisma: db }));

const url = process.env.SCHOOL_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (parsed.hostname !== "127.0.0.1" || parsed.port !== "55439" || !/^\/school_(dev|shadow|test)$/.test(parsed.pathname)) {
    throw new Error("School database tests require the isolated local PostgreSQL instance");
  }
}
const db = url ? new PrismaClient({ datasourceUrl: url }) : null;
afterAll(async () => { await db?.$disconnect(); });

describe.skipIf(!db)("School HTTP contract [T018/T019]", () => {
  let collection: typeof import("@/app/api/schools/route");
  let detail: typeof import("@/app/api/schools/[id]/route");
  let deactivate: typeof import("@/app/api/schools/[id]/deactivate/route");
  let reactivate: typeof import("@/app/api/schools/[id]/reactivate/route");
  let owner: string;
  let outsider: string;
  let schoolId: string;
  const now = new Date("2026-09-08T12:00:00Z");
  const context = (id = schoolId) => ({ params: Promise.resolve({ id }) });
  const request = (method: string, body?: unknown) => new Request("http://localhost/api/schools", {
    method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
  });
  const operations = () => [
    () => collection.POST(request("POST", { name: "New" })),
    () => detail.GET(request("GET"), context()),
    () => detail.PATCH(request("PATCH", { name: "Changed" }), context()),
    () => deactivate.POST(request("POST"), context()),
    () => reactivate.POST(request("POST"), context()),
  ];

  beforeAll(async () => {
    collection = await import("@/app/api/schools/route");
    detail = await import("@/app/api/schools/[id]/route");
    deactivate = await import("@/app/api/schools/[id]/deactivate/route");
    reactivate = await import("@/app/api/schools/[id]/reactivate/route");
  });
  beforeEach(async () => {
    owner = `routes-${crypto.randomUUID()}`;
    outsider = `${owner}-other`;
    state.env.SCHOOL_MODULE_ENABLED = "true";
    state.auth.mockReset().mockResolvedValue({ user: { id: owner } });
    await db!.user.createMany({ data: [owner, outsider].map((id) => ({ id, email: `${id}@example.invalid`, status: "ACTIVE" })) });
    schoolId = (await new SchoolService(db!, () => now).create(owner, { name: "Aqua", slug: owner })).id;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
  });
  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    await db!.school.deleteMany({ where: { ownerUserId: { in: [owner, outsider] } } });
    await db!.user.deleteMany({ where: { id: { in: [owner, outsider] } } });
  });

  it("gates every endpoint before authentication when the module is disabled", async () => {
    state.env.SCHOOL_MODULE_ENABLED = "false";
    for (const operation of operations()) {
      const response = await operation();
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: "SCHOOL_MODULE_DISABLED" });
    }
    expect(state.auth).not.toHaveBeenCalled();
  });

  it("requires an authenticated session for every endpoint", async () => {
    state.auth.mockResolvedValue(null);
    for (const operation of operations()) {
      const response = await operation();
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code: "UNAUTHORIZED" });
    }
  });

  it("creates with the session owner and serializes timestamps as ISO strings", async () => {
    const response = await collection.POST(request("POST", { name: " New school ", slug: `${owner}-new` }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ name: "New school", ownerUserId: owner, createdAt: now.toISOString() });
    const duplicate = await collection.POST(request("POST", { name: "Duplicate", slug: owner }));
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({ code: "SCHOOL_SLUG_TAKEN" });
  });

  it("reads an existing school for an authenticated user", async () => {
    const response = await detail.GET(request("GET"), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: schoolId, name: "Aqua", ownerUserId: owner, status: "ACTIVE", createdAt: now.toISOString(),
    });
  });

  it("rejects owner, roles and status injection and malformed JSON", async () => {
    for (const body of [{ name: "New", ownerUserId: outsider }, { name: "New", roles: ["OWNER"] }, { name: "New", status: "INACTIVE" }]) {
      expect((await collection.POST(request("POST", body))).status).toBe(400);
      expect((await detail.PATCH(request("PATCH", body), context())).status).toBe(400);
    }
    expect((await detail.PATCH(request("PATCH", {}), context())).status).toBe(400);
    for (const operation of [
      () => collection.POST(new Request("http://localhost", { method: "POST", body: "{" })),
      () => detail.PATCH(new Request("http://localhost", { method: "PATCH", body: "{" }), context()),
    ]) {
      const response = await operation();
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    }
    expect((await deactivate.POST(request("POST", { ownerUserId: owner }), context())).status).toBe(400);
    expect((await reactivate.POST(request("POST", { roles: ["OWNER"] }), context())).status).toBe(400);
  });

  it("rejects non-owner mutations even with global ADMIN", async () => {
    await db!.user.update({ where: { id: outsider }, data: { role: "ADMIN" } });
    state.auth.mockResolvedValue({ user: { id: outsider, role: "ADMIN" } });
    for (const operation of operations().slice(2)) {
      const response = await operation();
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("updates, deactivates and reactivates with idempotent timestamps", async () => {
    const updated = await detail.PATCH(request("PATCH", { name: "Aqua II" }), context());
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ id: schoolId, name: "Aqua II", ownerUserId: owner });
    vi.setSystemTime(new Date("2026-09-09T12:00:00Z"));
    const first = await deactivate.POST(request("POST"), context());
    expect(first.status).toBe(200);
    const inactive = await first.json();
    expect(inactive).toMatchObject({ status: "INACTIVE", deactivatedAt: "2026-09-09T12:00:00.000Z" });
    vi.setSystemTime(new Date("2026-09-10T12:00:00Z"));
    expect(await (await deactivate.POST(request("POST", {}), context())).json()).toEqual(inactive);
    const activeResponse = await reactivate.POST(request("POST"), context());
    expect(activeResponse.status).toBe(200);
    const active = await activeResponse.json();
    expect(active).toMatchObject({ status: "ACTIVE", deactivatedAt: null, createdAt: now.toISOString() });
    vi.setSystemTime(new Date("2026-09-11T12:00:00Z"));
    expect(await (await reactivate.POST(request("POST"), context())).json()).toEqual(active);
  });

  it("returns stable 404 responses for absent or malformed school IDs", async () => {
    for (const id of ["missing-school", " ", "x".repeat(257)]) {
      for (const operation of [
        () => detail.GET(request("GET"), context(id)),
        () => detail.PATCH(request("PATCH", { name: "Changed" }), context(id)),
        () => deactivate.POST(request("POST"), context(id)),
        () => reactivate.POST(request("POST"), context(id)),
      ]) {
        const response = await operation();
        expect(response.status).toBe(404);
        expect(await response.json()).toMatchObject({ code: "SCHOOL_NOT_FOUND" });
      }
    }
  });

  it("hides unexpected database errors", async () => {
    vi.spyOn(db!.school, "findUnique").mockRejectedValueOnce(new Error("private database connection details"));
    const response = await detail.GET(request("GET"), context());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ code: "INTERNAL_ERROR", message: "Não foi possível concluir a operação." });
  });
});
