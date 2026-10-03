/**
 * SAM-56 — POST /api/jobs/follow-ups: sends the reminders that are due
 * (idempotent, limited batch, one failure never stops the others). For an
 * external scheduler: protected by FOLLOW_UP_ADMIN_KEY via
 * `Authorization: Bearer` or `x-admin-key`, never a user session — the same
 * shape as the Garmin/Strava/marketplace job routes.
 */
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { RunFollowUpReminders } from "@/modules/school/application/follow-up-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const expectedKey = env.FOLLOW_UP_ADMIN_KEY;
  if (!expectedKey) return false;
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : null;
  const adminKey = request.headers.get("x-admin-key")?.trim();
  return bearer === expectedKey || adminKey === expectedKey;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? "200");
  const summary = await new RunFollowUpReminders(prisma).execute({ limit: Number.isFinite(limit) ? limit : 200 });
  return Response.json(summary);
}
