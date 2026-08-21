import { NextResponse } from "next/server";

import { auth } from "@/server/auth";
import { assertRateLimit, isRateLimitError } from "@/server/rate-limit";
import { connectGarminForUser } from "@/server/services/garmin-service";
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

    return NextResponse.json({ ok: true, status: "connected" });
  } catch (error) {
    return NextResponse.json(
      { error: isRateLimitError(error) ? "RATE_LIMIT_EXCEEDED" : error instanceof Error ? error.message : "GARMIN_CONNECT_FAILED" },
      { status: isRateLimitError(error) ? 429 : 400 },
    );
  }
}
