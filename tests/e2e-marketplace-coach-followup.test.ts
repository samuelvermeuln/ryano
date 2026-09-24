/**
 * TM087 — E2E: convite -> aceite -> ajuste -> aprovação -> revogação
 * (RF-301/RF-302/RF-303/RF-304, spec de produto §14 cenários 4-5).
 *
 * Same convention as `tests/e2e-marketplace-free-flow.test.ts` /
 * `tests/e2e-school-lifecycle.test.ts`: a chain of REAL Onda 3 use-case
 * calls over an in-memory mocked Prisma `db`, not browser automation
 * (`@playwright/test` is not installed — pre-existing gap, not this
 * Onda's to fix).
 *
 * Scope note: the "given" state here (two athletes, Ana and Bruno, each
 * already holding an ACTIVE `TrainingLicense` on the SAME immutable
 * `TrainingProductVersion`) is the Onda 1 purchase/activation flow, already
 * proven end-to-end by TM055's `e2e-marketplace-free-flow.test.ts` — this
 * test does not re-chain `AcquireFreeTrainingProduct`/`ActivateTrainingLicense`,
 * it starts from that already-verified outcome and chains what's NEW in
 * this Onda: invite -> accept -> propose -> decide -> revoke.
 *
 * Cenário: Ana convida o coach B (diferente do autor do produto) para
 * acompanhar SUA licença. B só enxerga/atua depois de aceitar. B propõe um
 * ajuste numa sessão; Ana aprova; o histórico registra antes/depois e
 * autoria. Durante todo o cenário, a `TrainingProductVersion` original e a
 * `WorkoutAssignment` de Bruno (outro comprador do MESMO produto) permanecem
 * byte-idênticas. Por fim, Ana revoga B — a chamada seguinte de B falha
 * imediatamente no servidor, mas a autoria do ajuste já aplicado permanece.
 */
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { InviteCoachToLicense } from "@/modules/school/application/invite-coach-to-license";
import { AcceptCoachInvitation } from "@/modules/school/application/accept-coach-invitation";
import { ProposePlanAdaptation } from "@/modules/school/application/propose-plan-adaptation";
import { DecidePlanAdaptation } from "@/modules/school/application/decide-plan-adaptation";
import { RevokeCoachEngagement } from "@/modules/school/application/revoke-coach-engagement";

const NOW = new Date("2026-09-24T12:00:00Z");
const PRODUCT_ID = "prod-e2e-followup";
const VERSION_ID = "ver-e2e-followup-v1";
const FOLLOWUP_COACH_ID = "coach-followup-e2e";
const FOLLOWUP_COACH_USER = "coach-followup-user-e2e";
const ANA_ID = "athlete-ana-e2e";
const BRUNO_ID = "athlete-bruno-e2e";
const LICENSE_ANA = "lic-ana-e2e";
const LICENSE_BRUNO = "lic-bruno-e2e";
const ASSIGNMENT_ANA = "wa-ana-e2e-1";
const ASSIGNMENT_BRUNO = "wa-bruno-e2e-1";

type Row = Record<string, unknown>;

function makeDb() {
  const versionSnapshot = {
    id: VERSION_ID, productId: PRODUCT_ID, schemaVersion: 1, publishedAt: NOW,
    planPayload: { weeks: [{ week: 1, days: [{ workoutTemplateId: "tpl-run-1", dayOfWeek: 1 }] }] },
  };
  const templates: Record<string, { sportType: string }> = { "tpl-run-1": { sportType: "run" } };
  const engagements: Record<string, Row> = {};
  const adaptations: Record<string, Row> = {};
  const assignments: Record<string, Row> = {
    [ASSIGNMENT_ANA]: {
      id: ASSIGNMENT_ANA, trainingLicenseId: LICENSE_ANA, scheduledAt: new Date("2026-09-28T09:00:00.000Z"), dueAt: null,
      workoutTemplateId: "tpl-run-1", adaptationVersion: 0, originalSnapshot: null, effectiveRevisionId: null, adjustedByCoachId: null,
    },
    [ASSIGNMENT_BRUNO]: {
      id: ASSIGNMENT_BRUNO, trainingLicenseId: LICENSE_BRUNO, scheduledAt: new Date("2026-09-28T09:00:00.000Z"), dueAt: null,
      workoutTemplateId: "tpl-run-1", adaptationVersion: 0, originalSnapshot: null, effectiveRevisionId: null, adjustedByCoachId: null,
    },
  };
  const history: Row[] = [];
  let engagementSeq = 0;
  let adaptationSeq = 0;

  const db = {
    trainingLicense: {
      findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === LICENSE_ANA) return Promise.resolve({ id: LICENSE_ANA, athleteId: ANA_ID, status: "ACTIVE" });
        if (where.id === LICENSE_BRUNO) return Promise.resolve({ id: LICENSE_BRUNO, athleteId: BRUNO_ID, status: "ACTIVE" });
        return Promise.resolve(null);
      }),
    },
    coachProfile: {
      findUnique: vi.fn().mockImplementation(({ where }: { where: { id?: string; userId?: string } }) => {
        if (where.id === FOLLOWUP_COACH_ID || where.userId === FOLLOWUP_COACH_USER) {
          return Promise.resolve({ id: FOLLOWUP_COACH_ID, userId: FOLLOWUP_COACH_USER, status: "ACTIVE" });
        }
        return Promise.resolve(null);
      }),
    },
    licenseCoachEngagement: {
      findMany: vi.fn().mockImplementation(({ where }: { where: { licenseId: string; coachId?: string; status?: { in: string[] } } }) =>
        Promise.resolve(Object.values(engagements).filter((e) => e.licenseId === where.licenseId
          && (!where.coachId || e.coachId === where.coachId)
          && (!where.status || where.status.in.includes(e.status as string))))),
      findFirst: vi.fn().mockImplementation(({ where }: { where: { licenseId: string; coachId: string; status: string } }) => {
        const row = Object.values(engagements).find((e) => e.licenseId === where.licenseId && e.coachId === where.coachId && e.status === where.status);
        return Promise.resolve(row ? { ...row, license: { status: "ACTIVE" } } : null);
      }),
      findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(engagements[where.id] ?? null)),
      create: vi.fn().mockImplementation(({ data }: { data: Row }) => {
        const id = `eng-${++engagementSeq}`;
        engagements[id] = { ...data, id };
        return Promise.resolve(engagements[id]);
      }),
      update: vi.fn().mockImplementation(({ where, data }: { where: { id: string }; data: Row }) => {
        engagements[where.id] = { ...engagements[where.id], ...data };
        return Promise.resolve(engagements[where.id]);
      }),
      updateMany: vi.fn().mockImplementation(({ where, data }: { where: { id: { in: string[] } }; data: Row }) => {
        for (const id of where.id.in) engagements[id] = { ...engagements[id], ...data };
        return Promise.resolve({ count: where.id.in.length });
      }),
    },
    workoutAssignment: {
      findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) => {
        const row = assignments[where.id];
        if (!row) return Promise.resolve(null);
        return Promise.resolve({ ...row, workoutTemplate: templates[row.workoutTemplateId as string] ?? null });
      }),
      update: vi.fn().mockImplementation(({ where, data }: { where: { id: string }; data: Row }) => {
        const row = assignments[where.id]!;
        const merged: Row = { ...row };
        for (const [key, value] of Object.entries(data)) {
          merged[key] = value && typeof value === "object" && "increment" in (value as object)
            ? (row[key] as number) + (value as { increment: number }).increment
            : value;
        }
        assignments[where.id] = merged;
        return Promise.resolve(merged);
      }),
    },
    workoutAssignmentHistory: {
      create: vi.fn().mockImplementation(({ data }: { data: Row }) => { history.push(data); return Promise.resolve(data); }),
    },
    planAdaptation: {
      create: vi.fn().mockImplementation(({ data }: { data: Row }) => {
        const id = `adapt-${++adaptationSeq}`;
        adaptations[id] = { ...data, id };
        return Promise.resolve(adaptations[id]);
      }),
      findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(adaptations[where.id] ?? null)),
      update: vi.fn().mockImplementation(({ where, data }: { where: { id: string }; data: Row }) => {
        adaptations[where.id] = { ...adaptations[where.id], ...data };
        return Promise.resolve(adaptations[where.id]);
      }),
    },
    trainingProductVersion: { findUnique: vi.fn().mockResolvedValue(versionSnapshot) },
    _snapshotOfOtherLicenseAssignment: () => ({ ...assignments[ASSIGNMENT_BRUNO] }),
    _snapshotOfVersion: () => ({ ...versionSnapshot }),
    _getHistory: () => history,
  };
  return Object.assign(db, {
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  });
}

describe("E2E — acompanhamento independente [TM087]", () => {
  it("convite -> aceite -> ajuste -> aprovação -> revogação, sem afetar outra licença ou a versão original", async () => {
    const db = makeDb();
    const dbClient = db as unknown as PrismaClient;
    const beforeVersion = db._snapshotOfVersion();
    const beforeBrunoAssignment = db._snapshotOfOtherLicenseAssignment();

    // 1. Ana convida o coach B (diferente do autor) para acompanhar SUA licença — RF-301.
    const invite = await new InviteCoachToLicense(dbClient, () => NOW).execute(ANA_ID, {
      licenseId: LICENSE_ANA, coachId: FOLLOWUP_COACH_ID, scope: { full: true },
    });
    expect(invite).toMatchObject({ status: "PENDING" });

    // 2. Antes do aceite, B não enxerga/atua em nada (RF-302).
    await expect(new ProposePlanAdaptation(dbClient, () => NOW).execute(FOLLOWUP_COACH_USER, {
      licenseId: LICENSE_ANA, workoutAssignmentId: ASSIGNMENT_ANA, reason: "tentativa antes do aceite",
      proposedChange: { scheduledAt: "2026-09-29T09:00:00.000Z" }, expectedVersion: 0,
    })).rejects.toMatchObject({ status: 403 });

    // 3. B aceita o convite — PENDING -> ACTIVE.
    const accepted = await new AcceptCoachInvitation(dbClient, () => NOW).execute(FOLLOWUP_COACH_USER, { engagementId: invite.id as string });
    expect(accepted).toMatchObject({ status: "ACTIVE" });

    // 4. B propõe um ajuste numa sessão da semana de Ana — nunca toca outra licença.
    const proposal = await new ProposePlanAdaptation(dbClient, () => NOW).execute(FOLLOWUP_COACH_USER, {
      licenseId: LICENSE_ANA, workoutAssignmentId: ASSIGNMENT_ANA, reason: "Adaptar a agenda de Ana",
      proposedChange: { scheduledAt: "2026-09-29T09:00:00.000Z" }, expectedVersion: 0,
    });
    expect(proposal).toMatchObject({ status: "PENDING", licenseId: LICENSE_ANA, workoutAssignmentId: ASSIGNMENT_ANA });

    // 5. Ana aprova — aplica na sua WorkoutAssignment; histórico com autoria de B.
    const decision = await new DecidePlanAdaptation(dbClient, () => NOW).execute(ANA_ID, {
      licenseId: LICENSE_ANA, adaptationId: proposal.id as string, decision: "ACCEPT",
    });
    expect(decision.adaptation).toMatchObject({ status: "ACCEPTED", acceptedByAthleteAt: NOW });
    expect((decision.assignment as { scheduledAt: Date }).scheduledAt.toISOString()).toBe("2026-09-29T09:00:00.000Z");
    expect((decision.assignment as { adjustedByCoachId: string }).adjustedByCoachId).toBe(FOLLOWUP_COACH_ID);
    expect((decision.assignment as { adaptationVersion: number }).adaptationVersion).toBe(1);
    expect(db._getHistory()).toHaveLength(1);
    expect(db._getHistory()[0]).toMatchObject({ eventType: "PLAN_ADAPTATION_ACCEPTED", actorUserId: ANA_ID });

    // 6. Produto original (versão imutável) e a licença de Bruno (outro comprador) continuam idênticos.
    expect(db._snapshotOfVersion()).toEqual(beforeVersion);
    expect(db._snapshotOfOtherLicenseAssignment()).toEqual(beforeBrunoAssignment);

    // 7. Ana revoga B — acesso cessa IMEDIATAMENTE no servidor (RF-304).
    const revoke = await new RevokeCoachEngagement(dbClient, () => NOW).execute(ANA_ID, { licenseId: LICENSE_ANA });
    expect(revoke.revokedEngagementIds).toEqual([invite.id]);

    // 8. A chamada SEGUINTE de B falha de imediato — não é só a UI escondendo o botão.
    await expect(new ProposePlanAdaptation(dbClient, () => NOW).execute(FOLLOWUP_COACH_USER, {
      licenseId: LICENSE_ANA, workoutAssignmentId: ASSIGNMENT_ANA, reason: "tentativa pós-revogação",
      proposedChange: { scheduledAt: "2026-09-30T09:00:00.000Z" }, expectedVersion: 1,
    })).rejects.toMatchObject({ status: 403 });

    // 9. A revogação NÃO apaga histórico/autoria do ajuste já aplicado (RF-304).
    expect((decision.assignment as { adjustedByCoachId: string }).adjustedByCoachId).toBe(FOLLOWUP_COACH_ID);
    expect(db._getHistory()).toHaveLength(1);

    // 10. Produto original e licença de Bruno seguem intocados até o fim do cenário.
    expect(db._snapshotOfVersion()).toEqual(beforeVersion);
    expect(db._snapshotOfOtherLicenseAssignment()).toEqual(beforeBrunoAssignment);
  });
});
