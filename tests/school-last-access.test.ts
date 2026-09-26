import { expect, it, vi } from "vitest";

import { findLastAccess } from "@/modules/school/infrastructure/last-access";

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const now = new Date("2026-09-16T12:00:00Z");

function db(session: { expires: Date } | null) {
  return { session: { findFirst: vi.fn().mockResolvedValue(session) } } as never;
}

it("derives the last access by subtracting the session max age from the expiry", async () => {
  const expires = new Date(now.getTime() + MAX_AGE_MS - 60_000);
  await expect(findLastAccess(db({ expires }), "user", now)).resolves.toEqual({
    at: new Date(expires.getTime() - MAX_AGE_MS),
    hasActiveSession: true,
  });
});

it("reports no active session once the row has expired", async () => {
  const expires = new Date(now.getTime() - 1000);
  const result = await findLastAccess(db({ expires }), "user", now);
  expect(result.hasActiveSession).toBe(false);
  expect(result.at).toEqual(new Date(expires.getTime() - MAX_AGE_MS));
});

it("returns an unknown last access when no session row exists", async () => {
  await expect(findLastAccess(db(null), "user", now)).resolves.toEqual({
    at: null,
    hasActiveSession: false,
  });
});

it("reads the newest session, so several devices do not hide the latest access", async () => {
  const client = db({ expires: new Date(now.getTime() + MAX_AGE_MS) });
  await findLastAccess(client, "user", now);
  expect((client as unknown as { session: { findFirst: ReturnType<typeof vi.fn> } }).session.findFirst)
    .toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user" },
      orderBy: { expires: "desc" },
    }));
});
