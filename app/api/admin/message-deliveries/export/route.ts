import { DeliveryStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

const EXPORT_LIMIT = 5000;

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const url = new URL(request.url);
  const activeStatus = normalizeDeliveryStatus(url.searchParams.get("deliveryStatus") ?? undefined);
  const activeType = normalizeDeliveryType(url.searchParams.get("deliveryType") ?? undefined);
  const where = {
    channel: "WHATSAPP" as const,
    provider: "EVOLUTION",
    ...(activeStatus === "ALL" ? {} : { status: activeStatus }),
    ...(activeType === "ALL" ? {} : { type: { startsWith: `${activeType}:` } }),
  };

  const deliveries = await prisma.messageDelivery.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: EXPORT_LIMIT,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  const lines = [
    [
      "deliveryId",
      "userId",
      "userName",
      "userEmail",
      "type",
      "status",
      "errorCode",
      "externalMessageId",
      "createdAt",
      "sentAt",
      "failedAt",
    ].join(","),
    ...deliveries.map((delivery) =>
      [
        delivery.id,
        delivery.user.id,
        delivery.user.name ?? "",
        delivery.user.email,
        delivery.type,
        delivery.status,
        delivery.errorCode ?? "",
        delivery.externalMessageId ?? "",
        delivery.createdAt.toISOString(),
        delivery.sentAt?.toISOString() ?? "",
        delivery.failedAt?.toISOString() ?? "",
      ]
        .map(toCsvCell)
        .join(","),
    ),
  ];

  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="message-deliveries-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.csv"`,
    },
  });
}

function normalizeDeliveryStatus(value: string | undefined): "ALL" | DeliveryStatus {
  const normalized = value?.toUpperCase();

  if (!normalized || normalized === "ALL") {
    return "ALL";
  }

  const valid = new Set<DeliveryStatus>(Object.values(DeliveryStatus));
  return valid.has(normalized as DeliveryStatus) ? (normalized as DeliveryStatus) : "ALL";
}

function normalizeDeliveryType(value: string | undefined) {
  const normalized = value?.toUpperCase();

  if (!normalized || normalized === "ALL") {
    return "ALL" as const;
  }

  if (normalized === "POST_ACTIVITY_REPORT" || normalized === "DAILY_GARMIN_SUMMARY") {
    return normalized;
  }

  return "ALL" as const;
}

function toCsvCell(value: string) {
  const escaped = value.replaceAll('"', '""');
  return `"${escaped}"`;
}
