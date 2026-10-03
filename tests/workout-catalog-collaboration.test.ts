/**
 * SAM-78 — collaborative institutional catalog (§9.1, §20, §26.5, §27.3).
 */
import { describe, expect, it, vi } from "vitest";

import { ReviewTemplateProposal, withdrawProposalsOfLeavingCoach } from "@/modules/school/application/workout-catalog-collaboration";

vi.mock("@/modules/school/application/can-manage-school", () => ({
  CanManageSchool: class { async execute(actorUserId: string) { return actorUserId === "owner"; } },
}));
vi.mock("@/modules/school/infrastructure/school-membership-repository", () => ({ SchoolMembershipRepository: class {} }));

function proposalDb(status = "PENDING") {
  const created: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];
  const tx = {
    workoutTemplate: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { created.push(data); return data; }) },
    workoutTemplateVersion: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { created.push(data); return data; }) },
    workoutTemplateProposal: { update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { updates.push(data); return data; }) },
  };
  const db = {
    workoutTemplateProposal: {
      findUnique: vi.fn().mockResolvedValue({
        id: "p1", schoolId: "alpha", status, usageRights: "autoral", proposedByCoachId: "coach-ana",
        template: {
          id: "t-personal", title: "NAT-PISC-001", code: null, contentKind: "SESSION", sportType: "swim", environment: null, sessionType: null, capabilities: [], level: null, phase: null, tags: ["base"], folder: null, description: "nado",
          versions: [{ content: { blocks: [{ blockType: "WARMUP", title: "Aq", durationS: 600 }] } }],
        },
        proposer: { id: "coach-ana", displayName: "Ana Lima", userId: "ana" },
      }),
      update: tx.workoutTemplateProposal.update,
    },
    coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach-carlos" }) },
    schoolCatalogRole: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(async (fn: (client: unknown) => unknown) => fn(tx)),
  };
  return { db, tx, created, updates };
}

describe("proposta → revisão → publicação (§9.1)", () => {
  it("a coordenação publica uma CÓPIA institucional com a autoria do professor e os direitos; o pessoal não muda", async () => {
    const { db, created, updates } = proposalDb();
    const result = await new ReviewTemplateProposal(db as never, () => new Date("2026-10-03T12:00:00Z")).execute("owner", "p1", { decision: "APPROVE", reviewNote: "ok" });
    expect(result.status).toBe("APPROVED");
    const copy = created.find((row) => row.ownerType === "SCHOOL")!;
    expect(copy).toMatchObject({ ownerId: "alpha", schoolId: "alpha", authorCoachId: "coach-ana", sourceTemplateId: "t-personal", usageRights: "autoral", status: "ACTIVE", version: 1, title: "NAT-PISC-001" });
    expect(created.find((row) => row.number === 1)).toMatchObject({ authorUserId: "ana", templateId: copy.id });
    expect(updates[0]).toMatchObject({ status: "APPROVED", publishedTemplateId: copy.id, reviewedByUserId: "owner" });
    // Nothing was written to the personal template.
    expect(created.every((row) => row.id !== "t-personal")).toBe(true);
  });

  it("um revisor do catálogo também publica; um professor sem papel não; proposta já revisada é conflito", async () => {
    const reviewer = proposalDb();
    reviewer.db.schoolCatalogRole.findUnique.mockResolvedValue({ role: "REVIEWER" });
    await expect(new ReviewTemplateProposal(reviewer.db as never).execute("carlos", "p1", { decision: "REJECT", reviewNote: "ajustar" })).resolves.toMatchObject({ status: "REJECTED" });
    const nobody = proposalDb();
    await expect(new ReviewTemplateProposal(nobody.db as never).execute("carlos", "p1", { decision: "APPROVE" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const closed = proposalDb("APPROVED");
    await expect(new ReviewTemplateProposal(closed.db as never).execute("owner", "p1", { decision: "APPROVE" })).rejects.toMatchObject({ code: "PROPOSAL_CLOSED" });
  });
});

describe("desligamento do professor (§27.3)", () => {
  it("retira propostas pendentes e o papel; não toca em nenhum modelo (institucional fica, pessoal sai com o professor)", async () => {
    const tx = {
      workoutTemplateProposal: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      schoolCatalogRole: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      workoutTemplate: { update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    };
    await withdrawProposalsOfLeavingCoach(tx as never, "alpha", "coach-ana", new Date());
    expect(tx.workoutTemplateProposal.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { schoolId: "alpha", proposedByCoachId: "coach-ana", status: "PENDING" }, data: expect.objectContaining({ status: "WITHDRAWN" }) }));
    expect(tx.schoolCatalogRole.deleteMany).toHaveBeenCalledWith({ where: { schoolId: "alpha", coachId: "coach-ana" } });
    for (const method of Object.values(tx.workoutTemplate)) expect(method).not.toHaveBeenCalled();
  });
});
