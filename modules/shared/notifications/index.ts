import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

/**
 * SAM-29 — in-app notifications, provider-agnostic.
 *
 * A use case calls `notify` with the transaction client it is already using,
 * so the notification commits with the state change and never without it
 * (architecture/escola-domain-events.md). Nothing here talks to an external
 * channel; WhatsApp/e-mail delivery would read these rows through an outbox.
 */
export const UserNotificationKind = {
  SCHOOL_REQUEST_APPROVED: "SCHOOL_REQUEST_APPROVED",
  SCHOOL_REQUEST_REJECTED: "SCHOOL_REQUEST_REJECTED",
  COACH_REQUEST_ACCEPTED: "COACH_REQUEST_ACCEPTED",
  COACH_REQUEST_REJECTED: "COACH_REQUEST_REJECTED",
  COACH_LEFT_SCHOOL: "COACH_LEFT_SCHOOL",
  COACH_JOINED_SCHOOL: "COACH_JOINED_SCHOOL",
  WORKOUT_REQUEST_DECIDED: "WORKOUT_REQUEST_DECIDED",
  WORKOUT_CHANGE_DECIDED: "WORKOUT_CHANGE_DECIDED",
  WORKOUT_REVIEWED: "WORKOUT_REVIEWED",
  NEW_COACH_ASSIGNMENT_REQUEST: "NEW_COACH_ASSIGNMENT_REQUEST",
  NEW_SCHOOL_REQUEST: "NEW_SCHOOL_REQUEST",
  // SAM-30 — athlete transfers between independent coaching and a school.
  COACH_TRANSFER_PROPOSED: "COACH_TRANSFER_PROPOSED",
  COACH_TRANSFER_CONFIRMED: "COACH_TRANSFER_CONFIRMED",
} as const;
export type UserNotificationKind = (typeof UserNotificationKind)[keyof typeof UserNotificationKind];

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const notifyInputSchema = z.strictObject({
  userId: id,
  kind: z.enum(UserNotificationKind),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(1000),
  /** Where the user acts on it, in the right context (`/app/...`, `/professor/...`, `/escola/<id>/...`). */
  href: z.string().trim().min(1).max(500).regex(/^\//, "href must be a relative path").nullish().transform((value) => value ?? null),
  payload: z.record(z.string(), z.unknown()).nullish().transform((value) => value ?? null),
});
export type NotifyInput = z.input<typeof notifyInputSchema>;

export interface UserNotificationView {
  id: string;
  kind: UserNotificationKind;
  title: string;
  body: string;
  href: string | null;
  readAt: Date | null;
  createdAt: Date;
}

type NotificationClient = Pick<PrismaClient, "userNotification"> | Prisma.TransactionClient;

/** Test doubles for older use cases may not model the table; writing nothing there is the tolerant choice. */
function tableOf(db: NotificationClient) {
  return (db as Partial<Pick<PrismaClient, "userNotification">>).userNotification ?? null;
}

export class NotificationService {
  constructor(private readonly db: NotificationClient, private readonly clock: () => Date = () => new Date()) {}

  /** One notification, inside the caller's transaction. Returns null when the client has no notification table (test doubles). */
  async notify(raw: NotifyInput) {
    const table = tableOf(this.db);
    if (!table) return null;
    const input = notifyInputSchema.parse(raw);
    return table.create({
      data: {
        id: randomUUID(),
        userId: input.userId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        href: input.href,
        payload: (input.payload ?? undefined) as Prisma.InputJsonValue | undefined,
        createdAt: this.clock(),
      },
    });
  }

  /** The same notification to several users (fan-out), e.g. every manager of a school. Duplicated ids are collapsed. */
  async notifyMany(userIds: readonly string[], raw: Omit<NotifyInput, "userId">) {
    const table = tableOf(this.db);
    if (!table) return 0;
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return 0;
    const inputs = unique.map((userId) => notifyInputSchema.parse({ ...raw, userId }));
    const now = this.clock();
    const { count } = await table.createMany({
      data: inputs.map((input) => ({
        id: randomUUID(),
        userId: input.userId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        href: input.href,
        payload: (input.payload ?? undefined) as Prisma.InputJsonValue | undefined,
        createdAt: now,
      })),
    });
    return count;
  }

  async countUnread(userId: string): Promise<number> {
    const table = tableOf(this.db);
    if (!table) return 0;
    return table.count({ where: { userId: id.parse(userId), readAt: null } });
  }

  async list(userId: string, options: { unreadOnly?: boolean; limit?: number } = {}): Promise<UserNotificationView[]> {
    const table = tableOf(this.db);
    if (!table) return [];
    const limit = z.number().int().min(1).max(100).default(20).parse(options.limit);
    const rows = await table.findMany({
      where: { userId: id.parse(userId), ...(options.unreadOnly ? { readAt: null } : {}) },
      select: { id: true, kind: true, title: true, body: true, href: true, readAt: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    });
    return rows.map((row) => ({ ...row, kind: row.kind as UserNotificationKind }));
  }

  /** Marks one of the user's notifications read; another user's id is simply not found (0). */
  async markRead(userId: string, notificationId: string): Promise<number> {
    const table = tableOf(this.db);
    if (!table) return 0;
    const { count } = await table.updateMany({
      where: { id: id.parse(notificationId), userId: id.parse(userId), readAt: null },
      data: { readAt: this.clock() },
    });
    return count;
  }

  async markAllRead(userId: string): Promise<number> {
    const table = tableOf(this.db);
    if (!table) return 0;
    const { count } = await table.updateMany({ where: { userId: id.parse(userId), readAt: null }, data: { readAt: this.clock() } });
    return count;
  }
}
