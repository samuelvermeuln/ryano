import { NextResponse } from "next/server";

import { auth } from "@/server/auth";
import { disconnectGarminForUser } from "@/modules/garmin";

export async function DELETE() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  await disconnectGarminForUser(session.user.id);

  return NextResponse.json({ ok: true, status: "disconnected" });
}
