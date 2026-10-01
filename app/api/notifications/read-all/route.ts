import { notificationResponse, notifications } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** SAM-29 — marks every unread notification of the signed-in user as read. */
export function POST() {
  return notificationResponse(async (userId) => ({ updated: await notifications.markAllRead(userId) }));
}
