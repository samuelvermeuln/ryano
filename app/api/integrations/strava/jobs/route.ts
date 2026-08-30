import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/server/db";
import { env } from "@/server/env";
import {
  processPendingStravaWebhookEvents,
  runStravaRetentionCleanup,
  syncAllStravaUsers,
} from "@/modules/strava";

/**
 * Rota de JOBS do Strava (Task 8.1) — adapter fino que aciona, por trás de uma
 * chamada agendada (cron/worker), as três rotinas acionáveis do módulo Strava:
 *
 *   1. `processPendingStravaWebhookEvents()` — drena a fila de eventos de
 *      webhook PENDENTES (create/update/delete/deauthorization).
 *   2. `syncAllStravaUsers()` — sync incremental de todas as conexões STRAVA
 *      conectadas (isolando falhas por usuário).
 *   3. `runStravaRetentionCleanup()` — purga por TTL (cache/streams/webhooks).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SEGURANÇA — autorização (obrigatória): a rota NÃO é pública. Espelha o mesmo
 * mecanismo da rota de jobs do Garmin (`app/api/integrations/garmin/jobs`):
 * uma chave de administração enviada via `Authorization: Bearer <key>` OU no
 * header `x-admin-key`. A chave esperada é `STRAVA_ADMIN_KEY`; na ausência dela,
 * aceitamos `GARMIN_ADMIN_KEY` como CHAVE DE ADMIN/CRON COMPARTILHADA (o mesmo
 * agendador aciona ambos os providers). Se NENHUMA das duas estiver configurada,
 * a rota responde 401 e não executa nada — nunca há trigger de job sem
 * autenticação. Defina `STRAVA_ADMIN_KEY` no ambiente para uma chave dedicada.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ISOLAMENTO DE FALHAS (Req 18.2): CADA um dos três passos roda no seu próprio
 * `try/catch`. A falha de um passo NÃO aborta os demais — se o sync falhar por
 * completo, o cleanup e o processamento de webhooks ainda rodam, e vice-versa.
 * O resumo devolvido marca `ok` por passo e agrega os erros. Além disso, os jobs
 * do Garmin permanecem numa rota SEPARADA: um provider nunca interrompe o outro.
 *
 * _Requisitos: 18.1, 18.2, 18.3, 18.4_
 */

export const dynamic = "force-dynamic";

/** Resultado isolado de um passo do job. */
type StepResult<T> =
  | { ok: true; result: T }
  | { ok: false; error: string };

/** Executa um passo isolando qualquer exceção (Req 18.2). */
async function runStep<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<StepResult<T>> {
  try {
    const result = await fn();
    return { ok: true, result };
  } catch (error) {
    const message =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : error instanceof Error
          ? error.name
          : "UNKNOWN_ERROR";
    // Não vaza detalhes sensíveis: só o rótulo do passo e um código de erro.
    return { ok: false, error: `${label}:${message}` };
  }
}

export async function POST(request: Request) {
  return runStravaJobs(request);
}

export async function GET(request: Request) {
  return runStravaJobs(request);
}

async function runStravaJobs(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  // Passo 1: drena a fila de eventos de webhook pendentes.
  const webhookStep = await runStep("webhook", () =>
    processPendingStravaWebhookEvents(),
  );

  // Passo 2: sync incremental das conexões STRAVA conectadas.
  const syncStep = await runStep("sync", () => syncAllStravaUsers());

  // Passo 3: retenção/cleanup por TTL.
  const cleanupStep = await runStep("cleanup", () => runStravaRetentionCleanup());

  const errors = [webhookStep, syncStep, cleanupStep]
    .filter((step): step is { ok: false; error: string } => !step.ok)
    .map((step) => step.error);

  // Rastro operacional (best-effort; nunca derruba a resposta do job).
  await prisma.integrationEvent
    .create({
      data: {
        provider: "STRAVA",
        eventType: "strava.jobs.run",
        externalId: new Date().toISOString(),
        payload: {
          webhook: webhookStep,
          sync: syncStep,
          cleanup: cleanupStep,
          errors,
        } as unknown as Prisma.InputJsonObject,
      },
    })
    .catch(() => undefined);

  return NextResponse.json({
    ok: errors.length === 0,
    webhook: webhookStep,
    sync: syncStep,
    cleanup: cleanupStep,
    errors,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Autoriza a chamada por chave de admin (Bearer ou `x-admin-key`). Aceita
 * `STRAVA_ADMIN_KEY` (dedicada) ou, na ausência dela, `GARMIN_ADMIN_KEY` como
 * chave de admin/cron compartilhada. Sem nenhuma configurada → nega.
 */
function isAuthorized(request: Request) {
  const expectedKey = env.STRAVA_ADMIN_KEY ?? env.GARMIN_ADMIN_KEY;

  if (!expectedKey) {
    return false;
  }

  const authorization = request.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : null;
  const adminKey = request.headers.get("x-admin-key")?.trim();

  return bearer === expectedKey || adminKey === expectedKey;
}
