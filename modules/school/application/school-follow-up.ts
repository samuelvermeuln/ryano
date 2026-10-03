/**
 * SAM-68 — the school's (coordination = OWNER/ADMIN, no new role) view of
 * follow-up (§19.3, §20, §16.4, §22.7):
 *
 * - distribution of responsibility (preparations per coach, the queue
 *   without a responsible), events with the school's participants (each with
 *   their own goal and state), open tasks per coach;
 * - assigning a coach to a preparation of the queue — creating the coach's
 *   link first when needed (primary if the athlete has none, collaborator
 *   otherwise) — and adding collaborators by discipline. The primary keeps
 *   answering for the integrated planning; a task has one clear responsible.
 *
 * Organizing the follow-up never hands sensitive data to the coordination:
 * nothing here reads health, biometrics or activities (ADR escola 005).
 */
import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { assignCoachToAthleteInTransaction } from "./assign-coach-to-athlete";
import { CanManageSchool } from "./can-manage-school";
import { ChangeEventPreparation } from "./event-preparations";

type Clock = () => Date;
const OPEN_TASK = ["NEW", "SEEN", "IN_PROGRESS", "RESCHEDULED"];
const TX = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 20_000 } as const;

async function assertCoordination(db: PrismaClient, actorUserId: string | null, schoolId: string) {
  if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
  if (!await new CanManageSchool(new SchoolMembershipRepository(db)).execute(actorUserId, schoolId)) {
    throw new SchoolError("FORBIDDEN", "Só a coordenação da escola organiza os acompanhamentos.", 403);
  }
  return actorUserId;
}

export class GetSchoolFollowUpBoard {
  constructor(private readonly db: PrismaClient, private readonly clock: Clock = () => new Date()) {}

  async execute(actorUserId: string | null, schoolId: string) {
    await assertCoordination(this.db, actorUserId, schoolId);
    const now = this.clock();
    const [preparations, coaches, athletes, tasks] = await Promise.all([
      this.db.eventPreparation.findMany({
        where: { schoolId, status: { not: "CLOSED" } },
        select: {
          id: true, status: true, version: true, coachId: true, coach: { select: { displayName: true } },
          participation: { select: { id: true, athleteId: true, goalText: true, athlete: { select: { name: true } }, event: { select: { id: true, name: true, startLocalDate: true } }, option: { select: { label: true } } } },
        },
        orderBy: { createdAt: "desc" },
        take: 300,
      }),
      this.db.coachSchoolMembership.findMany({
        where: { schoolId, status: "ACTIVE", endedAt: null, suspendedAt: null },
        select: { coachId: true, coach: { select: { displayName: true, userId: true } } },
      }),
      this.db.schoolAthleteMembership.findMany({
        where: { schoolId, status: "ACTIVE", endedAt: null },
        select: { athleteId: true, athlete: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      }),
      this.db.followUpTask.findMany({
        where: { schoolId, status: { in: OPEN_TASK } },
        select: { assigneeUserId: true, dueAt: true, rescheduledTo: true },
      }),
    ]);
    const participationIds = preparations.map((row) => row.participation.id);
    const athleteIds = [...new Set(preparations.map((row) => row.participation.athleteId))];
    const [agreedGoals, links] = await Promise.all([
      participationIds.length === 0 ? [] : this.db.athleteGoal.findMany({
        where: { participationId: { in: participationIds }, origin: "COACH_AGREED", status: "ACTIVE" },
        select: { participationId: true, description: true },
        orderBy: { updatedAt: "desc" },
      }),
      athleteIds.length === 0 ? [] : this.db.coachAthleteAssignment.findMany({
        where: { schoolId, athleteId: { in: athleteIds }, status: "ACTIVE", endedAt: null },
        select: { athleteId: true, isPrimary: true, discipline: true, coach: { select: { displayName: true } } },
      }),
    ]);

    const events = new Map<string, { eventId: string; name: string; date: string; participants: Array<Record<string, unknown>> }>();
    for (const row of preparations) {
      const { event } = row.participation;
      const agreed = agreedGoals.find((goal) => goal.participationId === row.participation.id);
      const group = events.get(event.id) ?? { eventId: event.id, name: event.name, date: event.startLocalDate, participants: [] };
      group.participants.push({
        participationId: row.participation.id, preparationId: row.id, version: row.version, status: row.status,
        athleteId: row.participation.athleteId, athleteName: row.participation.athlete.name ?? "Aluno", option: row.participation.option?.label ?? null,
        goal: agreed ? `${agreed.description} (pactuado)` : row.participation.goalText ? `${row.participation.goalText} (desejado)` : null,
        responsible: row.coach?.displayName ?? null,
        team: links.filter((link) => link.athleteId === row.participation.athleteId)
          .map((link) => ({ name: link.coach.displayName, primary: link.isPrimary, discipline: link.discipline })),
      });
      events.set(event.id, group);
    }
    const overdue = (task: (typeof tasks)[number]) => {
      const deadline = task.rescheduledTo ?? task.dueAt;
      return deadline !== null && deadline < now;
    };
    return {
      events: [...events.values()].sort((a, b) => a.date.localeCompare(b.date)) as Array<{ eventId: string; name: string; date: string; participants: BoardParticipant[] }>,
      distribution: coaches.map((membership) => {
        const mine = preparations.filter((row) => row.coachId === membership.coachId);
        const myTasks = tasks.filter((task) => task.assigneeUserId === membership.coach.userId);
        return {
          coachId: membership.coachId, name: membership.coach.displayName, preparations: mine.length,
          awaitingAnalysis: mine.filter((row) => row.status === "AWAITING_ASSESSMENT").length,
          reviewPending: mine.filter((row) => row.status === "REVIEW_PENDING").length,
          openTasks: myTasks.length, overdueTasks: myTasks.filter(overdue).length,
        };
      }),
      unassigned: preparations.filter((row) => row.coachId === null).length,
      queueTasks: tasks.filter((task) => task.assigneeUserId === null).length,
      coaches: coaches.map((membership) => ({ coachId: membership.coachId, name: membership.coach.displayName })),
      athletes: athletes.map((membership) => ({ athleteId: membership.athleteId, name: membership.athlete.name ?? "Aluno" })),
    };
  }
}

export type BoardParticipant = {
  participationId: string; preparationId: string; version: number; status: string; athleteId: string; athleteName: string;
  option: string | null; goal: string | null; responsible: string | null;
  team: Array<{ name: string; primary: boolean; discipline: string | null }>;
};

/**
 * "Atribuir professor" on the queue: the coach gets a link with the athlete
 * when they do not have one (primary when the athlete has none in the school,
 * collaborator otherwise), then becomes responsible for the preparation.
 */
export class AssignPreparationCoach {
  constructor(private readonly db: PrismaClient, private readonly clock: Clock = () => new Date()) {}

  async execute(actorUserId: string | null, preparationId: string, raw: unknown) {
    const input = z.strictObject({ coachId: z.string().min(1).max(256), expectedVersion: z.number().int().min(1) }).parse(raw);
    const preparation = await this.db.eventPreparation.findUnique({
      where: { id: z.string().min(1).max(256).parse(preparationId) },
      select: { id: true, schoolId: true, participation: { select: { athleteId: true } } },
    });
    if (!preparation?.schoolId) throw new SchoolError("PREPARATION_NOT_FOUND", "Acompanhamento não encontrado.", 404);
    const actor = await assertCoordination(this.db, actorUserId, preparation.schoolId);
    const schoolId = preparation.schoolId;
    const athleteId = preparation.participation.athleteId;
    await this.db.$transaction(async (tx) => {
      const linked = await tx.coachAthleteAssignment.findFirst({ where: { schoolId, athleteId, coachId: input.coachId, status: "ACTIVE", endedAt: null }, select: { id: true } });
      if (linked) return;
      const primary = await tx.coachAthleteAssignment.findFirst({ where: { schoolId, athleteId, isPrimary: true, status: "ACTIVE", endedAt: null }, select: { id: true } });
      await assignCoachToAthleteInTransaction(tx, actor, schoolId, athleteId, input.coachId, this.clock(), "atribuído pela coordenação ao acompanhamento de evento", { isPrimary: !primary });
    }, TX);
    return new ChangeEventPreparation(this.db, this.clock).execute(actor, preparation.id, {
      action: "assign", expectedVersion: input.expectedVersion, coachId: input.coachId, reason: "coordenação definiu o responsável",
    });
  }
}

export const collaboratorSchema = z.strictObject({
  athleteId: z.string().min(1).max(256),
  coachId: z.string().min(1).max(256),
  discipline: z.string().trim().max(60).nullish().transform((value) => (value ? value : null)),
});

/** §16.4/§22.7 — another coach of the school joins the athlete's team for a discipline. */
export class AddCollaboratorCoach {
  constructor(private readonly db: PrismaClient, private readonly clock: Clock = () => new Date()) {}

  async execute(actorUserId: string | null, schoolId: string, raw: unknown) {
    const input = collaboratorSchema.parse(raw);
    const actor = await assertCoordination(this.db, actorUserId, schoolId);
    return this.db.$transaction(
      (tx) => assignCoachToAthleteInTransaction(tx, actor, schoolId, input.athleteId, input.coachId, this.clock(), "colaborador definido pela coordenação", { isPrimary: false, discipline: input.discipline }),
      TX,
    );
  }
}
