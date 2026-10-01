import { describe, expect, it, vi } from "vitest";
import { SearchCoaches } from "@/modules/school/application/search-coaches";

function setup() {
  const findMany = vi.fn().mockResolvedValue([]);
  const search = new SearchCoaches({ coachProfile: { findMany } } as never);
  return { findMany, search };
}

const row = {
  id: "coach:1", displayName: "Carlos Mendes", bio: "Natação",
  user: { image: "https://img/c.png", email: "prof.carlos@ryvano-e2e.test", profile: { phoneE164: "+5511999990000" } },
  schoolMemberships: [{ school: { id: "school:alpha", name: "Escola Alpha" } }],
  _count: { athleteAssignments: 3 },
};

describe("SearchCoaches [SAM-25]", () => {
  it("matches by name (contains) or exact e-mail, and never returns contact data", async () => {
    const { findMany, search } = setup();
    findMany.mockResolvedValue([row]);
    const result = await search.execute({ q: "  Prof.Carlos@Ryvano-E2E.test " });
    expect(result).toEqual({
      items: [{
        id: "coach:1", displayName: "Carlos Mendes", bio: "Natação", image: "https://img/c.png",
        schools: [{ id: "school:alpha", name: "Escola Alpha" }], activeAthleteCount: 3, sportTypes: [],
      }],
    });
    expect(JSON.stringify(result)).not.toMatch(/ryvano-e2e|5511999990000/);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        status: "ACTIVE",
        OR: [
          { displayName: { contains: "Prof.Carlos@Ryvano-E2E.test", mode: "insensitive" } },
          { user: { email: { equals: "prof.carlos@ryvano-e2e.test", mode: "insensitive" } } },
        ],
      },
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      take: 20,
    }));
  });

  // SAM-28 — `?sport=` narrows to coaches who declared that canonical sport.
  it("filters by declared sport when asked and returns the coach's sports", async () => {
    const { findMany, search } = setup();
    findMany.mockResolvedValue([{ ...row, sportTypes: ["swim", "run"] }]);
    const result = await search.execute({ q: "Carlos", sport: "swim" });
    expect(result.items[0]!.sportTypes).toEqual(["swim", "run"]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "ACTIVE", sportTypes: { has: "swim" } }),
    }));
  });

  it("only lists schools where the coach is active, not suspended, at an active school", async () => {
    const { findMany, search } = setup();
    await search.execute({ q: "Ana", limit: 5 });
    const args = findMany.mock.calls[0]![0] as { select: { schoolMemberships: { where: unknown } }; take: number };
    expect(args.select.schoolMemberships.where).toEqual({ status: "ACTIVE", endedAt: null, suspendedAt: null, school: { status: "ACTIVE" } });
    expect(args.take).toBe(5);
  });

  it.each([{}, { q: " " }, { q: "x".repeat(201) }, { q: "Ana", limit: 0 }, { q: "Ana", limit: 101 }, { q: "Ana", email: "x" }])(
    "rejects invalid inputs before querying: %j",
    async (input) => {
      const { findMany, search } = setup();
      await expect(search.execute(input)).rejects.toMatchObject({ name: "ZodError" });
      expect(findMany).not.toHaveBeenCalled();
    },
  );
});
