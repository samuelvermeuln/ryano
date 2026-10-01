import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { SearchSchools } from "@/modules/school/application/search-schools";
import { createSchool } from "@/modules/school/domain/school";

function setup() {
  const findMany = vi.fn().mockResolvedValue([]);
  const db = { school: { findMany } } as unknown as Pick<PrismaClient, "school">;
  return { findMany, search: new SearchSchools(db) };
}

const textMatch = (text: string) => ({
  OR: [{ name: { contains: text, mode: "insensitive" } }, { city: { contains: text, mode: "insensitive" } }],
});
const athleteCount = { _count: { select: { athleteMemberships: { where: { status: "ACTIVE" } } } } };

describe("SearchSchools [T091, SAM-24]", () => {
  it("searches active schools by name or city, case-insensitively, exposing only public fields", async () => {
    const { findMany, search } = setup();
    const school = createSchool({
      id: "school-a", slug: "aqua", name: "Aqua", ownerUserId: "private-owner",
      city: "Campinas", state: "SP", sportTypes: ["swim"], email: "contato@aqua.test", phoneE164: "+5519999990000",
    }, new Date());
    findMany.mockResolvedValue([{ ...school, _count: { athleteMemberships: 12 } }]);
    const result = await search.execute({ q: "  AQUA  " });
    expect(result).toEqual({
      items: [{
        id: school.id, slug: school.slug, name: school.name, description: null, logoUrl: null,
        city: "Campinas", state: "SP", sportTypes: ["swim"], activeAthleteCount: 12,
        joinPolicy: school.joinPolicy, coachSelectionPolicy: school.coachSelectionPolicy,
      }],
      nextCursor: null,
    });
    // Contact data and ownership never travel in the discovery list.
    expect(JSON.stringify(result)).not.toMatch(/private-owner|contato@aqua|5519999990000/);
    expect(findMany).toHaveBeenCalledWith({
      where: { status: "ACTIVE", AND: [textMatch("AQUA")] },
      include: athleteCount,
      orderBy: [{ name: "asc" }, { id: "asc" }], take: 21,
    });
  });

  it("defaults the athlete count to zero when the row carries no aggregate", async () => {
    const { findMany, search } = setup();
    findMany.mockResolvedValue([createSchool({ id: "a", slug: "a", name: "Aqua", ownerUserId: "owner" }, new Date())]);
    const result = await search.execute({ q: "Aqua" });
    expect(result.items[0]!.activeAthleteCount).toBe(0);
  });

  it("preserves both sort keys across pages with duplicate school names", async () => {
    const { findMany, search } = setup();
    const schools = ["a", "b"].map((id) => createSchool({ id, slug: id, name: "Aqua", ownerUserId: "owner" }, new Date()));
    findMany.mockResolvedValueOnce(schools).mockResolvedValueOnce([schools[1]]);
    const first = await search.execute({ q: "Aqua", limit: 1 });
    expect(first.items.map((school) => school.id)).toEqual(["a"]);
    expect(first.nextCursor).toBeTruthy();
    const last = await search.execute({ q: "Aqua", limit: 1, cursor: first.nextCursor });
    expect(last.items.map((school) => school.id)).toEqual(["b"]);
    expect(last.nextCursor).toBeNull();
    // The cursor is its own OR group, kept apart from the name/city match.
    expect(findMany.mock.calls[1][0]).toMatchObject({
      where: { AND: [textMatch("Aqua"), { OR: [{ name: { gt: "Aqua" } }, { name: "Aqua", id: { gt: "a" } }] }] }, take: 2,
    });
  });

  it.each([
    {}, { q: " " }, { q: "x".repeat(201) }, { q: "Aqua", limit: 0 },
    { q: "Aqua", limit: 101 }, { q: "Aqua", limit: 1.5 },
    { q: "Aqua", status: "INACTIVE" }, { q: "Aqua", cursor: "not-a-cursor" },
    { q: "Aqua", cursor: Buffer.from('{}').toString("base64url") },
    { q: "Aqua", cursor: Buffer.from(JSON.stringify({ name: "Aqua", id: " a " })).toString("base64url") },
  ])("rejects invalid inputs before querying: %j", async (input) => {
    const { findMany, search } = setup();
    await expect(search.execute(input)).rejects.toMatchObject({ name: "ZodError" });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("returns an empty final page without invented totals", async () => {
    const { search } = setup();
    expect(await search.execute({ q: "Absent", limit: 100 })).toEqual({ items: [], nextCursor: null });
  });
});
