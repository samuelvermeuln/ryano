import { z } from "zod";
import { notificationResponse, notifications } from "./_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  unread: z.enum(["1", "true"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** SAM-29 — `GET /api/notifications?unread=1&limit=20` → `{ items, unreadCount }` for the signed-in user. */
export function GET(request: Request) {
  return notificationResponse(async (userId) => {
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const [items, unreadCount] = await Promise.all([
      notifications.list(userId, { unreadOnly: Boolean(query.unread), limit: query.limit }),
      notifications.countUnread(userId),
    ]);
    return { items, unreadCount };
  });
}
