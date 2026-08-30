import { NextResponse } from "next/server";

import { generateReport } from "@/lib/reports/generate-report";
import type { AthleteDailyReadinessTemplateData, ReportThemeSport } from "@/lib/reports/types";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { getPublicAppUrl } from "@/server/env";
import {
  getGarminDailySnapshotForUser,
  hasGarminDailySummaryMetrics,
  isGarminAccountLockedErrorCode,
} from "@/modules/garmin";
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
          sport: url.searchParams.get("sport"),
        });

    // Se for athlete-daily-readiness, renderiza SVG direto
    if (report.request.template === "athlete-daily-readiness") {
      const { renderAthleteDailyReadinessTemplate } = await import("@/lib/reports/templates/athlete-daily-readiness");
      const svg = renderAthleteDailyReadinessTemplate(report.request.data);

      return new Response(svg, {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "no-store",
          "Content-Disposition": `inline; filename="${report.fileName}"`,
          "X-WhatsApp-Caption": encodeURIComponent(report.caption),
        },
      });
    }

    // Para outros templates, gera PNG
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
  sport: string | null;
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
              image: true,
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
          image: activity.user.image,
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
          image: true,
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
          image: true,
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
              image: true,
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
          image: connection.user.image,
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

    case "athlete-daily-readiness": {
      if (!input.userId) {
        throw new Error("USER_ID_REQUIRED");
      }

      const user = await prisma.user.findUnique({
        where: { id: input.userId },
        include: {
          profile: true,
          wearableConnections: {
            where: { provider: "GARMIN", status: "CONNECTED" },
            take: 1,
          },
        },
      });

      if (!user) {
        throw new Error("USER_NOT_FOUND");
      }

      const snapshot = await getGarminDailySnapshotForUser(input.userId, {
        date: input.date ?? undefined,
      });

      // Determina esporte baseado em atividades recentes ou default
      const sport = (input.sport as ReportThemeSport) || "triathlon";
      const { getSportTheme } = await import("@/lib/reports/sport-themes");
      const sportTheme = getSportTheme(sport);
      
      // Formata data em português
      const dateObj = new Date(input.date || new Date());
      const dateStr = dateObj.toLocaleDateString("pt-BR", { 
        day: "2-digit", 
        month: "short", 
        year: "numeric" 
      }).toUpperCase().replace(".", "");

      // Determina tom da prontidão
      const readinessScore = snapshot?.readiness?.score ?? 0;
      const readinessTone: "good" | "moderate" | "warn" | "bad" =
        readinessScore >= 80 ? "good" :
        readinessScore >= 60 ? "moderate" :
        readinessScore >= 40 ? "warn" : "bad";

      // Monta métricas com dados reais do snapshot (usa estrutura real de GarminDailySnapshot)
      const metrics: AthleteDailyReadinessTemplateData["metrics"] = [];

      // 1. Sleep Score
      const sleepScore = snapshot?.sleep?.score;
      const sleepSeconds = snapshot?.sleep?.durationSeconds;
      if (sleepScore != null) {
        const sleepH = sleepSeconds != null ? Math.floor(sleepSeconds / 3600) : null;
        const sleepM = sleepSeconds != null ? Math.floor((sleepSeconds % 3600) / 60) : null;
        metrics.push({
          type: "sleep",
          icon: "moon",
          label: "SONO REGENERATIVO",
          value: sleepScore,
          sub: sleepH != null ? `${sleepH}h ${sleepM}min` : undefined,
          tone: sleepScore >= 80 ? "good" : sleepScore >= 60 ? "moderate" : "warn",
        });
      }

      // 2. Body Battery (bodyBatteryHighest / bodyBatteryLowest no summary)
      const bbHigh = snapshot?.summary?.bodyBatteryHighest;
      const bbLow = snapshot?.summary?.bodyBatteryLowest;
      if (bbHigh != null && bbLow != null) {
        metrics.push({
          type: "battery",
          icon: "battery",
          label: "BODY BATTERY ENERGÉTICA",
          from: bbLow,
          to: bbHigh,
          sub: "RESERVA ENERGÉTICA",
        });
      }

      // 3. HRV (lastNightAvg)
      const hrvValue = snapshot?.hrv?.lastNightAvg;
      const hrvStatus = snapshot?.hrv?.status;
      if (hrvValue != null) {
        metrics.push({
          type: "badge",
          icon: "hrv",
          label: "VFC NOTURNA",
          value: Math.round(hrvValue),
          unit: " ms",
          statusLabel: hrvStatus ?? "NORMAL",
          tone: "good",
        });
      }

      // 4. Resting HR
      const rhr = snapshot?.summary?.restingHeartRate;
      if (rhr != null) {
        metrics.push({
          type: "badge",
          icon: "hr",
          label: "FC REPOUSO",
          value: rhr,
          unit: " bpm",
          statusLabel: "NORMAL",
          tone: "good",
        });
      }

      // Monta recomendações baseadas no score
      const recommendations = readinessScore >= 80
        ? [
            "Bom momento para treino de qualidade com intensidade controlada e execução técnica limpa.",
            "Recuperação noturna forte, bom sinal para sustentar consistência no treino planejado.",
            "VFC equilibrada hoje, sinal favorável de adaptação ao treinamento recente.",
          ]
        : readinessScore >= 60
        ? [
            "Treino de corrida/ciclismo de baixa/média intensidade recomendado.",
            "Excelente recuperação noturna.",
            "Monitorar carga muscular se houver fadiga.",
          ]
        : [
            "Priorize técnica e volume moderado hoje.",
            "Evitar séries de sprint máximo - reserva energética moderada.",
            "Sono abaixo da média; priorizar descanso à noite.",
          ];

      return {
        caption: `📊 Relatório de prontidão diária para ${user.name || "atleta"}.`,
        fileName: `ryvano-readiness-${input.date || new Date().toISOString().slice(0, 10)}.svg`,
        request: {
          template: "athlete-daily-readiness" as const,
          data: {
            sport,
            reportType: sportTheme.reportLabel,
            date: dateStr,
            athlete: {
              name: user.name?.toUpperCase() ?? "ATLETA",
              team: "RYVANO TEAM",
            },
            readiness: {
              score: readinessScore,
              statusLabel: snapshot?.readiness?.level ?? "AVALIANDO",
              tone: readinessTone,
              description: snapshot?.readiness?.feedback ?? "Analisando seus dados de recuperação...",
            },
            metrics,
            recommendations,
          },
        },
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
            image: true,
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
        image: activity.user.image,
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
        image: true,
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
        image: true,
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
            image: true,
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
        image: connection.user.image,
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
