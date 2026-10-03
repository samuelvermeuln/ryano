/**
 * SAM-66 — recording the result of a prova (§5.3, §6 step 13, §12.6, §16.6,
 * AC20, AC25).
 *
 * - The athlete, the responsible coach or the school records it; the
 *   athlete's perception is written only by the athlete (AC24), and an edit
 *   by someone else keeps it.
 * - Only from the event day on (a cancelled event or "pendente" any time).
 * - A result stops the "resultado não registrado" reminders; a result from
 *   the athlete moves an open preparation to "revisão pendente" so the coach
 *   reviews and closes it (§6 step 13).
 * - Nothing here touches activities: a DNF keeps the effort in the history.
 */
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { participationResultInputSchema } from "../domain/participation-result";
import { daysUntilEvent } from "../domain/sport-event";
import { syncParticipationReminders } from "./follow-up-reminders";
import { resolveEventActor } from "./sport-events";

type Clock = () => Date;
const TX = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 20_000 } as const;
const STARTED = new Set(["FINISHED", "DNF", "DSQ"]);
const OPEN_PREPARATION = new Set(["AWAITING_ASSESSMENT", "PLANNING", "ACTIVE"]);

export class RecordParticipationResult {
  constructor(private readonly db: PrismaClient, private readonly clock: Clock = () => new Date()) {}

  async execute(actorUserId: string | null, participationId: string, raw: unknown) {
    if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = participationResultInputSchema.parse(raw);
    const participation = await this.db.athleteEventParticipation.findUnique({
      where: { id: z.string().min(1).max(256).parse(participationId) },
      select: {
        id: true, athleteId: true, status: true,
        event: { select: { startLocalDate: true, dateConfirmed: true, timeZone: true, status: true } },
        preparation: { select: { id: true, status: true, coachId: true } },
        result: { select: { id: true, athletePerception: true, version: true, reportedTimeSeconds: true, reportedByUserId: true } },
      },
    });
    if (!participation) throw new SchoolError("PARTICIPATION_NOT_FOUND", "Evento não encontrado.", 404);
    const actor = await resolveEventActor(this.db, this.clock, actorUserId, participation.athleteId);
    if (actor.kind !== "athlete" && input.athletePerception) {
      throw new SchoolError("FORBIDDEN", "A percepção do atleta é escrita só por ele; use o parecer do professor.", 403);
    }
    const now = this.clock();
    const days = daysUntilEvent(participation.event, now);
    const notYet = days === null || days > 0;
    if (notYet && input.status !== "PENDING" && input.status !== "EVENT_CANCELLED") {
      throw new SchoolError("EVENT_NOT_HAPPENED", "O resultado é registrado a partir do dia do evento.", 422);
    }
    if (participation.status === "CANCELLED" && input.status !== "DNS" && input.status !== "EVENT_CANCELLED") {
      throw new SchoolError("PARTICIPATION_CANCELLED", "Esta participação foi cancelada.", 409);
    }

    const reportedChanged = input.reportedTimeSeconds !== (participation.result?.reportedTimeSeconds ?? null);
    const data = {
      status: input.status,
      officialTimeSeconds: input.officialTimeSeconds, officialTimeSource: input.officialTimeSource,
      reportedTimeSeconds: input.reportedTimeSeconds,
      reportedByUserId: input.reportedTimeSeconds === null ? null : reportedChanged ? actorUserId : participation.result?.reportedByUserId ?? actorUserId,
      placement: input.placement, category: input.category,
      splits: input.splits as unknown as Prisma.InputJsonValue,
      abandonSegment: input.abandonSegment, abandonReason: input.abandonReason,
      feedingReport: input.feedingReport, strategyExecution: input.strategyExecution, dayConditions: input.dayConditions,
      officialResultUrl: input.officialResultUrl,
      // Only the athlete changes their own perception; anyone else's edit keeps it.
      athletePerception: actor.kind === "athlete" ? input.athletePerception : participation.result?.athletePerception ?? null,
      recordedByUserId: actorUserId,
    };

    const saved = await this.db.$transaction(async (tx) => {
      const result = participation.result
        ? await tx.participationResult.update({ where: { id: participation.result.id }, data: { ...data, version: { increment: 1 }, updatedAt: now } })
        : await tx.participationResult.create({ data: { id: randomUUID(), participationId: participation.id, athleteId: participation.athleteId, ...data, createdAt: now, updatedAt: now } });
      if (STARTED.has(input.status) && participation.status !== "ATTENDED" && participation.status !== "CANCELLED") {
        await tx.athleteEventParticipation.update({ where: { id: participation.id }, data: { status: "ATTENDED", version: { increment: 1 }, updatedAt: now } });
      }
      // §6 step 13 — the coach reviews the result and decides to close or continue.
      const preparation = participation.preparation;
      if (actor.kind === "athlete" && input.status !== "PENDING" && preparation?.coachId && OPEN_PREPARATION.has(preparation.status)) {
        await tx.eventPreparation.update({ where: { id: preparation.id }, data: { status: "REVIEW_PENDING", version: { increment: 1 }, updatedAt: now } });
        await tx.eventPreparationTransition.create({
          data: { id: randomUUID(), preparationId: preparation.id, fromStatus: preparation.status, toStatus: "REVIEW_PENDING", fromCoachId: preparation.coachId, toCoachId: preparation.coachId, actorUserId, reason: "resultado registrado pelo atleta", at: now },
        });
      }
      return result;
    }, TX);
    // A recorded result ends the "resultado não registrado" reminders (AC20).
    await syncParticipationReminders(this.db, this.clock, participation.id);
    return saved;
  }
}

export async function resultOfParticipation(db: Pick<PrismaClient, "participationResult">, participationId: string) {
  return db.participationResult.findUnique({
    where: { participationId },
    include: { recordedBy: { select: { name: true } } },
  });
}

/** The goal the result is shown against: the agreed one when it exists, otherwise the athlete's wish (labelled). */
export async function goalForResult(db: Pick<PrismaClient, "athleteGoal">, participation: { id: string; goalText: string | null }) {
  const agreed = await db.athleteGoal.findFirst({
    where: { participationId: participation.id, origin: "COACH_AGREED", status: { notIn: ["CANCELLED", "REPLACED"] } },
    orderBy: { updatedAt: "desc" },
    select: { description: true },
  });
  if (agreed) return `${agreed.description} (pactuado)`;
  return participation.goalText ? `${participation.goalText} (desejado)` : null;
}
