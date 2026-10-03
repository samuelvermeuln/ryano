/**
 * SAM-54 — the follow-up of a participation: responsible coach, states,
 * assume, assign (school), pause/resume/close, collaborators and revocation
 * (§6, §6.1, §7.3, §20, §22.6, §22.7; AC03, AC18, AC21).
 *
 * One core for school and independent scopes (AC18): the preparation keeps
 * `schoolId` (null = independent) and every access is checked against an
 * active link through `CanReadAthleteCurrentData` (school status, enrollment,
 * coach membership…). When the responsible's link ends — by whatever use case
 * ended it — the next read returns the preparation to UNASSIGNED with a
 * system transition, so the former coach loses access everywhere (AC21).
 *
 * Creating the record is the only automation (§2.2 "criar pendência de
 * acompanhamento"); nobody is notified about an athlete without a link (AC03).
 */
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { canApply, preparationStatusText, type PreparationAction } from "../domain/event-preparation";
import { isValidLocalDate } from "../domain/local-date";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageSchool } from "./can-manage-school";
import { CanReadAthleteCurrentData } from "./can-read-athlete-current-data";
import { onPreparationUnassigned } from "./event-follow-up-triggers";
import { firstAnalysisDeadline } from "../domain/follow-up-schedule";
import { loadFollowUpPolicy, syncParticipationReminders } from "./follow-up-reminders";
import { transferOpenFollowUps } from "./follow-up-tasks";

type Clock = () => Date;
const opaqueId = z.string().min(1).max(256);

/** Active coaching links of an athlete, newest first, already checked by the current-data gate. */
async function activeLinks(db: PrismaClient, clock: Clock, athleteId: string, filter: { coachUserId?: string; primaryOnly?: boolean } = {}) {
  const now = clock();
  const rows = await db.coachAthleteAssignment.findMany({
    where: {
      athleteId, status: "ACTIVE", endedAt: null, startedAt: { lte: now },
      ...(filter.primaryOnly ? { isPrimary: true } : {}),
      coach: { status: "ACTIVE", ...(filter.coachUserId ? { userId: filter.coachUserId } : {}) },
    },
    select: { coachId: true, schoolId: true, coach: { select: { userId: true, displayName: true } } },
    orderBy: { startedAt: "desc" },
  });
  const gate = new CanReadAthleteCurrentData(db, clock);
  const valid: typeof rows = [];
  for (const row of rows) {
    if (await gate.execute(row.coach.userId, { athleteId, schoolId: row.schoolId })) valid.push(row);
  }
  return valid;
}

/**
 * Administrative record for a new participation (idempotent): the athlete's
 * primary active coach becomes responsible (AWAITING_ASSESSMENT); an athlete
 * enrolled in a school without a coach goes to that school's queue; anyone
 * else stays "sem professor responsável".
 */
export async function openPreparation(db: PrismaClient, clock: Clock, participation: { id: string; athleteId: string }, actorUserId: string | null) {
  const existing = await db.eventPreparation.findUnique({ where: { participationId: participation.id } });
  if (existing) return existing;
  const now = clock();
  const [link] = await activeLinks(db, clock, participation.athleteId, { primaryOnly: true });
  let schoolId: string | null = link?.schoolId ?? null;
  if (!link) {
    const membership = await db.schoolAthleteMembership.findFirst({
      where: { athleteId: participation.athleteId, status: "ACTIVE", endedAt: null, startedAt: { lte: now }, school: { status: "ACTIVE" } },
      select: { schoolId: true },
      orderBy: { startedAt: "desc" },
    });
    schoolId = membership?.schoolId ?? null;
  }
  const status = link ? "AWAITING_ASSESSMENT" : "UNASSIGNED";
  const id = randomUUID();
  try {
    return await db.eventPreparation.create({
      data: {
        id, participationId: participation.id, coachId: link?.coachId ?? null, schoolId, status,
        createdAt: now, updatedAt: now,
        transitions: { create: { id: randomUUID(), fromStatus: null, toStatus: status, toCoachId: link?.coachId ?? null, actorUserId, reason: "participação registrada", at: now } },
      },
    });
  } catch (error) {
    // A concurrent read created it first.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return db.eventPreparation.findUniqueOrThrow({ where: { participationId: participation.id } });
    }
    throw error;
  }
}

const preparationInclude = {
  coach: { select: { id: true, userId: true, displayName: true } },
  participation: {
    select: {
      id: true, athleteId: true, status: true, goalText: true,
      athlete: { select: { name: true } },
      event: { select: { id: true, name: true, startLocalDate: true, timeZone: true, sportType: true } },
      option: { select: { label: true } },
    },
  },
  transitions: { orderBy: { at: "asc" as const }, include: { actor: { select: { name: true } } } },
} satisfies Prisma.EventPreparationInclude;
type PreparationRow = Prisma.EventPreparationGetPayload<{ include: typeof preparationInclude }>;

/** The responsible lost the link (ended, transferred, school suspended…): back to UNASSIGNED, recorded. */
async function reconcile(db: PrismaClient, clock: Clock, row: PreparationRow): Promise<PreparationRow> {
  if (!row.coach || row.status === "CLOSED") return row;
  const allowed = await new CanReadAthleteCurrentData(db, clock).execute(row.coach.userId, { athleteId: row.participation.athleteId, schoolId: row.schoolId });
  if (allowed) return row;
  const now = clock();
  const updated = await db.eventPreparation.updateMany({
    where: { id: row.id, version: row.version },
    data: { coachId: null, status: "UNASSIGNED", version: { increment: 1 }, updatedAt: now },
  });
  if (updated.count > 0) {
    await db.eventPreparationTransition.create({
      data: { id: randomUUID(), preparationId: row.id, fromStatus: row.status, toStatus: "UNASSIGNED", fromCoachId: row.coach.id, toCoachId: null, actorUserId: null, reason: "vínculo com o professor encerrado", at: now },
    });
    // SAM-55 — the former coach's open tasks go to the school's coordination, or are cancelled (§7.3).
    if (row.schoolId) {
      await transferOpenFollowUpsOfPreparation(db, now, row, null, null, "vínculo com o professor encerrado");
      await onPreparationUnassigned(db, now, { preparationId: row.id, athleteId: row.participation.athleteId, schoolId: row.schoolId, transitionKey: String(row.version + 1) });
    } else {
      await cancelOpenFollowUps(db, now, row.id, row.participation.id, "vínculo com o professor encerrado");
    }
    await syncParticipationReminders(db, clock, row.participation.id);
  }
  return db.eventPreparation.findUniqueOrThrow({ where: { id: row.id }, include: preparationInclude });
}

export type PreparationRole = "athlete" | "responsible" | "collaborator" | "school";

async function resolveRole(db: PrismaClient, clock: Clock, actorUserId: string, row: PreparationRow): Promise<PreparationRole | null> {
  const athleteId = row.participation.athleteId;
  if (actorUserId === athleteId) return "athlete";
  const gate = new CanReadAthleteCurrentData(db, clock);
  if (row.coach?.userId === actorUserId && await gate.execute(actorUserId, { athleteId, schoolId: row.schoolId })) return "responsible";
  if (row.schoolId && await new CanManageSchool(new SchoolMembershipRepository(db)).execute(actorUserId, row.schoolId)) return "school";
  // Collaborators: other coaches with an active link to the athlete (§22.7). They see; opening is not a review.
  if ((await activeLinks(db, clock, athleteId, { coachUserId: actorUserId })).length > 0) return "collaborator";
  return null;
}

function toView(row: PreparationRow, role: PreparationRole) {
  return {
    id: row.id,
    status: row.status,
    statusText: preparationStatusText(row.status, row.coach?.displayName ?? null),
    coach: row.coach ? { id: row.coach.id, name: row.coach.displayName } : null,
    schoolId: row.schoolId,
    firstReviewLocalDate: row.firstReviewLocalDate,
    analysisNotes: role === "athlete" ? null : row.analysisNotes,
    startedAt: row.startedAt,
    closedAt: row.closedAt,
    version: row.version,
    role,
    participation: {
      id: row.participation.id,
      status: row.participation.status,
      goalText: row.participation.goalText,
      athleteId: row.participation.athleteId,
      athleteName: row.participation.athlete.name,
      event: row.participation.event,
      optionLabel: row.participation.option?.label ?? null,
    },
    transitions: row.transitions.map((transition) => ({
      fromStatus: transition.fromStatus, toStatus: transition.toStatus, fromCoachId: transition.fromCoachId,
      toCoachId: transition.toCoachId, actorName: transition.actor?.name ?? null, reason: transition.reason, at: transition.at,
    })),
  };
}
export type PreparationView = ReturnType<typeof toView>;

export async function loadAuthorized(db: PrismaClient, clock: Clock, actorUserId: string | null, preparationId: string) {
  if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
  const found = await db.eventPreparation.findUnique({ where: { id: opaqueId.parse(preparationId) }, include: preparationInclude });
  if (!found) throw new SchoolError("PREPARATION_NOT_FOUND", "Acompanhamento não encontrado.", 404);
  const row = await reconcile(db, clock, found);
  const role = await resolveRole(db, clock, actorUserId, row);
  if (!role) throw new SchoolError("PREPARATION_NOT_FOUND", "Acompanhamento não encontrado.", 404);
  return { row, role };
}

export class GetEventPreparation {
  constructor(private readonly db: PrismaClient, private readonly clock: Clock = () => new Date()) {}

  async execute(actorUserId: string | null, preparationId: string): Promise<PreparationView> {
    const { row, role } = await loadAuthorized(this.db, this.clock, actorUserId, preparationId);
    return toView(row, role);
  }
}

/** Preparations a coach is responsible for, plus the unassigned queue of schools the actor manages (§7.1). */
export class ListCoachPreparations {
  constructor(private readonly db: PrismaClient, private readonly clock: Clock = () => new Date()) {}

  async execute(actorUserId: string | null): Promise<PreparationView[]> {
    if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const profile = await this.db.coachProfile.findUnique({ where: { userId: actorUserId }, select: { id: true } });
    const responsible = profile
      ? await this.db.eventPreparation.findMany({ where: { coachId: profile.id, status: { not: "CLOSED" } }, include: preparationInclude, orderBy: { createdAt: "desc" }, take: 200 })
      : [];
    const queue = await this.db.eventPreparation.findMany({
      where: { coachId: null, status: "UNASSIGNED", schoolId: { not: null }, school: { memberships: { some: { userId: actorUserId, status: "ACTIVE", endedAt: null } } } },
      include: preparationInclude,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const views: PreparationView[] = [];
    for (const found of [...responsible, ...queue]) {
      const row = await reconcile(this.db, this.clock, found);
      const role = await resolveRole(this.db, this.clock, actorUserId, row);
      if (role && role !== "athlete" && (role !== "collaborator" || row.coach?.userId === actorUserId)) views.push(toView(row, role));
    }
    return views;
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("assume"),
    expectedVersion: z.number().int().min(1),
    firstReviewLocalDate: z.string().refine(isValidLocalDate, "Data inválida (AAAA-MM-DD).").nullish(),
    analysisNotes: z.string().trim().max(2000).nullish(),
  }),
  z.strictObject({ action: z.literal("assign"), expectedVersion: z.number().int().min(1), coachId: opaqueId, reason: z.string().trim().max(500).nullish() }),
  z.strictObject({ action: z.literal("pause"), expectedVersion: z.number().int().min(1), reason: z.string().trim().min(1, "Informe o motivo.").max(500) }),
  z.strictObject({ action: z.literal("resume"), expectedVersion: z.number().int().min(1), reason: z.string().trim().max(500).nullish() }),
  z.strictObject({ action: z.literal("close"), expectedVersion: z.number().int().min(1), reason: z.string().trim().min(1, "Informe o motivo.").max(500) }),
]);

const WHO_MAY: Record<PreparationAction, readonly PreparationRole[]> = {
  // A coach with an active link confirms responsibility (§6 passo 7); the responsible re-confirms.
  assume: ["responsible", "collaborator"],
  assign: ["school"],
  pause: ["responsible"],
  resume: ["responsible"],
  close: ["responsible", "school"],
};

export class ChangeEventPreparation {
  constructor(private readonly db: PrismaClient, private readonly clock: Clock = () => new Date()) {}

  async execute(actorUserId: string | null, preparationId: string, raw: unknown): Promise<PreparationView> {
    const input = actionSchema.parse(raw);
    const { row, role } = await loadAuthorized(this.db, this.clock, actorUserId, preparationId);
    if (!(WHO_MAY[input.action] as readonly string[]).includes(role)) {
      throw new SchoolError("FORBIDDEN", "Você não pode fazer isso neste acompanhamento.", 403);
    }
    if (!canApply(input.action, row.status)) {
      throw new SchoolError("PREPARATION_INVALID_STATE", "Este acompanhamento não permite essa ação no estado atual.", 409);
    }
    const now = this.clock();
    let data: Prisma.EventPreparationUpdateManyMutationInput & { coachId?: string | null; schoolId?: string | null };
    let reason: string | null = null;
    switch (input.action) {
      case "assume": {
        const [link] = await activeLinks(this.db, this.clock, row.participation.athleteId, { coachUserId: actorUserId! });
        if (!link) throw new SchoolError("PREPARATION_NOT_FOUND", "Acompanhamento não encontrado.", 404);
        // Another responsible already holds it: the school (or that coach) decides, not a collaborator.
        if (row.coach && row.coach.id !== link.coachId) throw new SchoolError("PREPARATION_HAS_RESPONSIBLE", "Este acompanhamento já tem professor responsável.", 409);
        data = {
          coachId: link.coachId, schoolId: link.schoolId, status: "PLANNING", startedAt: row.startedAt ?? now,
          firstReviewLocalDate: input.firstReviewLocalDate ?? null, analysisNotes: input.analysisNotes ?? null,
        };
        reason = "professor assumiu o acompanhamento";
        break;
      }
      case "assign": {
        const target = await this.db.coachAthleteAssignment.findFirst({
          where: { athleteId: row.participation.athleteId, coachId: input.coachId, schoolId: row.schoolId, status: "ACTIVE", endedAt: null, startedAt: { lte: now } },
          select: { coach: { select: { userId: true } } },
        });
        if (!target || !await new CanReadAthleteCurrentData(this.db, this.clock).execute(target.coach.userId, { athleteId: row.participation.athleteId, schoolId: row.schoolId })) {
          throw new SchoolError("COACH_ATHLETE_ASSIGNMENT_NOT_FOUND", "Esse professor não acompanha o atleta na escola.", 404);
        }
        data = { coachId: input.coachId, status: "AWAITING_ASSESSMENT" };
        reason = input.reason ?? "escola definiu o responsável";
        break;
      }
      case "pause":
        data = { status: "PAUSED" };
        reason = input.reason;
        break;
      case "resume":
        data = { status: "PLANNING" };
        reason = input.reason ?? "acompanhamento retomado";
        break;
      case "close":
        data = { status: "CLOSED", closedAt: now, coachId: row.coach?.id ?? null };
        reason = input.reason;
        break;
    }

    await this.db.$transaction(async (tx) => {
      const updated = await tx.eventPreparation.updateMany({
        where: { id: row.id, version: input.expectedVersion },
        data: { ...data, version: { increment: 1 }, updatedAt: now },
      });
      if (updated.count === 0) {
        throw new SchoolError("PREPARATION_CONFLICT", "Este acompanhamento foi alterado por outra pessoa. Recarregue e tente de novo.", 409);
      }
      await tx.eventPreparationTransition.create({
        data: {
          id: randomUUID(), preparationId: row.id, fromStatus: row.status, toStatus: String(data.status),
          fromCoachId: row.coach?.id ?? null, toCoachId: data.coachId === undefined ? row.coach?.id ?? null : data.coachId,
          actorUserId, reason, at: now,
        },
      });
      // SAM-55 — a new responsible decided by an authorized person takes the open tasks (§7.3).
      if ((input.action === "assume" || input.action === "assign") && data.coachId && data.coachId !== row.coach?.id) {
        const coach = await tx.coachProfile.findUnique({ where: { id: data.coachId }, select: { userId: true } });
        if (coach) await transferOpenFollowUpsOfPreparation(tx, now, row, coach.userId, actorUserId, reason ?? "novo responsável");
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 20_000 });
    // SAM-56 — assuming ends the first-analysis deadline; closing cancels the reminders.
    await syncParticipationReminders(this.db, this.clock, row.participation.id);
    return new GetEventPreparation(this.db, this.clock).execute(actorUserId, row.id);
  }
}

/** The athlete cancelled the participation: the follow-up closes with that reason (§20). */
export async function closePreparationForCancelledParticipation(tx: Prisma.TransactionClient, participationId: string, actorUserId: string, now: Date) {
  const preparation = await tx.eventPreparation.findUnique({ where: { participationId } });
  if (!preparation || preparation.status === "CLOSED") return;
  await tx.eventPreparation.update({
    where: { id: preparation.id },
    data: { status: "CLOSED", closedAt: now, version: { increment: 1 }, updatedAt: now },
  });
  await tx.eventPreparationTransition.create({
    data: { id: randomUUID(), preparationId: preparation.id, fromStatus: preparation.status, toStatus: "CLOSED", fromCoachId: preparation.coachId, toCoachId: preparation.coachId, actorUserId, reason: "participação cancelada", at: now },
  });
}

export type PreparationSummary = {
  id: string;
  status: string;
  statusText: string;
  coachName: string | null;
  /** SAM-56 — "primeira análise prevista até": the organization's configured deadline, while it is awaited. */
  firstAnalysisDueLocalDate: string | null;
};

/** State of a participation's follow-up after reconciling a lost link (null when none exists). */
export async function preparationSummaryOf(db: PrismaClient, clock: Clock, participationId: string): Promise<PreparationSummary | null> {
  const found = await db.eventPreparation.findUnique({ where: { participationId }, include: preparationInclude });
  if (!found) return null;
  const row = await reconcile(db, clock, found);
  const coachName = row.coach?.displayName ?? null;
  const awaited = row.status === "AWAITING_ASSESSMENT" || (row.status === "UNASSIGNED" && row.schoolId !== null);
  const firstAnalysisDueLocalDate = awaited
    ? firstAnalysisDeadline(row.createdAt, await loadFollowUpPolicy(db, { schoolId: row.schoolId, coachId: row.schoolId ? null : row.coach?.id ?? null })).dueLocalDate
    : null;
  const due = firstAnalysisDueLocalDate ? ` — primeira análise prevista até ${firstAnalysisDueLocalDate.slice(8, 10)}/${firstAnalysisDueLocalDate.slice(5, 7)}` : "";
  return { id: row.id, status: row.status, statusText: `${preparationStatusText(row.status, coachName)}${row.status === "AWAITING_ASSESSMENT" ? due : ""}`, coachName, firstAnalysisDueLocalDate };
}

type Db = PrismaClient | Prisma.TransactionClient;

/** Open tasks of a preparation and of its participation move to `assigneeUserId` (null = school queue). */
async function transferOpenFollowUpsOfPreparation(db: Db, now: Date, row: { id: string; participation: { id: string } }, assigneeUserId: string | null, actorUserId: string | null, reason: string) {
  await transferOpenFollowUps(db, now, "EventPreparation", row.id, assigneeUserId, actorUserId, reason);
  await transferOpenFollowUps(db, now, "AthleteEventParticipation", row.participation.id, assigneeUserId, actorUserId, reason);
}

/** Independent scope without a responsible: nobody else may receive them, so they close. */
async function cancelOpenFollowUps(db: Db, now: Date, preparationId: string, participationId: string, reason: string) {
  const open = await db.followUpTask.findMany({
    where: { OR: [{ sourceType: "EventPreparation", sourceId: preparationId }, { sourceType: "AthleteEventParticipation", sourceId: participationId }], status: { in: ["NEW", "SEEN", "IN_PROGRESS", "RESCHEDULED"] } },
    select: { id: true, status: true },
  });
  for (const task of open) {
    await db.followUpTask.update({ where: { id: task.id }, data: { status: "CANCELLED", version: { increment: 1 }, updatedAt: now } });
    await db.followUpTaskTransition.create({ data: { id: randomUUID(), taskId: task.id, fromStatus: task.status, toStatus: "CANCELLED", actorUserId: null, reason, at: now } });
  }
}
