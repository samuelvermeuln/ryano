/**
 * SAM-51 — thin adapters for the event use cases: auth, parse, delegate.
 */
import { z } from "zod";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { assertSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";
import {
  CreateEventParticipation,
  ListAthleteParticipations,
  SearchVisibleEvents,
  UpdateEventParticipation,
  UpdateSportEvent,
} from "@/modules/school/application/sport-events";

export const createParticipation = new CreateEventParticipation(prisma);
export const updateParticipation = new UpdateEventParticipation(prisma);
export const updateSportEvent = new UpdateSportEvent(prisma);
export const listParticipations = new ListAthleteParticipations(prisma);
export const searchEvents = new SearchVisibleEvents(prisma);

/**
 * Same envelope as the school routes. A suspected duplicate answers 409 with
 * the candidates, so the screen can offer "é este evento?" or "é outro".
 */
export async function eventResponse(operation: (actorId: string) => Promise<unknown>, status = 200) {
  try {
    assertSchoolModuleEnabled();
    const session = await auth();
    if (!session?.user?.id) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    return Response.json(await operation(session.user.id), { status });
  } catch (error) {
    if (error instanceof SchoolError && error.code === "EVENT_DUPLICATE_SUSPECTED") {
      return Response.json({
        code: error.code,
        message: "Encontramos um evento parecido. Confirme se é o mesmo ou outro evento.",
        candidates: JSON.parse(error.message) as unknown,
      }, { status: 409 });
    }
    if (error instanceof SchoolError) {
      return Response.json({ code: error.code, message: error.message }, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      return Response.json({
        code: "VALIDATION_ERROR", message: error.issues[0]?.message ?? "Dados inválidos.",
        details: error.issues.map(({ code, path, message }) => ({ code, path, message })),
      }, { status: 400 });
    }
    if (error instanceof Error && error.message === "SCHOOL_MODULE_DISABLED") {
      return Response.json({ code: "SCHOOL_MODULE_DISABLED", message: "Recurso indisponível." }, { status: 404 });
    }
    return Response.json({ code: "INTERNAL_ERROR", message: "Não foi possível concluir a operação." }, { status: 500 });
  }
}

export async function parseJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  try {
    return text.length === 0 ? {} : JSON.parse(text);
  } catch {
    throw new SchoolError("VALIDATION_ERROR", "Informe um corpo JSON válido.", 400);
  }
}
