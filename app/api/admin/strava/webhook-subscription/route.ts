/**
 * Rota administrativa de gestão da subscription de webhook do Strava (Task 7.2).
 *
 * Adapter FINO: delega toda a lógica às funções do módulo
 * (`@/modules/strava` → `webhooks/subscription`). A rota apenas:
 *   - autoriza o acesso (somente ADMIN — mesmo padrão das demais rotas em
 *     `app/api/admin/**`: sessão + `role === "ADMIN"`, senão 401);
 *   - mapeia métodos HTTP para as operações do módulo:
 *       - `GET`    → `viewStravaWebhookSubscription` (verificar);
 *       - `POST`   → `createStravaWebhookSubscription` (criar);
 *       - `DELETE` → `deleteStravaWebhookSubscription` (apagar; aceita `?id=`);
 *   - registra as MUTAÇÕES (create/delete) em `AdminAuditLog`;
 *   - traduz `StravaWebhookSubscriptionError` em respostas JSON seguras (sem
 *     vazar secrets/verify token).
 *
 * Por que uma rota admin (e não um script): mantém a operação acessível pelo
 * mesmo mecanismo de autorização já usado no painel administrativo, sem exigir
 * acesso ao shell do servidor. A subscription é ÚNICA por aplicação (Req 12.7),
 * então estas operações são raras e idempotentes.
 *
 * _Requisitos: 12.7, 20.1, 20.5_
 */

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import {
  createStravaWebhookSubscription,
  deleteStravaWebhookSubscription,
  StravaWebhookSubscriptionError,
  viewStravaWebhookSubscription,
} from "@/modules/strava";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { logger } from "@/server/logging/logger";

/** Garante ADMIN; retorna o id do admin ou uma resposta 401. */
async function requireAdminApi(): Promise<
  { ok: true; adminId: string } | { ok: false; response: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return {
      ok: false,
      response: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }),
    };
  }
  return { ok: true, adminId: session.user.id };
}

/** Traduz um erro do módulo em resposta JSON segura (nunca expõe secrets). */
function errorResponse(error: unknown): NextResponse {
  if (error instanceof StravaWebhookSubscriptionError) {
    const notConfigured =
      error.code === "STRAVA_SUBSCRIPTION_NOT_CONFIGURED" ||
      error.code === "STRAVA_SUBSCRIPTION_NO_CALLBACK_URL" ||
      error.code === "STRAVA_SUBSCRIPTION_NO_VERIFY_TOKEN";
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status: notConfigured ? 400 : 502 },
    );
  }
  logger.error("Strava subscription admin route unexpected error", {
    provider: "STRAVA",
    operation: "subscription_admin_route",
    status: "unexpected_error",
  });
  return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
}

/** Registra a mutação em AdminAuditLog (best-effort). */
async function audit(
  adminId: string,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await prisma.adminAuditLog
    .create({
      data: {
        actorUserId: adminId,
        action,
        entityType: "STRAVA_WEBHOOK_SUBSCRIPTION",
        entityId: "application",
        metadata: metadata as Prisma.InputJsonValue,
      },
    })
    .catch(() => undefined);
}

/** GET → verifica a subscription atual da aplicação. */
export async function GET(): Promise<Response> {
  const guard = await requireAdminApi();
  if (!guard.ok) {
    return guard.response;
  }

  try {
    const result = await viewStravaWebhookSubscription();
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST → cria a subscription (idempotente: retorna already-exists se houver). */
export async function POST(): Promise<Response> {
  const guard = await requireAdminApi();
  if (!guard.ok) {
    return guard.response;
  }

  try {
    const result = await createStravaWebhookSubscription();
    await audit(guard.adminId, "STRAVA_WEBHOOK_SUBSCRIPTION_CREATE", {
      status: result.status,
      subscriptionId: result.subscription.externalSubscriptionId,
    });
    return NextResponse.json(result, {
      status: result.status === "created" ? 201 : 200,
    });
  } catch (error) {
    await audit(guard.adminId, "STRAVA_WEBHOOK_SUBSCRIPTION_CREATE_FAILED", {
      code: error instanceof StravaWebhookSubscriptionError ? error.code : "UNKNOWN",
    });
    return errorResponse(error);
  }
}

/** DELETE → apaga a subscription (aceita `?id=` para forçar um id específico). */
export async function DELETE(request: Request): Promise<Response> {
  const guard = await requireAdminApi();
  if (!guard.ok) {
    return guard.response;
  }

  const id = new URL(request.url).searchParams.get("id") ?? undefined;

  try {
    const result = await deleteStravaWebhookSubscription(id);
    await audit(guard.adminId, "STRAVA_WEBHOOK_SUBSCRIPTION_DELETE", {
      status: result.status,
      subscriptionId:
        result.status === "deleted" ? result.externalSubscriptionId : null,
    });
    return NextResponse.json(result, {
      status: result.status === "deleted" ? 200 : 404,
    });
  } catch (error) {
    await audit(guard.adminId, "STRAVA_WEBHOOK_SUBSCRIPTION_DELETE_FAILED", {
      code: error instanceof StravaWebhookSubscriptionError ? error.code : "UNKNOWN",
    });
    return errorResponse(error);
  }
}
