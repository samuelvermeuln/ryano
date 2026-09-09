import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { createSchoolDraft, createSchoolDtoSchema } from "../domain/school";
import { SchoolRepository, updateSchoolDtoSchema } from "../infrastructure/school-repository";

const actorSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);

export class SchoolService {
  private readonly schools: SchoolRepository;

  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {
    this.schools = new SchoolRepository(db);
  }

  async create(actorUserId: string | null, raw: unknown) {
    if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const ownerUserId = actorSchema.parse(actorUserId);
    const input = createSchoolDtoSchema.parse(raw);
    const owner = await this.db.user.findUnique({ where: { id: ownerUserId }, select: { status: true } });
    if (!owner) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    if (owner.status !== "ACTIVE") throw new SchoolError("FORBIDDEN", "Esta conta não pode criar escolas.", 403);
    // A random suffix lets schools share a display name without a check-then-insert race.
    const nameSlug = input.name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60).replace(/-$/, "") || "escola";
    const slug = input.slug ?? `${nameSlug}-${randomUUID()}`;
    try {
      return await this.schools.create(createSchoolDraft({ ...input, slug, ownerUserId }, this.clock()));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new SchoolError("SCHOOL_SLUG_TAKEN", "Este endereço de escola já está em uso.", 409);
      }
      throw error;
    }
  }

  async update(actorUserId: string | null, schoolId: string, raw: unknown) {
    const school = await this.requireOwnedSchool(actorUserId, schoolId);
    const input = updateSchoolDtoSchema.parse(raw);

    try {
      return await this.schools.update(school.id, input, this.clock());
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new SchoolError("SCHOOL_SLUG_TAKEN", "Este endereço de escola já está em uso.", 409);
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
      }
      throw error;
    }
  }

  async get(actorUserId: string | null, schoolId: string) {
    const actor = actorSchema.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);

    try {
      const school = await this.schools.findById(schoolId);
      if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
      return school;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
      }
      throw error;
    }
  }

  deactivate(actorUserId: string | null, schoolId: string) {
    return this.changeStatus(actorUserId, schoolId, "INACTIVE");
  }

  reactivate(actorUserId: string | null, schoolId: string) {
    return this.changeStatus(actorUserId, schoolId, "ACTIVE");
  }

  private async requireOwnedSchool(actorUserId: string | null, schoolId: string) {
    const actor = actorSchema.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    let school;
    try {
      school = await this.schools.findById(schoolId);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
      }
      throw error;
    }
    if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    if (school.ownerUserId !== actor.data) {
      throw new SchoolError("FORBIDDEN", "Você não pode alterar esta escola.", 403);
    }
    return school;
  }

  private async changeStatus(actorUserId: string | null, schoolId: string, status: "ACTIVE" | "INACTIVE") {
    const school = await this.requireOwnedSchool(actorUserId, schoolId);

    try {
      // The repository conditionally updates the previous status so repeats preserve timestamps.
      return status === "INACTIVE"
        ? await this.schools.deactivate(school.id, this.clock())
        : await this.schools.reactivate(school.id, this.clock());
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
      }
      throw error;
    }
  }
}
