/**
 * SAM-67 — what lies over one athlete's calendar in the coach's agenda
 * (§19.2/§22.3): events, goals with a due date and registered
 * unavailability in the period, plus the zone reference in force (the
 * technical sheet). Authorized as the rest of the event core.
 */
import type { PrismaClient } from "@prisma/client";
import type { LocalDate } from "../domain/local-date";
import { resolveEventActor } from "./sport-events";

export async function loadAthleteCalendarOverlay(
  db: PrismaClient,
  actorUserId: string | null,
  athleteId: string,
  range: { from: LocalDate; to: LocalDate },
  clock: () => Date = () => new Date(),
) {
  await resolveEventActor(db, clock, actorUserId, athleteId);
  const [athlete, events, goals, unavailability, sheet] = await Promise.all([
    db.user.findUnique({ where: { id: athleteId }, select: { name: true } }),
    db.athleteEventParticipation.findMany({
      where: { athleteId, status: { not: "CANCELLED" }, event: { status: { not: "CANCELLED" }, startLocalDate: { gte: range.from, lte: range.to } } },
      select: { id: true, suggestedPriority: true, agreedPriority: true, event: { select: { name: true, startLocalDate: true } }, option: { select: { label: true } } },
      orderBy: { event: { startLocalDate: "asc" } },
    }),
    db.athleteGoal.findMany({
      where: { athleteId, status: "ACTIVE", dueLocalDate: { gte: range.from, lte: range.to } },
      select: { id: true, description: true, dueLocalDate: true, origin: true },
      orderBy: { dueLocalDate: "asc" },
    }),
    db.athleteUnavailability.findMany({
      where: { athleteId, startLocalDate: { lte: range.to }, endLocalDate: { gte: range.from } },
      select: { id: true, startLocalDate: true, endLocalDate: true, reason: true },
      orderBy: { startLocalDate: "asc" },
    }),
    db.athleteTechnicalSheet.findFirst({ where: { athleteId }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
  ]);
  return {
    athleteName: athlete?.name ?? "Aluno",
    events: events.map((row) => ({
      id: row.id, name: row.event.name, date: row.event.startLocalDate, option: row.option?.label ?? null,
      main: (row.agreedPriority ?? row.suggestedPriority) === "MAIN",
    })),
    goals: goals.map((row) => ({ id: row.id, description: row.description, date: row.dueLocalDate!, agreed: row.origin === "COACH_AGREED" })),
    unavailability,
    zonesReference: sheet ? `Zonas da ficha técnica atualizada em ${sheet.updatedAt.toLocaleDateString("pt-BR")}` : "Sem ficha técnica: alvos relativos ficam bloqueados até a ficha existir.",
  };
}
