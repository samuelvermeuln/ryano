import { NextResponse } from "next/server";

import { auth } from "@/server/auth";
import { assertRateLimit, isRateLimitError } from "@/server/rate-limit";
import { syncGarminForUser } from "@/server/services/garmin-service";

export async function POST() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    await assertRateLimit(`api-garmin-sync:${session.user.id}`, 10, 1000 * 60 * 10);
    const result = await syncGarminForUser(session.user.id);

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: isRateLimitError(error) ? "RATE_LIMIT_EXCEEDED" : error instanceof Error ? error.message : "GARMIN_SYNC_FAILED" },
      { status: isRateLimitError(error) ? 429 : 400 },
    );
  }
}
