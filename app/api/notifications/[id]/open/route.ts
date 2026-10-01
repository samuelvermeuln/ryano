import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { notifications } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * SAM-29 — a plain link target for the notifications page: marks the
 * notification read and redirects to its `href` (or to the list when it has
 * none). Only the owner's rows resolve; anyone else lands on the list.
 */
export async function GET(request: Request, context: RouteContext) {
  const session = await auth();
  const origin = new URL(request.url).origin;
  if (!session?.user?.id) return Response.redirect(new URL("/entrar", origin), 303);

  const { id } = await context.params;
  const row = await prisma.userNotification.findFirst({ where: { id, userId: session.user.id }, select: { href: true } });
  if (row) await notifications.markRead(session.user.id, id);
  const target = row?.href && row.href.startsWith("/") ? row.href : "/app/notificacoes";
  return Response.redirect(new URL(target, origin), 303);
}
