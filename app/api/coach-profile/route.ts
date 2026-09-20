/**
 * GET  /api/coach-profile  — retorna o perfil de professor do usuário autenticado
 *                            com lista de escolas vinculadas (ativas e pendentes)
 * POST /api/coach-profile  — cria o perfil (idempotente: retorna o existente se já criado)
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { assertSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";
import { createCoachProfile } from "@/modules/school/domain/coach-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  displayName: z.string().trim().min(1, "Informe seu nome de professor.").max(200),
  bio: z.string().trim().max(2000).optional(),
});

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
  return session.user.id;
}

function respond(data: unknown, status = 200) {
  try {
    assertSchoolModuleEnabled();
  } catch {
    return Response.json({ code: "SCHOOL_MODULE_DISABLED", message: "Recurso indisponível." }, { status: 404 });
  }
  return Response.json(data, { status });
}

function handleError(error: unknown) {
  if (error instanceof SchoolError) {
    return Response.json({ code: error.code, message: error.message }, { status: error.status });
  }
  if (error instanceof z.ZodError) {
    return Response.json({ code: "VALIDATION_ERROR", message: error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }
  return Response.json({ code: "INTERNAL_ERROR", message: "Não foi possível concluir a operação." }, { status: 500 });
}

export async function GET() {
  try {
    assertSchoolModuleEnabled();
    const userId = await requireAuth();

    const profile = await prisma.coachProfile.findUnique({
      where: { userId },
      include: {
        schoolMemberships: {
          where: { status: { in: ["PENDING", "ACTIVE"] }, endedAt: null },
          include: { school: { select: { id: true, name: true, city: true, state: true, status: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!profile) return respond(null, 200);

    return respond({
      id: profile.id,
      displayName: profile.displayName,
      bio: profile.bio,
      status: profile.status,
      createdAt: profile.createdAt,
      schools: profile.schoolMemberships.map((m) => ({
        membershipId: m.id,
        membershipStatus: m.status,
        requestedAt: m.requestedAt,
        startedAt: m.startedAt,
        school: m.school,
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSchoolModuleEnabled();
    const userId = await requireAuth();

    const text = await request.text();
    const body = text ? JSON.parse(text) : {};
    const input = createSchema.parse(body);

    // Idempotente: se perfil já existe, retorna sem erro
    const existing = await prisma.coachProfile.findUnique({ where: { userId } });
    if (existing) {
      return respond({ id: existing.id, displayName: existing.displayName, bio: existing.bio, status: existing.status, alreadyExisted: true });
    }

    const now = new Date();
    const profile = createCoachProfile({ id: randomUUID(), userId, ...input }, now);
    const saved = await prisma.coachProfile.create({ data: profile });

    return respond({ id: saved.id, displayName: saved.displayName, bio: saved.bio, status: saved.status, alreadyExisted: false }, 201);
  } catch (error) {
    return handleError(error);
  }
}
