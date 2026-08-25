import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { logger } from "@/server/logging/logger";
import { verifyWhatsAppActivation } from "@/server/services/whatsapp-activation";

const MAX_WEBHOOK_BYTES = 64 * 1024;

function getNestedString(record: Record<string, unknown> | null, keys: string[]) {
  let current: unknown = record;

  for (const key of keys) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }

    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === "string" ? current : null;
}

function parseSender(payload: Record<string, unknown>) {
  const data = (payload.data ?? null) as Record<string, unknown> | null;
  const key = (data?.key ?? null) as Record<string, unknown> | null;

  return (
    (typeof key?.participant === "string" ? key.participant : null) ??
    (typeof key?.remoteJid === "string" ? key.remoteJid : null) ??
    (typeof data?.from === "string" ? data.from : null) ??
    (typeof data?.sender === "string" ? data.sender : null) ??
    (typeof payload.sender === "string" ? payload.sender : null)
  );
}

function parseText(payload: Record<string, unknown>) {
  const data = (payload.data ?? null) as Record<string, unknown> | null;
  const message = (data?.message ?? null) as Record<string, unknown> | null;

  return (
    (typeof message?.conversation === "string" ? message.conversation : null) ??
    getNestedString(message, ["extendedTextMessage", "text"]) ??
    getNestedString(message, ["imageMessage", "caption"]) ??
    getNestedString(message, ["videoMessage", "caption"]) ??
    (typeof data?.body === "string" ? data.body : null) ??
    (typeof payload.body === "string" ? payload.body : null)
  );
}

function extractToken(text: string) {
  const match = text.match(/[A-Fa-f0-9]{24,}/);
  return match?.[0] ?? null;
}

function badRequest(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  const headerSecret = request.headers.get("x-webhook-secret") ?? request.headers.get("authorization");

  if (env.EVOLUTION_WEBHOOK_SECRET && headerSecret !== env.EVOLUTION_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "UNAUTHORIZED_WEBHOOK" }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");

  if (contentLength > MAX_WEBHOOK_BYTES) {
    return badRequest("PAYLOAD_TOO_LARGE", 413);
  }

  const rawBody = await request.text();

  if (!rawBody || rawBody.length > MAX_WEBHOOK_BYTES) {
    return badRequest("PAYLOAD_TOO_LARGE", 413);
  }

  let payload: Record<string, unknown>;

  try {
    const parsed = JSON.parse(rawBody) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return badRequest("INVALID_PAYLOAD");
    }

    payload = parsed as Record<string, unknown>;
  } catch {
    return badRequest("INVALID_JSON");
  }

  const data = (payload.data ?? null) as Record<string, unknown> | null;
  const key = (data?.key ?? null) as Record<string, unknown> | null;
  const event = String(payload.event ?? payload.type ?? "unknown");
  const externalId =
    typeof payload.id === "string"
      ? payload.id
      : typeof key?.id === "string"
        ? key.id
        : "NO_EXTERNAL_ID";

  await prisma.integrationEvent.upsert({
    where: {
      provider_eventType_externalId: {
        provider: "EVOLUTION",
        eventType: event,
        externalId,
      },
    },
    update: {
      payload: payload as Prisma.InputJsonValue,
      processedAt: new Date(),
    },
    create: {
      provider: "EVOLUTION",
      eventType: event,
      externalId,
      payload: payload as Prisma.InputJsonValue,
      processedAt: new Date(),
    },
  });

  const senderJid = parseSender(payload);
  const text = parseText(payload);
  const activationCode = text ? extractToken(text) : null;
  const activationCandidate = Boolean(text && (activationCode || text.toLowerCase().includes("ativação ryvano")));

  if (!senderJid || !text) {
    logger.info("Evolution webhook ignored payload without activation text or sender", {
      event,
      externalId,
      hasSender: Boolean(senderJid),
      hasText: Boolean(text),
    });
    return NextResponse.json({ ok: true });
  }

  if (activationCandidate) {
    logger.info("Evolution webhook received WhatsApp activation candidate", {
      event,
      externalId,
      senderMasked: maskSender(senderJid),
      hasActivationCode: Boolean(activationCode),
      activationTextPreview: sanitizeActivationText(text),
    });
  }

  if (!activationCode) {
    if (activationCandidate) {
      logger.warn("Evolution webhook activation candidate missing code", {
        event,
        externalId,
        senderMasked: maskSender(senderJid),
        activationTextPreview: sanitizeActivationText(text),
      });
    }

    return NextResponse.json({ ok: true });
  }

  try {
    await verifyWhatsAppActivation({
      token: activationCode,
      senderPhone: senderJid,
      externalJid: senderJid,
    });

    logger.info("Evolution webhook confirmed WhatsApp activation", {
      event,
      externalId,
      senderMasked: maskSender(senderJid),
    });
  } catch (error) {
    logger.warn("WhatsApp activation verification failed via Evolution webhook", {
      error,
      senderMasked: maskSender(senderJid),
      event,
      externalId,
      activationTextPreview: sanitizeActivationText(text),
      activationCodeLength: activationCode.length,
    });
  }

  return NextResponse.json({ ok: true });
}

function maskSender(value: string) {
  const digits = value.replace(/\D/g, "");

  if (!digits) {
    return value.length > 18 ? `${value.slice(0, 18)}…` : value;
  }

  return `+${digits.slice(0, 4)}***${digits.slice(-4)}`;
}

function sanitizeActivationText(value: string) {
  return value.replace(/[A-Fa-f0-9]{24,}/g, "[ACTIVATION_CODE]").slice(0, 180);
}
