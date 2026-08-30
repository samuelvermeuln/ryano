import { NextResponse } from "next/server";

import { auth } from "@/server/auth";
import { assertRateLimit, isRateLimitError } from "@/server/rate-limit";
import { connectGarminForUser, syncGarminForUser } from "@/modules/garmin";
import { dispatchPendingWhatsAppDeliveries } from "@/server/services/reporting";
import { garminConnectSchema } from "@/server/validators/integrations";

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const json = await request.json();
  const parsed = garminConnectSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "INVALID_INPUT" }, { status: 400 });
  }

  try {
    await assertRateLimit(`api-garmin-connect:${session.user.id}`, 5, 1000 * 60 * 10);
    await connectGarminForUser({
      userId: session.user.id,
      email: parsed.data.email,
      password: parsed.data.password,
      label: `ryvano-${session.user.id}`,
    });
    const syncResult = await syncGarminForUser(session.user.id, {
      postActivityReportMode: "latest-recent-new",
    });
    const dispatchSummary = await dispatchPendingWhatsAppDeliveries({
      userId: session.user.id,
      maxMessages: 1,
      delayBetweenMessagesSeconds: 0,
    });

    return NextResponse.json({
      ok: true,
      status: "connected",
      initialSync: syncResult,
      whatsappDispatch: dispatchSummary,
    });
  } catch (error) {
    return NextResponse.json(
      { error: isRateLimitError(error) ? "RATE_LIMIT_EXCEEDED" : error instanceof Error ? error.message : "GARMIN_CONNECT_FAILED" },
      { status: isRateLimitError(error) ? 429 : 400 },
    );
  }
}
