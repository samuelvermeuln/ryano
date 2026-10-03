/**
 * SAM-70 — assessments with protocol, promotion to the technical sheet, and
 * the reference a prescription freezes (§18.1, §18.2, AC14).
 *
 * Authorization is the hub's gate (`ResolveCoachAthleteContext`): the coach
 * responsible for the athlete, or the school's OWNER/ADMIN, in the scope of
 * the URL. Promotion writes the sheet parameter and a revision pointing at
 * the assessment in one serializable transaction; published prescriptions
 * are never touched — they carry the reference frozen at publication.
 */
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

import { ASSESSMENT_REFERENCE_META, assessmentInputSchema, citeAssessment, type AssessmentReference, type SheetParameterField } from "../domain/athlete-assessment";
import { SchoolError } from "../domain/errors";
import { readSheetZoneProfiles, type AppliedZoneProfile, type ZoneFamily, zoneBoundsSchema } from "../domain/zone-profile";
import { AuditAction, AuditEntityType, AuditService } from "../infrastructure/audit-service";
import { technicalSheetScope, type CoachAthleteScopeInput } from "./coach-athlete-scope";
import { ResolveCoachAthleteContext } from "./resolve-coach-athlete-context";

type Db = PrismaClient | Prisma.TransactionClient;
type ScopeContext = { coachId: string; schoolId: string | null };
const TX = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 20_000 } as const;

/** Assessments live in the same scope as the sheet: the school's, or the independent coach's. */
function assessmentScope(context: ScopeContext, athleteId: string) {
  return context.schoolId ? { athleteId, schoolId: context.schoolId } : { athleteId, schoolId: null, coachId: context.coachId };
}

export type AssessmentView = {
  id: string;
  sportType: string;
  environment: string | null;
  assessedLocalDate: string;
  protocol: string;
  protocolCode: string | null;
  assessorName: string | null;
  reference: AssessmentReference;
  resultValue: number;
  resultUnit: string;
  conditions: string | null;
  source: string;
  sourceDetail: string | null;
  limitations: string | null;
  nextReviewLocalDate: string | null;
  promotedAt: Date | null;
  promotable: boolean;
};

export async function listAthleteAssessments(db: Db, context: ScopeContext, athleteId: string): Promise<AssessmentView[]> {
  const rows = await db.athleteAssessment.findMany({
    where: assessmentScope(context, athleteId),
    orderBy: [{ assessedLocalDate: "desc" }, { createdAt: "desc" }],
    take: 30,
  });
  return rows.map((row) => ({
    ...row,
    reference: row.reference as AssessmentReference,
    resultValue: Number(row.resultValue),
    promotable: ASSESSMENT_REFERENCE_META[row.reference as AssessmentReference]?.field !== null,
  }));
}

export class RecordAthleteAssessment {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, scope: CoachAthleteScopeInput, athleteId: string, raw: unknown) {
    const context = await new ResolveCoachAthleteContext(this.db, this.clock).execute(actorUserId, scope, athleteId);
    const input = assessmentInputSchema.parse(raw);
    const now = this.clock();
    return this.db.athleteAssessment.create({
      data: {
        id: randomUUID(),
        athleteId,
        schoolId: context.schoolId,
        coachId: context.schoolId ? null : context.coachId,
        ...input,
        resultValue: new Prisma.Decimal(input.resultValue),
        createdByUserId: actorUserId!,
        createdAt: now,
        updatedAt: now,
      },
      select: { id: true },
    });
  }
}

export class PromoteAthleteAssessment {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, scope: CoachAthleteScopeInput, athleteId: string, assessmentId: string) {
    const context = await new ResolveCoachAthleteContext(this.db, this.clock).execute(actorUserId, scope, athleteId);
    const now = this.clock();
    try {
      return await this.db.$transaction(async (tx) => {
        const assessment = await tx.athleteAssessment.findFirst({ where: { id: assessmentId, ...assessmentScope(context, athleteId) } });
        if (!assessment) throw new SchoolError("ASSESSMENT_NOT_FOUND", "Avaliação não encontrada.", 404);
        const field = ASSESSMENT_REFERENCE_META[assessment.reference as AssessmentReference]?.field;
        if (!field) throw new SchoolError("ASSESSMENT_NOT_PROMOTABLE", "Este resultado não corresponde a um parâmetro da ficha.", 422);
        const value = Math.round(Number(assessment.resultValue));

        const sheetScope = technicalSheetScope(context, athleteId);
        const previous = await tx.athleteTechnicalSheet.findFirst({ where: sheetScope.where, select: { id: true, [field]: true } as Prisma.AthleteTechnicalSheetSelect });
        const sheetId = previous?.id ?? randomUUID();
        if (previous) {
          await tx.athleteTechnicalSheet.update({ where: { id: sheetId }, data: { [field]: value, updatedByUserId: actorUserId, updatedAt: now } });
        } else {
          await tx.athleteTechnicalSheet.create({
            data: {
              id: sheetId,
              athleteId,
              schoolId: context.schoolId,
              coachId: context.schoolId ? null : context.coachId,
              sportTypes: [assessment.sportType],
              [field]: value,
              updatedByUserId: actorUserId,
              createdAt: now,
              updatedAt: now,
            },
          });
        }
        const from = (previous as Record<string, unknown> | null)?.[field] ?? null;
        await tx.athleteTechnicalSheetRevision.create({
          data: {
            id: randomUUID(),
            sheetId,
            schoolId: context.schoolId,
            athleteId,
            changedByUserId: actorUserId,
            changes: { [field]: { from, to: value } } as Prisma.InputJsonValue,
            changedAt: now,
            assessmentId: assessment.id,
          },
        });
        await tx.athleteAssessment.update({ where: { id: assessment.id }, data: { promotedAt: now, updatedAt: now } });
        if (context.schoolId) {
          await new AuditService(tx).log({
            schoolId: context.schoolId,
            actorUserId,
            action: AuditAction.TECHNICAL_SHEET_SAVED,
            entityType: AuditEntityType.TECHNICAL_SHEET,
            entityId: sheetId,
            metadata: { athleteId, fieldsProvided: [field], assessmentId: assessment.id },
          });
        }
        return { sheetId, field, value };
      }, TX);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
        throw new SchoolError("SCHOOL_CONFLICT", "A ficha mudou ao mesmo tempo. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }
}

/** The versions named on a sheet, as applied profiles; unknown ids are dropped. */
export async function loadAppliedZoneProfiles(db: Db, raw: unknown): Promise<Partial<Record<ZoneFamily, AppliedZoneProfile>>> {
  const chosen = readSheetZoneProfiles(raw);
  const ids = Object.values(chosen).filter((id): id is string => Boolean(id));
  if (ids.length === 0) return {};
  const versions = await db.zoneProfileVersion.findMany({
    where: { id: { in: ids } },
    select: { id: true, version: true, method: true, bounds: true, profile: { select: { name: true, family: true, reference: true } } },
  });
  const applied: Partial<Record<ZoneFamily, AppliedZoneProfile>> = {};
  for (const [family, id] of Object.entries(chosen) as Array<[ZoneFamily, string]>) {
    const version = versions.find((row) => row.id === id);
    const bounds = zoneBoundsSchema.safeParse(version?.bounds);
    if (!version || version.profile.family !== family || !bounds.success) continue;
    applied[family] = { versionId: version.id, name: version.profile.name, version: version.version, method: version.method, reference: version.profile.reference, bounds: bounds.data };
  }
  return applied;
}

const FROZEN_FIELDS: Array<[SheetParameterField, AssessmentReference]> = [
  ["ftpWatts", "FTP"], ["cssSecPer100m", "CSS"], ["thresholdPaceSecPerKm", "THRESHOLD_PACE"],
  ["thresholdHeartRate", "THRESHOLD_HR"], ["maxHeartRate", "MAX_HR"], ["restingHeartRate", "RESTING_HR"],
];

/**
 * §18.2 — what a prescription is written against, frozen into its snapshot:
 * the sheet revision, the parameter values, the zone profile versions and,
 * for a parameter that came from a promoted assessment, how to cite it.
 */
export type FrozenReference = {
  sheetRevisionId: string | null;
  parameters: Partial<Record<SheetParameterField, number>>;
  zoneProfiles: Partial<Record<ZoneFamily, { versionId: string; name: string; version: number }>>;
  citations: Partial<Record<SheetParameterField, string>>;
};

export async function loadFrozenReference(db: Db, context: ScopeContext, athleteId: string): Promise<FrozenReference | null> {
  const sheet = await db.athleteTechnicalSheet.findFirst({
    where: technicalSheetScope(context, athleteId).where,
    select: {
      id: true, ftpWatts: true, cssSecPer100m: true, thresholdPaceSecPerKm: true, thresholdHeartRate: true, maxHeartRate: true, restingHeartRate: true,
      zoneProfileVersions: true,
      revisions: {
        orderBy: [{ changedAt: "desc" }, { id: "desc" }],
        take: 50,
        select: { id: true, changes: true, assessment: { select: { reference: true, resultValue: true, resultUnit: true, assessedLocalDate: true } } },
      },
    },
  });
  if (!sheet) return null;
  const parameters: FrozenReference["parameters"] = {};
  const citations: FrozenReference["citations"] = {};
  for (const [field, reference] of FROZEN_FIELDS) {
    const value = sheet[field];
    if (value === null) continue;
    parameters[field] = value;
    const source = sheet.revisions.find((revision) => revision.changes && typeof revision.changes === "object" && field in (revision.changes as object));
    if (source?.assessment) {
      citations[field] = citeAssessment(reference, value, source.assessment.resultUnit, source.assessment.assessedLocalDate);
    }
  }
  const profiles = await loadAppliedZoneProfiles(db, sheet.zoneProfileVersions);
  return {
    sheetRevisionId: sheet.revisions[0]?.id ?? sheet.id,
    parameters,
    zoneProfiles: Object.fromEntries(Object.entries(profiles).map(([family, profile]) => [family, { versionId: profile.versionId, name: profile.name, version: profile.version }])),
    citations,
  };
}
