/**
 * POST /api/workout-assignments/:id/push-to-watch
 *
 * Envia o treino estruturado ao relógio Garmin do atleta.
 *
 * Regras:
 * - Apenas o atleta dono do assignment pode chamar.
 * - O assignment deve estar SCHEDULED ou AVAILABLE.
 * - O atleta precisa de uma WearableConnection Garmin CONNECTED.
 * - Idempotente: se já foi enviado (PUSHED), retorna 200 com o workoutId existente.
 * - Falhas são marcadas como FAILED no assignment; a UI pode tentar novamente.
 */
import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { assertSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { decryptSecret } from "@/server/crypto/secret-vault";
import { garminPlannedWorkoutProvider } from "@/modules/garmin/application/planned-workout-provider";
import { SecretType } from "@prisma/client";
import { logIntegrationEvent } from "@/modules/shared/integrations/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    assertSchoolModuleEnabled();

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { id: assignmentId } = await context.params;

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

    if (!assignment || assignment.athleteId !== session.user.id) {
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

    // Get Garmin connection for this user
    const connection = await prisma.wearableConnection.findFirst({
      where: { userId: session.user.id, provider: "GARMIN", status: "CONNECTED" },
      include: {
        secrets: {
          where: { secretType: SecretType.GARMIN_API_KEY },
        },
      },
    });

    if (!connection) {
      return NextResponse.json({ error: "NO_GARMIN_CONNECTION" }, { status: 422 });
    }

    const secret = connection.secrets[0] ?? null;
    if (!secret) {
      return NextResponse.json({ error: "GARMIN_MISSING_API_KEY" }, { status: 422 });
    }

    const accountApiKey = decryptSecret(secret);

    // Map workout blocks to PlannedWorkoutSteps
    const steps = assignment.workout.blocks.map((b) => {
      const target = (b.targetPayload ?? null) as Record<string, unknown> | null;
      const rest = (b.restPayload ?? null) as Record<string, unknown> | null;
      return {
        stepType: b.blockType as
          | "WARMUP" | "INTERVAL" | "STEADY" | "RECOVERY"
          | "COOLDOWN" | "DRILL" | "FREE" | "CUSTOM",
        title: b.title,
        durationSeconds: b.durationS,
        distanceMeters: b.distanceM != null ? Number(b.distanceM) : null,
        repetitions: b.repetitions,
        target: target ? {
          heartRateMin: typeof target.heartRateMin === "number" ? target.heartRateMin : null,
          heartRateMax: typeof target.heartRateMax === "number" ? target.heartRateMax : null,
          power: typeof target.power === "number" ? target.power : null,
          paceSecPerKm: typeof target.paceSecPerKm === "number" ? target.paceSecPerKm : null,
          paceSec100m: typeof target.paceSec100m === "number" ? target.paceSec100m : null,
          zone: typeof target.zone === "number" ? target.zone : null,
        } : null,
        rest: rest ? {
          durationSeconds: typeof rest.durationSeconds === "number" ? rest.durationSeconds : null,
          heartRateMin: typeof rest.heartRateMin === "number" ? rest.heartRateMin : null,
          heartRateMax: typeof rest.heartRateMax === "number" ? rest.heartRateMax : null,
        } : null,
      };
    });

    // Mark as PENDING before the remote call
    await prisma.workoutAssignment.update({
      where: { id: assignmentId },
      data: { garminPushStatus: "PENDING", garminPushError: null },
    });

    try {
      const result = await garminPlannedWorkoutProvider.pushWorkout({
        accountApiKey,
        title: assignment.workout.title,
        sportType: assignment.workout.sportType,
        scheduledAt: assignment.scheduledAt ?? new Date(),
        steps,
        workoutAssignmentId: assignmentId,
      });

      await prisma.workoutAssignment.update({
        where: { id: assignmentId },
        data: {
          garminWorkoutId: result.externalWorkoutId,
          garminPushStatus: "PUSHED",
          garminPushedAt: new Date(),
          garminPushError: null,
        },
      });

      logIntegrationEvent("info", "Garmin planned workout pushed from route", {
        provider: "GARMIN",
        operation: "push_workout",
        connectionId: connection.id,
        status: "success",
      });

      return NextResponse.json({ workoutId: result.externalWorkoutId });
    } catch (error) {
      const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";

      await prisma.workoutAssignment.update({
        where: { id: assignmentId },
        data: { garminPushStatus: "FAILED", garminPushError: message },
      });

      logIntegrationEvent("warn", "Garmin planned workout push failed", {
        provider: "GARMIN",
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
