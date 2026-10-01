import { notificationResponse, notifications } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** SAM-29 — marks one of the user's notifications read; `{ updated: 0 }` when it is not theirs or already read. */
export function POST(_request: Request, context: RouteContext) {
  return notificationResponse(async (userId) => ({ updated: await notifications.markRead(userId, (await context.params).id) }));
}
