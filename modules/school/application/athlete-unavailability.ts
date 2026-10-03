/**
 * SAM-57 — the athlete's unavailability periods (§19.1 calendar). The
 * athlete records and removes them; an authorized coach reads them through
 * the same gate as the events (`resolveEventActor`). They inform the coach
 * and change no prescription by themselves (ADR-010).
 */
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { isValidLocalDate } from "../domain/local-date";
import { resolveEventActor } from "./sport-events";

const localDate = z.string().refine(isValidLocalDate, "Data inválida (AAAA-MM-DD).");

export const unavailabilityInputSchema = z.strictObject({
  startLocalDate: localDate,
  endLocalDate: localDate,
  reason: z.string().trim().min(2, "Informe o motivo.").max(200),
}).refine((value) => value.endLocalDate >= value.startLocalDate, { message: "O fim não pode ser antes do início.", path: ["endLocalDate"] });

export class AthleteUnavailabilityService {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async create(actorUserId: string | null, raw: unknown) {
    if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = unavailabilityInputSchema.parse(raw);
    return this.db.athleteUnavailability.create({
      data: { id: randomUUID(), athleteId: actorUserId, ...input, createdByUserId: actorUserId },
    });
  }

  async remove(actorUserId: string | null, id: string) {
    if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const { count } = await this.db.athleteUnavailability.deleteMany({ where: { id, athleteId: actorUserId } });
    if (count === 0) throw new SchoolError("UNAVAILABILITY_NOT_FOUND", "Período não encontrado.", 404);
    return { removed: true };
  }

  /** Periods overlapping [from, to] (local dates); the athlete or an authorized coach. */
  async list(actorUserId: string | null, athleteId: string, range: { from: string; to: string }) {
    await resolveEventActor(this.db, this.clock, actorUserId, athleteId);
    return this.db.athleteUnavailability.findMany({
      where: { athleteId, startLocalDate: { lte: range.to }, endLocalDate: { gte: range.from } },
      select: { id: true, startLocalDate: true, endLocalDate: true, reason: true },
      orderBy: { startLocalDate: "asc" },
    });
  }
}
