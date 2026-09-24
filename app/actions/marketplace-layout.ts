"use server";

/**
 * TM050 (RF-113, design D-09) — persists `CustomizableCardGrid` layout for
 * the three marketplace surfaces, one action per surface, each writing its
 * OWN dedicated `UserProfile` column. Mirrors `app/actions/dashboard-layout.ts`
 * / `activities.ts` / `integrations-layout.ts` exactly — same validation
 * shape, same upsert pattern — so this stays one obvious convention instead
 * of a second way to do the same thing.
 */
import { z } from "zod";
import { requireSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";

const surfaceLayoutSchema = z.object({
  layout: z.array(
    z.object({
      id: z.string().trim().min(1).max(80),
      span: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    }),
  ).min(1).max(32),
});

export type SurfaceLayoutActionState = {
  success?: boolean;
  message?: string;
};

async function saveSurfaceLayout(
  column: "marketplaceCatalogLayoutOrder" | "athletePlanLayoutOrder" | "coachStudioLayoutOrder",
  input: { layout: Array<{ id: string; span: 1 | 2 | 3 }> },
): Promise<SurfaceLayoutActionState> {
  const session = await requireSession();
  const parsed = surfaceLayoutSchema.safeParse(input);

  if (!parsed.success) {
    return { message: parsed.error.issues[0]?.message ?? "Layout inválido." };
  }

  await prisma.userProfile.upsert({
    where: { userId: session.user.id },
    update: { [column]: parsed.data.layout },
    create: { userId: session.user.id, [column]: parsed.data.layout },
  });

  return { success: true, message: "Layout salvo." };
}

export async function saveMarketplaceCatalogLayoutAction(input: { layout: Array<{ id: string; span: 1 | 2 | 3 }> }) {
  return saveSurfaceLayout("marketplaceCatalogLayoutOrder", input);
}

export async function saveAthletePlanLayoutAction(input: { layout: Array<{ id: string; span: 1 | 2 | 3 }> }) {
  return saveSurfaceLayout("athletePlanLayoutOrder", input);
}

export async function saveCoachStudioLayoutAction(input: { layout: Array<{ id: string; span: 1 | 2 | 3 }> }) {
  return saveSurfaceLayout("coachStudioLayoutOrder", input);
}
