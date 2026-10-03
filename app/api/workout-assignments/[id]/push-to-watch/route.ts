/**
 * GET  /api/workout-assignments/:id/push-to-watch — prévia: o que vai ao
 *      relógio e o que será omitido/convertido (SAM-49, §11.4).
 * POST /api/workout-assignments/:id/push-to-watch — envia o treino.
 *
 * Regras:
 * - Apenas o atleta dono do assignment pode chamar.
 * - O assignment deve estar SCHEDULED ou AVAILABLE.
 * - O atleta precisa de uma conexão CONNECTED cujo provider declare a
 *   capability `plannedWorkoutPush` (catálogo), nunca decidido pelo nome.
 * - Idempotente: se já foi enviado (PUSHED), retorna 200 com o workoutId existente.
 * - Falhas são marcadas como FAILED no assignment; a UI pode tentar novamente.
 * - O envio grava no histórico da prescrição o que foi omitido/convertido.
 */
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { assertSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { toPlannedWorkoutSteps } from "@/modules/school/application/planned-workout-steps";
import { decryptSecret } from "@/server/crypto/secret-vault";
import { garminPlannedWorkoutProvider } from "@/modules/garmin/application/planned-workout-provider";
import { planGarminWorkout, type ExportNote } from "@/modules/garmin/application/planned-workout-export";
import { getProviderDefinition } from "@/modules/shared/integrations/catalog";
import type { PlannedWorkoutProvider } from "@/modules/shared/integrations/contracts";
import type { ProviderId } from "@/modules/shared/integrations/types";
import { SecretType } from "@prisma/client";
import { logIntegrationEvent } from "@/modules/shared/integrations/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Implementations of the `plannedWorkoutPush` capability, by provider. */
const PLANNED_WORKOUT_PROVIDERS: Partial<Record<ProviderId, {
  push: PlannedWorkoutProvider;
  preview: (title: string, steps: Parameters<typeof planGarminWorkout>[1]) => { notes: ExportNote[] };
  secretType: SecretType;
}>> = {
  GARMIN: { push: garminPlannedWorkoutProvider, preview: planGarminWorkout, secretType: SecretType.GARMIN_API_KEY },
};

async function loadOwnedAssignment(assignmentId: string, userId: string) {
  const assignment = await prisma.workoutAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      workout: {
        include: {
          blocks: {
            orderBy: { position: "asc" },
            select: {
              blockType: true, title: true, durationS: true,
              distanceM: true, repetitions: true, targetPayload: true, restPayload: true,
            },
          },
        },
      },
    },
  });
  return assignment && assignment.athleteId === userId ? assignment : null;
}

/** The athlete's first connected account whose provider can receive planned workouts. */
async function pushConnection(userId: string) {
  const connections = await prisma.wearableConnection.findMany({
    where: { userId, status: "CONNECTED" },
    include: { secrets: true },
    orderBy: { createdAt: "asc" },
  });
  for (const connection of connections) {
    const providerId = connection.provider as ProviderId;
    const implementation = PLANNED_WORKOUT_PROVIDERS[providerId];
    if (getProviderDefinition(providerId)?.capabilities.plannedWorkoutPush === true && implementation) {
      return { connection, providerId, implementation };
    }
  }
  return null;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    assertSchoolModuleEnabled();
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    const { id: assignmentId } = await context.params;
    const assignment = await loadOwnedAssignment(assignmentId, session.user.id);
    if (!assignment) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (!assignment.workout) return NextResponse.json({ error: "NO_WORKOUT" }, { status: 422 });
    const target = await pushConnection(session.user.id);
    if (!target) return NextResponse.json({ error: "NO_PLANNED_WORKOUT_CONNECTION" }, { status: 422 });
    const plan = target.implementation.preview(assignment.workout.title, toPlannedWorkoutSteps(assignment.workout.blocks));
    return NextResponse.json({ provider: target.providerId, notes: plan.notes });
  } catch (error) {
    if (error instanceof Error && error.message === "SCHOOL_MODULE_DISABLED") {
      return NextResponse.json({ error: "FEATURE_DISABLED" }, { status: 403 });
    }
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    assertSchoolModuleEnabled();

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { id: assignmentId } = await context.params;
    const assignment = await loadOwnedAssignment(assignmentId, session.user.id);
    if (!assignment) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    if (!assignment.workout) {
      return NextResponse.json({ error: "NO_WORKOUT" }, { status: 422 });
    }
    if (!["SCHEDULED", "AVAILABLE"].includes(assignment.status)) {
      return NextResponse.json({ error: "INVALID_STATUS", status: assignment.status }, { status: 422 });
    }

    // Idempotency: already pushed
    if (assignment.garminPushStatus === "PUSHED" && assignment.garminWorkoutId) {
      return NextResponse.json({ workoutId: assignment.garminWorkoutId, alreadyPushed: true });
    }

    const target = await pushConnection(session.user.id);
    if (!target) {
      return NextResponse.json({ error: "NO_PLANNED_WORKOUT_CONNECTION" }, { status: 422 });
    }
    const { connection, providerId, implementation } = target;

    const secret = connection.secrets.find((row) => row.secretType === implementation.secretType) ?? null;
    if (!secret) {
      return NextResponse.json({ error: "MISSING_PROVIDER_SECRET" }, { status: 422 });
    }

    const accountApiKey = decryptSecret(secret);
    const steps = toPlannedWorkoutSteps(assignment.workout.blocks);
    const { notes } = implementation.preview(assignment.workout.title, steps);

    // Mark as PENDING before the remote call
    await prisma.workoutAssignment.update({
      where: { id: assignmentId },
      data: { garminPushStatus: "PENDING", garminPushError: null },
    });

    try {
      const result = await implementation.push.pushWorkout({
        accountApiKey,
        title: assignment.workout.title,
        sportType: assignment.workout.sportType,
        scheduledAt: assignment.scheduledAt ?? new Date(),
        steps,
        workoutAssignmentId: assignmentId,
      });

      await prisma.$transaction([
        prisma.workoutAssignment.update({
          where: { id: assignmentId },
          data: {
            garminWorkoutId: result.externalWorkoutId,
            garminPushStatus: "PUSHED",
            garminPushedAt: new Date(),
            garminPushError: null,
          },
        }),
        // SAM-49 — what reached the watch and what did not, on the record.
        prisma.workoutAssignmentHistory.create({
          data: {
            id: randomUUID(),
            workoutAssignmentId: assignmentId,
            eventType: "WATCH_EXPORTED",
            actorUserId: session.user.id,
            payload: { provider: providerId, externalWorkoutId: result.externalWorkoutId, notes },
          },
        }),
      ]);

      logIntegrationEvent("info", "Planned workout pushed from route", {
        provider: providerId,
        operation: "push_workout",
        connectionId: connection.id,
        status: "success",
      });

      return NextResponse.json({ workoutId: result.externalWorkoutId, notes });
    } catch (error) {
      const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";

      await prisma.workoutAssignment.update({
        where: { id: assignmentId },
        data: { garminPushStatus: "FAILED", garminPushError: message },
      });

      logIntegrationEvent("warn", "Planned workout push failed", {
        provider: providerId,
        operation: "push_workout",
        connectionId: connection.id,
        status: "error",
      });

      return NextResponse.json({ error: "PUSH_FAILED", message }, { status: 502 });
    }
  } catch (error) {
    if (error instanceof Error && error.message === "SCHOOL_MODULE_DISABLED") {
      return NextResponse.json({ error: "FEATURE_DISABLED" }, { status: 403 });
    }
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
