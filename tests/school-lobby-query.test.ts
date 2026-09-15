import { expect, it, vi } from "vitest";
import { SchoolLobbyQuery } from "@/modules/school/infrastructure/school-lobby-query";

it("queries derived lobby with scoped anti-join and stable chronological pagination [T067]", async () => {
  const enteredLobbyAt = new Date("2026-09-11T10:00:00Z");
  const row = { id: "membership-a", athleteId: "athlete", name: "Athlete", enteredLobbyAt, lastCoachId: null };
  const query = vi.fn().mockResolvedValue([row, { ...row, id: "membership-b" }]);
  const lobby = new SchoolLobbyQuery({ $queryRaw: query } as never);
  const first = await lobby.listBySchool("school", { limit: 1 });
  expect(first.items).toEqual([row]);
  expect(first.nextCursor).toBeTruthy();
  const sql = query.mock.calls[0][0];
  expect(sql.sql).toContain("NOT EXISTS");
  expect(sql.sql).toContain('active."schoolId" = membership."schoolId"');
  expect(sql.sql).toContain('ORDER BY "enteredLobbyAt" ASC, id ASC');
  expect(sql.values).toContain("school");
  query.mockResolvedValue([]);
  expect(await lobby.listBySchool("school", { cursor: first.nextCursor! })).toEqual({ items: [], nextCursor: null });
  expect(query.mock.calls[1][0].values).toContainEqual(enteredLobbyAt);
});
it("rejects malformed pagination before querying [T067]", async () => {
  const query = vi.fn();
  const lobby = new SchoolLobbyQuery({ $queryRaw: query } as never);
  await expect(lobby.listBySchool("school", { cursor: "broken" })).rejects.toMatchObject({ status: 400 });
  await expect(lobby.listBySchool("school", { limit: 101 })).rejects.toMatchObject({ status: 400 });
  expect(query).not.toHaveBeenCalled();
});
