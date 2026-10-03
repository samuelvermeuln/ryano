/**
 * SAM-58 — the coach's (and the school's) catalog of workout templates with
 * immutable versioned content (§9, AC05, AC08).
 *
 * - Personal templates (ownerType COACH) belong to their author coach.
 *   Institutional ones (ownerType SCHOOL) are read by the school's active
 *   coaches and written by its OWNER/ADMIN or by the author while still an
 *   active coach there (§20).
 * - Saving content creates the next WorkoutTemplateVersion; earlier versions
 *   stay readable. A prescription made from a version keeps its own snapshot
 *   (ADR-004), so editing never changes what an athlete received (AC08).
 * - Archiving hides the template from new uses; history keeps it.
 * - Nothing here assigns anything to an athlete (§9.1, ADR-010): "Usar este
 *   modelo" only pre-fills the coach's prescription builder.
 */
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import {
  blocksWithoutPersonalData,
  searchTerms,
  summarizeTemplate,
  templateContentSchema,
  templateMetaSchema,
  templateSearchText,
  TEMPLATE_CONTENT_SCHEMA_VERSION,
  type TemplateContent,
  type TemplateSummary,
} from "../domain/workout-template-content";
import { prescriptionBlockSchema } from "../domain/prescription-block";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageSchool } from "./can-manage-school";
import { catalogRoleOf } from "./workout-catalog-collaboration";

const opaqueId = z.string().min(1).max(256);
const TX = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 20_000 } as const;

type Actor = { userId: string; coachId: string | null; displayName: string | null; schoolsAsCoach: string[] };

async function actorOf(db: PrismaClient, actorUserId: string | null): Promise<Actor> {
  if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
  const coach = await db.coachProfile.findUnique({
    where: { userId: actorUserId },
    select: { id: true, status: true, displayName: true, schoolMemberships: { where: { status: "ACTIVE", endedAt: null, suspendedAt: null, school: { status: "ACTIVE" } }, select: { schoolId: true } } },
  });
  const managed = await db.schoolMembership.findMany({
    where: { userId: actorUserId, status: "ACTIVE", endedAt: null, roles: { some: { role: { in: ["OWNER", "ADMIN"] } } } },
    select: { schoolId: true },
  });
  const active = coach?.status === "ACTIVE" ? coach : null;
  return {
    userId: actorUserId,
    coachId: active?.id ?? null,
    displayName: active?.displayName ?? null,
    schoolsAsCoach: [...new Set([...(active?.schoolMemberships.map((row) => row.schoolId) ?? []), ...managed.map((row) => row.schoolId)])],
  };
}

type TemplateRow = { id: string; ownerType: string; authorCoachId: string | null; schoolId: string | null };

function canRead(actor: Actor, template: TemplateRow): boolean {
  if (template.ownerType === "COACH") return actor.coachId !== null && template.authorCoachId === actor.coachId;
  if (template.ownerType === "SCHOOL") return template.schoolId !== null && actor.schoolsAsCoach.includes(template.schoolId);
  return false;
}

async function canWrite(db: PrismaClient, actor: Actor, template: TemplateRow): Promise<boolean> {
  if (template.ownerType === "COACH") return actor.coachId !== null && template.authorCoachId === actor.coachId;
  if (template.ownerType !== "SCHOOL" || !template.schoolId) return false;
  if (await new CanManageSchool(new SchoolMembershipRepository(db)).execute(actor.userId, template.schoolId)) return true;
  if (actor.coachId === null || !actor.schoolsAsCoach.includes(template.schoolId)) return false;
  if (template.authorCoachId === actor.coachId) return true;
  // SAM-78 - an EDITOR of the school catalog edits any institutional template (new version, author kept per version).
  return (await catalogRoleOf(db, template.schoolId, actor.coachId)) === "EDITOR";
}

async function loadReadable(db: PrismaClient, actor: Actor, templateId: string) {
  const template = await db.workoutTemplate.findUnique({ where: { id: opaqueId.parse(templateId) } });
  if (!template || !canRead(actor, template)) throw new SchoolError("WORKOUT_TEMPLATE_NOT_FOUND", "Modelo não encontrado.", 404);
  return template;
}

const scopeSchema = z.union([
  z.strictObject({ kind: z.literal("coach") }),
  z.strictObject({ kind: z.literal("school"), schoolId: opaqueId }),
]);

const createSchema = z.strictObject({ scope: scopeSchema, meta: z.unknown(), content: z.unknown() });
const saveSchema = z.strictObject({ meta: z.unknown(), content: z.unknown(), expectedVersion: z.number().int().min(1) });

function metaColumns(meta: z.infer<typeof templateMetaSchema>) {
  return {
    title: meta.title, code: meta.code, contentKind: meta.contentKind, sportType: meta.sportType, environment: meta.environment,
    sessionType: meta.sessionType, capabilities: meta.capabilities, level: meta.level, phase: meta.phase, tags: meta.tags,
    folder: meta.folder, description: meta.description,
  };
}

export class WorkoutCatalog {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async create(actorUserId: string | null, raw: unknown) {
    const actor = await actorOf(this.db, actorUserId);
    if (!actor.coachId) throw new SchoolError("FORBIDDEN", "Apenas professores ativos criam modelos.", 403);
    const input = createSchema.parse(raw);
    const meta = templateMetaSchema.parse(input.meta);
    const content = templateContentSchema.parse(input.content ?? {});
    if (input.scope.kind === "school") {
      const allowed = actor.schoolsAsCoach.includes(input.scope.schoolId)
        && await new CanManageSchool(new SchoolMembershipRepository(this.db)).execute(actor.userId, input.scope.schoolId);
      if (!allowed) throw new SchoolError("FORBIDDEN", "Só a gestão da escola cria modelos institucionais.", 403);
    }
    return this.persistNew(actor, {
      ownerType: input.scope.kind === "school" ? "SCHOOL" : "COACH",
      ownerId: input.scope.kind === "school" ? input.scope.schoolId : actor.coachId,
      schoolId: input.scope.kind === "school" ? input.scope.schoolId : null,
      meta, content, parentTemplateId: null,
    });
  }

  private async persistNew(actor: Actor, input: { ownerType: "COACH" | "SCHOOL"; ownerId: string; schoolId: string | null; meta: z.infer<typeof templateMetaSchema>; content: TemplateContent; parentTemplateId: string | null }) {
    const now = this.clock();
    const id = randomUUID();
    await this.db.$transaction(async (tx) => {
      await tx.workoutTemplate.create({
        data: {
          id, ownerType: input.ownerType, ownerId: input.ownerId, authorCoachId: actor.coachId, schoolId: input.schoolId,
          ...metaColumns(input.meta), status: input.meta.status, version: 1, parentTemplateId: input.parentTemplateId,
          searchText: templateSearchText(input.meta, input.content, actor.displayName), createdAt: now, updatedAt: now,
        },
      });
      await tx.workoutTemplateVersion.create({
        data: {
          id: randomUUID(), templateId: id, number: 1, schemaVersion: TEMPLATE_CONTENT_SCHEMA_VERSION,
          content: input.content as Prisma.InputJsonValue, summary: summarizeTemplate(input.content) as unknown as Prisma.InputJsonValue,
          authorUserId: actor.userId, createdAt: now,
        },
      });
    }, TX);
    return this.get(actor.userId, id);
  }

  /** Editing = a new immutable version (§9.4); a stale `expectedVersion` is a recoverable conflict. */
  async saveVersion(actorUserId: string | null, templateId: string, raw: unknown) {
    const actor = await actorOf(this.db, actorUserId);
    const template = await loadReadable(this.db, actor, templateId);
    if (!await canWrite(this.db, actor, template)) throw new SchoolError("FORBIDDEN", "Você não pode editar este modelo.", 403);
    if (template.status === "ARCHIVED") throw new SchoolError("WORKOUT_TEMPLATE_ARCHIVED", "Modelo arquivado não é editado; duplique-o.", 409);
    const input = saveSchema.parse(raw);
    const meta = templateMetaSchema.parse(input.meta);
    const content = templateContentSchema.parse(input.content ?? {});
    const now = this.clock();
    const next = input.expectedVersion + 1;
    await this.db.$transaction(async (tx) => {
      const updated = await tx.workoutTemplate.updateMany({
        where: { id: template.id, version: input.expectedVersion },
        data: { ...metaColumns(meta), status: meta.status, version: next, searchText: templateSearchText(meta, content, actor.displayName), updatedAt: now },
      });
      if (updated.count === 0) throw new SchoolError("WORKOUT_TEMPLATE_UPDATE_CONFLICT", "O modelo foi alterado por outra pessoa. Recarregue e tente de novo.", 409);
      await tx.workoutTemplateVersion.create({
        data: {
          id: randomUUID(), templateId: template.id, number: next, schemaVersion: TEMPLATE_CONTENT_SCHEMA_VERSION,
          content: content as Prisma.InputJsonValue, summary: summarizeTemplate(content) as unknown as Prisma.InputJsonValue,
          authorUserId: actor.userId, createdAt: now,
        },
      });
    }, TX);
    return this.get(actorUserId, template.id);
  }

  /** Duplicate, or create a variant ("adaptação para piscina de 25 m") that points at the original — which is never changed. */
  async duplicate(actorUserId: string | null, templateId: string, raw: unknown) {
    const actor = await actorOf(this.db, actorUserId);
    if (!actor.coachId) throw new SchoolError("FORBIDDEN", "Apenas professores ativos criam modelos.", 403);
    const { variant, title } = z.strictObject({ variant: z.boolean().default(false), title: z.string().trim().min(2).max(200).optional() }).parse(raw ?? {});
    const current = await this.get(actorUserId, templateId);
    const meta = templateMetaSchema.parse({
      title: title ?? `${current.template.title} (${variant ? "variante" : "cópia"})`,
      code: null, contentKind: current.template.contentKind, sportType: current.template.sportType, environment: current.template.environment,
      sessionType: current.template.sessionType, capabilities: current.template.capabilities, level: current.template.level,
      phase: current.template.phase, tags: current.template.tags, folder: current.template.folder, description: current.template.description,
      status: "DRAFT",
    });
    // A copy lands in the actor's personal catalog unless they may write the school's.
    const school = current.template.ownerType === "SCHOOL" && current.template.schoolId
      && await new CanManageSchool(new SchoolMembershipRepository(this.db)).execute(actor.userId, current.template.schoolId)
      ? current.template.schoolId : null;
    return this.persistNew(actor, {
      ownerType: school ? "SCHOOL" : "COACH", ownerId: school ?? actor.coachId, schoolId: school,
      meta, content: current.version.content, parentTemplateId: variant ? current.template.id : null,
    });
  }

  async archive(actorUserId: string | null, templateId: string) {
    const actor = await actorOf(this.db, actorUserId);
    const template = await loadReadable(this.db, actor, templateId);
    if (!await canWrite(this.db, actor, template)) throw new SchoolError("FORBIDDEN", "Você não pode arquivar este modelo.", 403);
    if (template.status !== "ARCHIVED") {
      await this.db.workoutTemplate.update({ where: { id: template.id }, data: { status: "ARCHIVED", archivedAt: this.clock() } });
    }
    return { archived: true };
  }

  async setFavorite(actorUserId: string | null, templateId: string, favorite: boolean) {
    const actor = await actorOf(this.db, actorUserId);
    const template = await loadReadable(this.db, actor, templateId);
    if (favorite) {
      await this.db.workoutTemplateFavorite.createMany({ data: [{ userId: actor.userId, templateId: template.id }], skipDuplicates: true });
    } else {
      await this.db.workoutTemplateFavorite.deleteMany({ where: { userId: actor.userId, templateId: template.id } });
    }
    return { favorite };
  }

  /** A template with one version's content (current by default) and the list of versions. */
  async get(actorUserId: string | null, templateId: string, versionNumber?: number) {
    const actor = await actorOf(this.db, actorUserId);
    const template = await loadReadable(this.db, actor, templateId);
    const versions = await this.db.workoutTemplateVersion.findMany({
      where: { templateId: template.id },
      select: { number: true, createdAt: true, author: { select: { name: true } } },
      orderBy: { number: "desc" },
    });
    const number = versionNumber ?? template.version;
    const version = await this.db.workoutTemplateVersion.findUnique({ where: { templateId_number: { templateId: template.id, number } } });
    if (!version) throw new SchoolError("WORKOUT_TEMPLATE_VERSION_NOT_FOUND", "Versão não encontrada.", 404);
    const favorite = await this.db.workoutTemplateFavorite.findUnique({ where: { userId_templateId: { userId: actor.userId, templateId: template.id } } });
    return {
      template,
      canEdit: await canWrite(this.db, actor, template),
      favorite: favorite !== null,
      version: { number: version.number, content: templateContentSchema.parse(version.content), summary: version.summary as unknown as TemplateSummary, createdAt: version.createdAt },
      versions: versions.map((row) => ({ number: row.number, createdAt: row.createdAt, authorName: row.author.name })),
    };
  }

  async list(actorUserId: string | null, raw: unknown = {}) {
    const actor = await actorOf(this.db, actorUserId);
    const filter = z.strictObject({
      q: z.string().max(200).default(""),
      sportType: z.string().max(100).optional(),
      environment: z.string().max(30).optional(),
      level: z.string().max(20).optional(),
      phase: z.string().max(80).optional(),
      folder: z.string().max(80).optional(),
      tag: z.string().max(40).optional(),
      author: z.enum(["me", "school"]).optional(),
      favorites: z.coerce.boolean().optional(),
      archived: z.coerce.boolean().optional(),
      maxDurationMin: z.coerce.number().int().min(1).max(1440).optional(),
      maxDistanceM: z.coerce.number().int().min(1).max(1_000_000).optional(),
    }).parse(raw);
    const ownership: Prisma.WorkoutTemplateWhereInput[] = [];
    if (actor.coachId && filter.author !== "school") ownership.push({ ownerType: "COACH", authorCoachId: actor.coachId });
    if (actor.schoolsAsCoach.length > 0 && filter.author !== "me") ownership.push({ ownerType: "SCHOOL", schoolId: { in: actor.schoolsAsCoach } });
    if (ownership.length === 0) return [];
    const rows = await this.db.workoutTemplate.findMany({
      where: {
        OR: ownership,
        status: filter.archived ? "ARCHIVED" : { not: "ARCHIVED" },
        ...(filter.sportType ? { sportType: filter.sportType } : {}),
        ...(filter.environment ? { environment: filter.environment } : {}),
        ...(filter.level ? { level: filter.level } : {}),
        ...(filter.phase ? { phase: filter.phase } : {}),
        ...(filter.folder ? { folder: filter.folder } : {}),
        ...(filter.tag ? { tags: { has: filter.tag.toLowerCase() } } : {}),
        ...(filter.favorites ? { favorites: { some: { userId: actor.userId } } } : {}),
        AND: searchTerms(filter.q).map((term) => ({ searchText: { contains: term } })),
      },
      include: {
        versions: { orderBy: { number: "desc" }, take: 1, select: { number: true, summary: true } },
        favorites: { where: { userId: actor.userId }, select: { userId: true } },
        authorCoach: { select: { displayName: true } },
        school: { select: { name: true } },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 200,
    });
    return rows
      .map((row) => ({
        id: row.id, title: row.title, code: row.code, sportType: row.sportType, environment: row.environment, level: row.level,
        phase: row.phase, tags: row.tags, folder: row.folder, status: row.status, version: row.version, contentKind: row.contentKind,
        parentTemplateId: row.parentTemplateId, ownerType: row.ownerType, schoolId: row.schoolId, schoolName: row.school?.name ?? null,
        authorName: row.authorCoach?.displayName ?? null, favorite: row.favorites.length > 0,
        summary: (row.versions[0]?.summary ?? null) as TemplateSummary | null, updatedAt: row.updatedAt,
      }))
      .filter((row) => (filter.maxDurationMin === undefined || (row.summary?.durationSeconds ?? Infinity) <= filter.maxDurationMin * 60)
        && (filter.maxDistanceM === undefined || (row.summary?.distanceMeters ?? Infinity) <= filter.maxDistanceM));
  }

  /**
   * §9.4 — "Salvar adaptação individual como modelo": a prescription the coach
   * authored becomes a personal DRAFT template, without the athlete's
   * individual values (absolute HR, pace, power) and without the description.
   */
  async saveAdaptationAsTemplate(actorUserId: string | null, raw: unknown) {
    const actor = await actorOf(this.db, actorUserId);
    if (!actor.coachId) throw new SchoolError("FORBIDDEN", "Apenas professores ativos criam modelos.", 403);
    const { assignmentId, title } = z.strictObject({ assignmentId: opaqueId, title: z.string().trim().min(2).max(200).optional() }).parse(raw);
    const assignment = await this.db.workoutAssignment.findUnique({
      where: { id: assignmentId },
      select: { workout: { select: { authorCoachId: true, title: true, sportType: true, snapshotPayload: true } } },
    });
    if (!assignment?.workout || assignment.workout.authorCoachId !== actor.coachId) {
      throw new SchoolError("WORKOUT_ASSIGNMENT_NOT_FOUND", "Prescrição não encontrada.", 404);
    }
    const snapshot = assignment.workout.snapshotPayload as { content?: { blocks?: unknown[] } } | null;
    const blocks = z.array(z.unknown()).parse(snapshot?.content?.blocks ?? []).flatMap((block) => {
      const row = block as Record<string, unknown>;
      const restDurationS = typeof (row.restPayload as { durationS?: unknown } | null)?.durationS === "number" ? (row.restPayload as { durationS: number }).durationS : null;
      const candidate = {
        blockType: row.blockType, title: row.title ?? null, durationS: row.durationS ?? null,
        distanceM: row.distanceM == null ? null : Number(row.distanceM), repetitions: row.repetitions ?? null,
        ...(row.targetPayload ? { target: row.targetPayload } : {}), restDurationS,
      };
      const parsed = prescriptionBlockSchema.safeParse(candidate);
      return parsed.success ? [parsed.data] : [];
    });
    const content = templateContentSchema.parse({ blocks: blocksWithoutPersonalData(blocks) });
    const meta = templateMetaSchema.parse({ title: title ?? `${assignment.workout.title} (modelo)`, sportType: assignment.workout.sportType, tags: ["adaptação"], status: "DRAFT" });
    return this.persistNew(actor, { ownerType: "COACH", ownerId: actor.coachId, schoolId: null, meta, content, parentTemplateId: null });
  }
}
