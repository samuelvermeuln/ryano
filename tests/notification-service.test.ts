/**
 * SAM-29 — NotificationService: writes through the caller's transaction client,
 * fans out to several users, and reads/marks only the owner's rows.
 */
import { describe, expect, it, vi } from "vitest";
import { NotificationService, UserNotificationKind, notifyInputSchema } from "@/modules/shared/notifications";

const now = new Date("2026-10-01T12:00:00Z");
type Row = Record<string, unknown>;

function fixture() {
  const rows: Row[] = [];
  const table = {
    create: vi.fn(async ({ data }: { data: Row }) => { rows.push(data); return data; }),
    createMany: vi.fn(async ({ data }: { data: Row[] }) => { rows.push(...data); return { count: data.length }; }),
    count: vi.fn(async ({ where }: { where: Row }) => rows.filter((row) => row.userId === where.userId && row.readAt == null).length),
    findMany: vi.fn(async ({ where, take }: { where: { userId: string; readAt?: null }; take: number }) =>
      rows.filter((row) => row.userId === where.userId && (where.readAt === undefined || row.readAt == null)).slice(0, take)),
    updateMany: vi.fn(async ({ where, data }: { where: { id?: string; userId: string; readAt: null }; data: Row }) => {
      const hits = rows.filter((row) => row.userId === where.userId && row.readAt == null && (!where.id || row.id === where.id));
      for (const hit of hits) Object.assign(hit, data);
      return { count: hits.length };
    }),
  };
  return { rows, table, service: new NotificationService({ userNotification: table } as never, () => now) };
}

describe("NotificationService [SAM-29]", () => {
  it("validates and writes one notification with a relative href", async () => {
    const { service, rows } = fixture();
    await service.notify({ userId: "user:a", kind: UserNotificationKind.SCHOOL_REQUEST_APPROVED, title: " Você entrou ", body: "Bem-vindo", href: "/atleta/s1", payload: { schoolId: "s1" } });
    expect(rows[0]).toMatchObject({ userId: "user:a", kind: "SCHOOL_REQUEST_APPROVED", title: "Você entrou", href: "/atleta/s1", payload: { schoolId: "s1" }, createdAt: now });
    expect(typeof rows[0]!.id).toBe("string");
  });

  it("rejects absolute hrefs, unknown kinds and empty titles before writing", () => {
    for (const bad of [
      { userId: "u", kind: "SCHOOL_REQUEST_APPROVED", title: "t", body: "b", href: "https://evil.example" },
      { userId: "u", kind: "NOPE", title: "t", body: "b" },
      { userId: "u", kind: "SCHOOL_REQUEST_APPROVED", title: " ", body: "b" },
      { userId: " u", kind: "SCHOOL_REQUEST_APPROVED", title: "t", body: "b" },
    ]) {
      expect(() => notifyInputSchema.parse(bad)).toThrow();
    }
  });

  it("fans out to distinct users at once and skips an empty audience", async () => {
    const { service, table, rows } = fixture();
    expect(await service.notifyMany([], { kind: UserNotificationKind.COACH_LEFT_SCHOOL, title: "t", body: "b" })).toBe(0);
    expect(table.createMany).not.toHaveBeenCalled();
    const count = await service.notifyMany(["user:a", "user:b", "user:a"], { kind: UserNotificationKind.COACH_LEFT_SCHOOL, title: "t", body: "b", href: "/app/professor" });
    expect(count).toBe(2);
    expect(rows.map((row) => row.userId)).toEqual(["user:a", "user:b"]);
  });

  it("counts, lists and marks only the owner's rows", async () => {
    const { service } = fixture();
    await service.notify({ userId: "user:a", kind: UserNotificationKind.WORKOUT_REVIEWED, title: "a1", body: "b" });
    await service.notify({ userId: "user:a", kind: UserNotificationKind.WORKOUT_REVIEWED, title: "a2", body: "b" });
    await service.notify({ userId: "user:b", kind: UserNotificationKind.WORKOUT_REVIEWED, title: "b1", body: "b" });
    expect(await service.countUnread("user:a")).toBe(2);
    const [first] = await service.list("user:a", { unreadOnly: true });
    expect(await service.markRead("user:b", first!.id as string)).toBe(0);
    expect(await service.markRead("user:a", first!.id as string)).toBe(1);
    expect(await service.countUnread("user:a")).toBe(1);
    expect(await service.markAllRead("user:a")).toBe(1);
    expect(await service.countUnread("user:a")).toBe(0);
    expect(await service.countUnread("user:b")).toBe(1);
  });

  it("writes nothing on a client without the table (older test doubles) instead of throwing", async () => {
    const service = new NotificationService({} as never, () => now);
    await expect(service.notify({ userId: "u", kind: UserNotificationKind.WORKOUT_REVIEWED, title: "t", body: "b" })).resolves.toBeNull();
    await expect(service.notifyMany(["u"], { kind: UserNotificationKind.WORKOUT_REVIEWED, title: "t", body: "b" })).resolves.toBe(0);
    await expect(service.countUnread("u")).resolves.toBe(0);
  });
});
