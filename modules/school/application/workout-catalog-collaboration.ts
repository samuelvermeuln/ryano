/**
 * SAM-78 — the collaborative institutional catalog (§9.1, §20, §26.5, §27.2–27.3).
 *
 * - Roles in a school's catalog are assigned by OWNER/ADMIN: EDITOR edits
 *   institutional templates, REVIEWER reviews and publishes proposals, READER
 *   only reads (every active coach of the school already reads).
 * - A coach proposes one of their personal templates; a reviewer (or the
 *   school's management) publishes it as a COPY in the institutional catalog
 *   with the author kept and the usage rights recorded. The personal template
 *   stays the coach's.
 * - Policy on a coach leaving (§27.3, recorded in SAM-78): the institutional
 *   template stays with the school (author kept, no longer editable by them);
 *   the personal catalog leaves with the coach; sessions already delivered
 *   keep their snapshot. Pending proposals of the leaving coach are withdrawn.
 */
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import { SchoolError } from "../domain/errors";
import { summarizeTemplate, TEMPLATE_CONTENT_SCHEMA_VERSION, templateContentSchema, templateMetaSchema, templateSearchText } from "../domain/workout-template-content";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageSchool } from "./can-manage-school";

const TX = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 20_000 } as const;
const id = z.string().min(1).max(256);

import { CATALOG_ROLES, type CatalogRole } from "../domain/catalog-roles";
export { CATALOG_ROLES, CATALOG_ROLE_LABELS, type CatalogRole } from "../domain/catalog-roles";

export async function catalogRoleOf(db: PrismaClient, schoolId: string, coachId: string | null): Promise<CatalogRole | null> {
  if (!coachId) return null;
  const row = await db.schoolCatalogRole.findUnique({ where: { schoolId_coachId: { schoolId, coachId } }, select: { role: true } });
  return (row?.role as CatalogRole | undefined) ?? null;
}

async function requireManagement(db: PrismaClient, actorUserId: string | null, schoolId: string) {
  if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
  if (!await new CanManageSchool(new SchoolMembershipRepository(db)).execute(actorUserId, schoolId)) {
    throw new SchoolError("FORBIDDEN", "Só a gestão da escola faz isso.", 403);
  }
}

async function coachOf(db: PrismaClient, actorUserId: string | null) {
  if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
  const coach = await db.coachProfile.findUnique({ where: { userId: actorUserId }, select: { id: true, status: true, displayName: true } });
  if (!coach || coach.status !== "ACTIVE") throw new SchoolError("FORBIDDEN", "Apenas professores ativos.", 403);
  return coach;
}

export class SetCatalogRole {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, schoolId: string, raw: unknown) {
    await requireManagement(this.db, actorUserId, schoolId);
    const input = z.strictObject({ coachId: id, role: z.enum(CATALOG_ROLES).nullable() }).parse(raw);
    const member = await this.db.coachSchoolMembership.findFirst({ where: { schoolId, coachId: input.coachId, status: "ACTIVE", endedAt: null }, select: { id: true } });
    if (!member) throw new SchoolError("COACH_NOT_FOUND", "Professor não está ativo nesta escola.", 404);
    const now = this.clock();
    if (input.role === null) {
      await this.db.schoolCatalogRole.deleteMany({ where: { schoolId, coachId: input.coachId } });
      return { role: null };
    }
    await this.db.schoolCatalogRole.upsert({
      where: { schoolId_coachId: { schoolId, coachId: input.coachId } },
      create: { id: randomUUID(), schoolId, coachId: input.coachId, role: input.role, assignedByUserId: actorUserId!, createdAt: now, updatedAt: now },
      update: { role: input.role, assignedByUserId: actorUserId!, updatedAt: now },
    });
    return { role: input.role };
  }
}

export class ProposeTemplate {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  /** A coach offers one of their personal templates to a school they coach at. */
  async execute(actorUserId: string | null, raw: unknown) {
    const coach = await coachOf(this.db, actorUserId);
    const input = z.strictObject({ templateId: id, schoolId: id, note: z.string().trim().max(1000).nullish(), usageRights: z.string().trim().max(300).nullish() }).parse(raw);
    const template = await this.db.workoutTemplate.findUnique({ where: { id: input.templateId }, select: { id: true, ownerType: true, authorCoachId: true, version: true, status: true } });
    if (!template || template.ownerType !== "COACH" || template.authorCoachId !== coach.id) throw new SchoolError("WORKOUT_TEMPLATE_NOT_FOUND", "Modelo não encontrado.", 404);
    if (template.status === "ARCHIVED") throw new SchoolError("VALIDATION_ERROR", "Modelo arquivado não é proposto.", 422);
    const member = await this.db.coachSchoolMembership.findFirst({ where: { schoolId: input.schoolId, coachId: coach.id, status: "ACTIVE", endedAt: null, suspendedAt: null }, select: { id: true } });
    if (!member) throw new SchoolError("FORBIDDEN", "Você não é professor ativo desta escola.", 403);
    const pending = await this.db.workoutTemplateProposal.findFirst({ where: { schoolId: input.schoolId, templateId: template.id, status: "PENDING" }, select: { id: true } });
    if (pending) return { proposalId: pending.id, status: "PENDING" as const, duplicate: true };
    const created = await this.db.workoutTemplateProposal.create({
      data: { id: randomUUID(), schoolId: input.schoolId, templateId: template.id, templateVersion: template.version, proposedByCoachId: coach.id, note: input.note || null, usageRights: input.usageRights || null, status: "PENDING", createdAt: this.clock() },
      select: { id: true },
    });
    return { proposalId: created.id, status: "PENDING" as const, duplicate: false };
  }
}

export class ReviewTemplateProposal {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  /** OWNER/ADMIN or a REVIEWER of the school: approve = publish a copy with the author kept; reject keeps the note. */
  async execute(actorUserId: string | null, proposalId: string, raw: unknown) {
    if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = z.strictObject({ decision: z.enum(["APPROVE", "REJECT"]), reviewNote: z.string().trim().max(1000).nullish() }).parse(raw);
    const proposal = await this.db.workoutTemplateProposal.findUnique({
      where: { id: proposalId },
      include: { template: { include: { versions: { orderBy: { number: "desc" }, take: 1 } } }, proposer: { select: { id: true, displayName: true, userId: true } } },
    });
    if (!proposal) throw new SchoolError("PROPOSAL_NOT_FOUND", "Proposta não encontrada.", 404);
    if (proposal.status !== "PENDING") throw new SchoolError("PROPOSAL_CLOSED", "Esta proposta já foi revisada.", 409);
    const manages = await new CanManageSchool(new SchoolMembershipRepository(this.db)).execute(actorUserId, proposal.schoolId);
    if (!manages) {
      const coach = await this.db.coachProfile.findUnique({ where: { userId: actorUserId }, select: { id: true } });
      if ((await catalogRoleOf(this.db, proposal.schoolId, coach?.id ?? null)) !== "REVIEWER") throw new SchoolError("FORBIDDEN", "Só a gestão ou um revisor do catálogo revisa propostas.", 403);
    }
    const now = this.clock();
    if (input.decision === "REJECT") {
      await this.db.workoutTemplateProposal.update({ where: { id: proposal.id }, data: { status: "REJECTED", reviewNote: input.reviewNote || null, reviewedByUserId: actorUserId, reviewedAt: now } });
      return { status: "REJECTED" as const, publishedTemplateId: null };
    }
    const source = proposal.template;
    const version = source.versions[0];
    if (!version) throw new SchoolError("VALIDATION_ERROR", "O modelo proposto não tem conteúdo.", 422);
    const content = templateContentSchema.parse(version.content ?? {});
    const meta = templateMetaSchema.parse({
      title: source.title, code: source.code, contentKind: source.contentKind, sportType: source.sportType, environment: source.environment, sessionType: source.sessionType,
      capabilities: source.capabilities, level: source.level, phase: source.phase, tags: source.tags, folder: source.folder, description: source.description, status: "ACTIVE",
    });
    const copyId = randomUUID();
    await this.db.$transaction(async (tx) => {
      // The copy is the school's (ownerType SCHOOL) and keeps the author: authorship is preserved, the personal template untouched.
      await tx.workoutTemplate.create({
        data: {
          id: copyId, ownerType: "SCHOOL", ownerId: proposal.schoolId, schoolId: proposal.schoolId, authorCoachId: proposal.proposedByCoachId,
          title: meta.title, code: meta.code, contentKind: meta.contentKind, sportType: meta.sportType, environment: meta.environment, sessionType: meta.sessionType,
          capabilities: meta.capabilities, level: meta.level, phase: meta.phase, tags: meta.tags, folder: meta.folder, description: meta.description,
          status: "ACTIVE", version: 1, sourceTemplateId: source.id, usageRights: proposal.usageRights,
          searchText: templateSearchText(meta, content, proposal.proposer.displayName), createdAt: now, updatedAt: now,
        },
      });
      await tx.workoutTemplateVersion.create({
        data: { id: randomUUID(), templateId: copyId, number: 1, schemaVersion: TEMPLATE_CONTENT_SCHEMA_VERSION, content: content as Prisma.InputJsonValue, summary: summarizeTemplate(content) as unknown as Prisma.InputJsonValue, authorUserId: proposal.proposer.userId, createdAt: now },
      });
      await tx.workoutTemplateProposal.update({ where: { id: proposal.id }, data: { status: "APPROVED", reviewNote: input.reviewNote || null, reviewedByUserId: actorUserId, reviewedAt: now, publishedTemplateId: copyId } });
    }, TX);
    return { status: "APPROVED" as const, publishedTemplateId: copyId };
  }
}

export async function listSchoolProposals(db: PrismaClient, schoolId: string, status: "PENDING" | "ALL" = "PENDING") {
  const rows = await db.workoutTemplateProposal.findMany({
    where: { schoolId, ...(status === "PENDING" ? { status: "PENDING" } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, status: true, note: true, usageRights: true, reviewNote: true, createdAt: true, publishedTemplateId: true, template: { select: { id: true, title: true, sportType: true } }, proposer: { select: { displayName: true } } },
  });
  return rows;
}

export async function listCatalogRoles(db: PrismaClient, schoolId: string) {
  const [roles, coaches] = await Promise.all([
    db.schoolCatalogRole.findMany({ where: { schoolId }, select: { coachId: true, role: true } }),
    db.coachSchoolMembership.findMany({ where: { schoolId, status: "ACTIVE", endedAt: null }, select: { coach: { select: { id: true, displayName: true } } } }),
  ]);
  const byCoach = new Map(roles.map((row) => [row.coachId, row.role as CatalogRole]));
  return coaches.map((row) => ({ coachId: row.coach.id, name: row.coach.displayName, role: byCoach.get(row.coach.id) ?? null }));
}

/** §27.3 — when a coach leaves a school: institutional stays, personal leaves, pending proposals are withdrawn. */
export async function withdrawProposalsOfLeavingCoach(tx: Prisma.TransactionClient, schoolId: string, coachId: string, now: Date) {
  await tx.workoutTemplateProposal.updateMany({ where: { schoolId, proposedByCoachId: coachId, status: "PENDING" }, data: { status: "WITHDRAWN", reviewNote: "professor desligado da escola", reviewedAt: now } });
  await tx.schoolCatalogRole.deleteMany({ where: { schoolId, coachId } });
}
