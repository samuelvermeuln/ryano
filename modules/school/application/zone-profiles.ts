/**
 * SAM-70 — the coach's zone profiles (§18.1) and their association with an
 * athlete's sheet.
 *
 * A profile belongs to the coach who wrote it; each save after the first is
 * a new immutable version. The family and the reference are fixed at
 * creation — a different reference is a different model, not a new version.
 * Associating a version with a sheet is recorded as a sheet revision, like
 * any other parameter change; prescriptions already published keep the
 * version they were written against.
 */
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

import { SchoolError } from "../domain/errors";
import { readSheetZoneProfiles, ZONE_FAMILIES, zoneBoundsSchema, zoneProfileInputSchema, type ZoneFamily, type ZoneBounds } from "../domain/zone-profile";
import { technicalSheetScope, type CoachAthleteScopeInput } from "./coach-athlete-scope";
import { ResolveCoachAthleteContext } from "./resolve-coach-athlete-context";

const TX = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 20_000 } as const;

async function actorCoachId(db: PrismaClient | Prisma.TransactionClient, actorUserId: string | null) {
  if (!actorUserId) throw new SchoolError("FORBIDDEN", "Entre na sua conta.", 401);
  const coach = await db.coachProfile.findUnique({ where: { userId: actorUserId }, select: { id: true, status: true } });
  if (!coach || coach.status !== "ACTIVE") throw new SchoolError("FORBIDDEN", "Só professores mantêm perfis de zona.", 403);
  return coach.id;
}

export type ZoneProfileView = {
  id: string;
  name: string;
  family: ZoneFamily;
  reference: string;
  version: number;
  versionId: string;
  method: string;
  bounds: ZoneBounds;
};

/** The coach's profiles, by coach profile id or by the coach's user id (one query either way). */
export async function listCoachZoneProfiles(db: PrismaClient, owner: { coachId: string } | { userId: string }): Promise<ZoneProfileView[]> {
  const profiles = await db.zoneProfile.findMany({
    where: { ...("coachId" in owner ? { ownerCoachId: owner.coachId } : { owner: { userId: owner.userId } }), archivedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, family: true, reference: true, currentVersion: true, versions: { orderBy: { version: "desc" }, take: 1, select: { id: true, version: true, method: true, bounds: true } } },
  });
  return profiles.flatMap((profile) => {
    const current = profile.versions[0];
    const bounds = zoneBoundsSchema.safeParse(current?.bounds);
    if (!current || !bounds.success) return [];
    return [{ id: profile.id, name: profile.name, family: profile.family as ZoneFamily, reference: profile.reference, version: current.version, versionId: current.id, method: current.method, bounds: bounds.data }];
  });
}

export class SaveZoneProfile {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  /** Creates the profile, or — with `profileId` — writes its next version. */
  async execute(actorUserId: string | null, raw: unknown, profileId?: string | null) {
    const input = zoneProfileInputSchema.parse(raw);
    const now = this.clock();
    return this.db.$transaction(async (tx) => {
      const coachId = await actorCoachId(tx, actorUserId);
      if (!profileId) {
        const id = randomUUID();
        await tx.zoneProfile.create({ data: { id, ownerCoachId: coachId, name: input.name, family: input.family, reference: input.reference, currentVersion: 1, createdAt: now, updatedAt: now } });
        const versionId = randomUUID();
        await tx.zoneProfileVersion.create({ data: { id: versionId, profileId: id, version: 1, method: input.method, bounds: input.bounds as Prisma.InputJsonValue, createdByUserId: actorUserId!, createdAt: now } });
        return { profileId: id, versionId, version: 1 };
      }
      const profile = await tx.zoneProfile.findFirst({ where: { id: profileId, ownerCoachId: coachId, archivedAt: null } });
      if (!profile) throw new SchoolError("ZONE_PROFILE_NOT_FOUND", "Perfil de zonas não encontrado.", 404);
      if (profile.family !== input.family || profile.reference !== input.reference) {
        throw new SchoolError("ZONE_PROFILE_REFERENCE_FIXED", "Família e referência não mudam entre versões: crie outro perfil.", 422);
      }
      const version = profile.currentVersion + 1;
      const versionId = randomUUID();
      await tx.zoneProfileVersion.create({ data: { id: versionId, profileId, version, method: input.method, bounds: input.bounds as Prisma.InputJsonValue, createdByUserId: actorUserId!, createdAt: now } });
      await tx.zoneProfile.update({ where: { id: profileId }, data: { name: input.name, currentVersion: version, updatedAt: now } });
      return { profileId, versionId, version };
    }, TX);
  }
}

export class AssignZoneProfile {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  /** `versionId` null = back to the derived default for that family. */
  async execute(actorUserId: string | null, scope: CoachAthleteScopeInput, athleteId: string, family: ZoneFamily, versionId: string | null) {
    if (!(ZONE_FAMILIES as readonly string[]).includes(family)) throw new SchoolError("VALIDATION_ERROR", "Família de zonas inválida.", 422);
    const context = await new ResolveCoachAthleteContext(this.db, this.clock).execute(actorUserId, scope, athleteId);
    const now = this.clock();
    return this.db.$transaction(async (tx) => {
      if (versionId) {
        const coachId = await actorCoachId(tx, actorUserId);
        const version = await tx.zoneProfileVersion.findUnique({ where: { id: versionId }, select: { profile: { select: { ownerCoachId: true, family: true, archivedAt: true } } } });
        if (!version || version.profile.ownerCoachId !== coachId || version.profile.archivedAt) {
          throw new SchoolError("ZONE_PROFILE_NOT_FOUND", "Perfil de zonas não encontrado.", 404);
        }
        if (version.profile.family !== family) throw new SchoolError("VALIDATION_ERROR", "O perfil é de outra família de zonas.", 422);
      }
      const sheet = await tx.athleteTechnicalSheet.findFirst({ where: technicalSheetScope(context, athleteId).where, select: { id: true, zoneProfileVersions: true } });
      if (!sheet) throw new SchoolError("TECHNICAL_SHEET_NOT_FOUND", "Salve a ficha técnica antes de associar um perfil de zonas.", 409);
      const before = readSheetZoneProfiles(sheet.zoneProfileVersions);
      if ((before[family] ?? null) === versionId) return { changed: false };
      const after = { ...before };
      if (versionId) after[family] = versionId;
      else delete after[family];
      await tx.athleteTechnicalSheet.update({ where: { id: sheet.id }, data: { zoneProfileVersions: after as Prisma.InputJsonValue, updatedByUserId: actorUserId, updatedAt: now } });
      await tx.athleteTechnicalSheetRevision.create({
        data: {
          id: randomUUID(), sheetId: sheet.id, schoolId: context.schoolId, athleteId, changedByUserId: actorUserId,
          changes: { zoneProfiles: { from: before, to: after } } as Prisma.InputJsonValue, changedAt: now,
        },
      });
      return { changed: true };
    }, TX);
  }
}
