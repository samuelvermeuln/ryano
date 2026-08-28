import { NextResponse } from "next/server";

import { generateReport } from "@/lib/reports/generate-report";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { getPublicAppUrl } from "@/server/env";
import { isGarminAccountLockedErrorCode } from "@/server/services/garmin-connection-errors";
import { getGarminDailySnapshotForUser, hasGarminDailySummaryMetrics } from "@/server/services/garmin-daily-report";
import {
  buildDailyGarminSummaryWhatsAppReport,
  buildGarminDailySyncCheckWhatsAppReport,
  buildGarminReconnectWhatsAppReport,
  buildPostActivityWhatsAppReport,
} from "@/server/services/report-builder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GARMIN_ACCOUNT_RECOVERY_URL =
  process.env.NEXT_PUBLIC_GARMIN_RECOVER_PASSWORD_URL ||
  "https://sso.garmin.com/portal/sso/en-US/forgot-password?service=https%3A%2F%2Fconnect.garmin.com%2Fmodern%2F";

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const url = new URL(request.url);
  const template = url.searchParams.get("template");
  const deliveryId = url.searchParams.get("deliveryId");

  if (!template && !deliveryId) {
    return NextResponse.json({ error: "TEMPLATE_OR_DELIVERY_REQUIRED" }, { status: 400 });
  }

  try {
    const report = deliveryId
      ? await buildPreviewReportFromDelivery(deliveryId)
      : await buildPreviewReport({
          template: template!,
          userId: url.searchParams.get("userId"),
          activityId: url.searchParams.get("activityId"),
          connectionId: url.searchParams.get("connectionId"),
          date: url.searchParams.get("date"),
          phone: url.searchParams.get("phone"),
        });
    const image = await generateReport(report.request);

    return new Response(image, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
        "Content-Disposition": `inline; filename="${report.fileName}"`,
        "X-WhatsApp-Caption": encodeURIComponent(report.caption),
      },
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "PREVIEW_GENERATION_FAILED",
    }, { status: 400 });
  }
}

async function buildPreviewReport(input: {
  template: string;
  userId: string | null;
  activityId: string | null;
  connectionId: string | null;
  date: string | null;
  phone: string | null;
}) {
  switch (input.template) {
    case "post-activity-report": {
      if (!input.activityId) {
        throw new Error("ACTIVITY_ID_REQUIRED");
      }

      const activity = await prisma.activity.findUnique({
        where: { id: input.activityId },
        include: {
          user: {
            select: {
              name: true,
            },
          },
        },
      });

      if (!activity) {
        throw new Error("ACTIVITY_NOT_FOUND");
      }

      return buildPostActivityWhatsAppReport({
        user: {
          name: activity.user.name,
        },
        activity,
      });
    }

    case "daily-garmin-summary": {
      if (!input.userId) {
        throw new Error("USER_ID_REQUIRED");
      }

      const user = await prisma.user.findUnique({
        where: { id: input.userId },
        select: {
          name: true,
        },
      });

      if (!user) {
        throw new Error("USER_NOT_FOUND");
      }

      const snapshot = await getGarminDailySnapshotForUser(input.userId, {
        date: input.date ?? undefined,
      });

      if (!hasGarminDailySummaryMetrics(snapshot)) {
        throw new Error("GARMIN_DAILY_SUMMARY_PREVIEW_UNAVAILABLE");
      }

      return buildDailyGarminSummaryWhatsAppReport({
        user,
        snapshot,
      });
    }

    case "garmin-daily-sync-check": {
      if (!input.userId) {
        throw new Error("USER_ID_REQUIRED");
      }

      const user = await prisma.user.findUnique({
        where: { id: input.userId },
        select: {
          name: true,
        },
      });

      if (!user) {
        throw new Error("USER_NOT_FOUND");
      }

      return buildGarminDailySyncCheckWhatsAppReport({
        user,
        date: input.date ?? new Date().toISOString().slice(0, 10),
      });
    }

    case "garmin-reconnect": {
      if (!input.connectionId) {
        throw new Error("CONNECTION_ID_REQUIRED");
      }

      const connection = await prisma.wearableConnection.findUnique({
        where: { id: input.connectionId },
        select: {
          lastErrorCode: true,
          user: {
            select: {
              name: true,
            },
          },
        },
      });

      if (!connection) {
        throw new Error("CONNECTION_NOT_FOUND");
      }

      const revalidateUrl = new URL("/app/integracoes?garmin=revalidar", getPublicAppUrl()).toString();
      const reconnectUrl = isGarminAccountLockedErrorCode(connection.lastErrorCode) ? GARMIN_ACCOUNT_RECOVERY_URL : revalidateUrl;

      return buildGarminReconnectWhatsAppReport({
        user: {
          name: connection.user.name,
        },
        reconnectUrl,
        errorCode: connection.lastErrorCode,
      });
    }

    case "evolution-media-diagnostic": {
      return {
        request: {
          template: "evolution-media-diagnostic" as const,
          data: {
            title: "Teste crítico de fonte e conteúdo",
            subtitle: input.phone ? `Destino ${input.phone}` : "Preview local sem envio",
            message: "Se fonte estiver correta, este card deve mostrar texto legível, números, acentos e métricas reais sem quadrados: ABC 123 ç ã é ê ô.",
            metrics: [
              { label: "Texto fixo", value: "ABC 123 ç ã é" },
              { label: "Valor numérico", value: "62 bpm · 7.8 h" },
              { label: "Status", value: "Fonte OK = legível" },
            ],
            chart: {
              title: "Validação visual",
              type: "bar" as const,
              data: [
                { label: "ABC", value: 1, formattedValue: "ABC" },
                { label: "123", value: 1, formattedValue: "123" },
                { label: "çãé", value: 1, formattedValue: "çãé" },
              ],
              note: "Se qualquer bloco acima aparecer como quadrado, ainda existe falha na rasterização tipográfica do PNG.",
            },
            footer: "Use este preview antes de reenviar resumo diário ou qualquer card operacional do WhatsApp.",
            status: "warning" as const,
            theme: {
              family: "diagnostic" as const,
              sport: "default" as const,
              variant: "mist" as const,
            },
          },
        },
        caption: "Preview local de fonte e conteúdo do PNG Ryvano/Evolution.",
        fileName: "ryvano-evolution-font-preview.png",
      };
    }

    default:
      throw new Error("TEMPLATE_NOT_SUPPORTED");
  }
}

async function buildPreviewReportFromDelivery(deliveryId: string) {
  const delivery = await prisma.messageDelivery.findUnique({
    where: { id: deliveryId },
    select: {
      id: true,
      userId: true,
      type: true,
    },
  });

  if (!delivery) {
    throw new Error("DELIVERY_NOT_FOUND");
  }

  const canonicalType = getCanonicalDeliveryType(delivery.type);

  if (canonicalType.startsWith("POST_ACTIVITY_REPORT:")) {
    const activityId = canonicalType.slice("POST_ACTIVITY_REPORT:".length);
    const activity = await prisma.activity.findUnique({
      where: { id: activityId },
      include: {
        user: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!activity) {
      throw new Error("ACTIVITY_NOT_FOUND");
    }

    return buildPostActivityWhatsAppReport({
      user: {
        name: activity.user.name,
      },
      activity,
    });
  }

  if (canonicalType.startsWith("DAILY_GARMIN_SUMMARY:")) {
    const date = canonicalType.slice("DAILY_GARMIN_SUMMARY:".length);
    const user = await prisma.user.findUnique({
      where: { id: delivery.userId },
      select: {
        name: true,
      },
    });

    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }

    const snapshot = await getGarminDailySnapshotForUser(delivery.userId, { date });

    if (!hasGarminDailySummaryMetrics(snapshot)) {
      throw new Error("GARMIN_DAILY_SUMMARY_PREVIEW_UNAVAILABLE");
    }

    return buildDailyGarminSummaryWhatsAppReport({
      user,
      snapshot,
    });
  }

  if (canonicalType.startsWith("GARMIN_DAILY_SYNC_CHECK:")) {
    const date = canonicalType.slice("GARMIN_DAILY_SYNC_CHECK:".length);
    const user = await prisma.user.findUnique({
      where: { id: delivery.userId },
      select: {
        name: true,
      },
    });

    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }

    return buildGarminDailySyncCheckWhatsAppReport({
      user,
      date,
    });
  }

  if (canonicalType.startsWith("GARMIN_RECONNECT_ALERT:")) {
    const { connectionId } = parseGarminReconnectDeliveryType(canonicalType);
    const connection = await prisma.wearableConnection.findUnique({
      where: { id: connectionId },
      select: {
        lastErrorCode: true,
        user: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!connection) {
      throw new Error("CONNECTION_NOT_FOUND");
    }

    const revalidateUrl = new URL("/app/integracoes?garmin=revalidar", getPublicAppUrl()).toString();
    const reconnectUrl = isGarminAccountLockedErrorCode(connection.lastErrorCode) ? GARMIN_ACCOUNT_RECOVERY_URL : revalidateUrl;

    return buildGarminReconnectWhatsAppReport({
      user: {
        name: connection.user.name,
      },
      reconnectUrl,
      errorCode: connection.lastErrorCode,
    });
  }

  throw new Error("DELIVERY_PREVIEW_NOT_SUPPORTED");
}

function getCanonicalDeliveryType(type: string) {
  const marker = "::RESENT:";
  const markerIndex = type.indexOf(marker);

  return markerIndex === -1 ? type : type.slice(0, markerIndex);
}

function parseGarminReconnectDeliveryType(type: string) {
  const [prefix, connectionId] = type.split(":");

  if (`${prefix}:` !== "GARMIN_RECONNECT_ALERT:" || !connectionId) {
    throw new Error("GARMIN_RECONNECT_DELIVERY_TYPE_INVALID");
  }

  return { connectionId } as const;
}
