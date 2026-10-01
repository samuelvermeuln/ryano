import { z } from "zod";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { NotificationService } from "@/modules/shared/notifications";

export const notifications = new NotificationService(prisma);

/** SAM-29 — session-scoped envelope; notifications belong to the account, not to a module flag. */
export async function notificationResponse(operation: (userId: string) => Promise<unknown>, status = 200) {
  try {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ code: "UNAUTHORIZED", message: "Entre na sua conta para continuar." }, { status: 401 });
    return Response.json(await operation(session.user.id), { status });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ code: "VALIDATION_ERROR", message: "Dados inválidos." }, { status: 400 });
    }
    return Response.json({ code: "INTERNAL_ERROR", message: "Não foi possível concluir a operação." }, { status: 500 });
  }
}
