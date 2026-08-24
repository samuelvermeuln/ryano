"use server";

import { z } from "zod";

import { requireSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";

const dashboardLayoutSchema = z.object({
  layout: z.array(
    z.object({
      id: z.string().trim().min(1).max(80),
      span: z.union([z.literal(1), z.literal(2)]),
    }),
  ).min(1).max(32),
});

export type DashboardLayoutActionState = {
  success?: boolean;
  message?: string;
};

export async function saveDashboardLayoutAction(input: {
  layout: Array<{ id: string; span: 1 | 2 }>;
}): Promise<DashboardLayoutActionState> {
  const session = await requireSession();
  const parsed = dashboardLayoutSchema.safeParse(input);

  if (!parsed.success) {
    return {
      message: parsed.error.issues[0]?.message ?? "Layout inválido.",
    };
  }

  await prisma.userProfile.upsert({
    where: {
      userId: session.user.id,
    },
    update: {
      dashboardLayoutOrder: parsed.data.layout,
    },
    create: {
      userId: session.user.id,
      dashboardLayoutOrder: parsed.data.layout,
    },
  });

  return {
    success: true,
    message: "Layout salvo.",
  };
}
