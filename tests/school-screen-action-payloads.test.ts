/**
 * The school screens' Server Actions hand plain objects to use cases typed as
 * `raw: unknown`, so TypeScript cannot check that what a form builds is what
 * the use case accepts. Every schema below is a `z.strictObject`, which means
 * a single stray or renamed key turns into a runtime "Dados inválidos." that
 * no other test in the suite would catch.
 */
import { describe, expect, it } from "vitest";

import { createTeamSchema } from "@/modules/school/application/manage-team";
import { updateTeamSchema } from "@/modules/school/application/list-teams";
import { updateTrainingProductDraftSchema } from "@/modules/school/application/update-training-product-draft";
import {
  grantProductAudienceSchema,
  revokeProductAudienceSchema,
} from "@/modules/school/application/manage-product-audience";
import { createInvitationLinkSchema } from "@/modules/school/application/create-invitation-link";
import { bulkAssignCoachSchema } from "@/modules/school/application/bulk-assign-coach";

const productVersion = new Date("2026-09-16T12:00:00.000Z").toISOString();

describe("turmas screen payloads", () => {
  it("accepts a create form where every optional field was left blank", () => {
    const parsed = createTeamSchema.safeParse({
      schoolId: "school-1",
      name: "Corrida — Manhã",
      sportType: null,
      level: null,
      capacity: null,
      location: null,
      notes: null,
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a fully filled create form", () => {
    const parsed = createTeamSchema.safeParse({
      schoolId: "school-1",
      name: "Corrida — Manhã",
      sportType: "Corrida",
      level: "Iniciante",
      capacity: 20,
      location: "Parque Ibirapuera",
      notes: "Treino às 6h",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an update that clears previously set fields", () => {
    // The edit form always submits every input, so a field the user emptied
    // must arrive as an explicit null ("limpar"), not be dropped.
    const parsed = updateTeamSchema.safeParse({
      teamId: "team-1",
      name: "Corrida — Manhã",
      sportType: null,
      level: null,
      capacity: null,
      location: null,
      notes: null,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a capacity of zero, which would make the team unusable", () => {
    const parsed = createTeamSchema.safeParse({
      schoolId: "school-1",
      name: "Turma",
      sportType: null,
      level: null,
      capacity: 0,
      location: null,
      notes: null,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("marketplace screen payloads", () => {
  it("accepts a visibility change to PRIVATE", () => {
    const parsed = updateTrainingProductDraftSchema.safeParse({
      productId: "product-1",
      expectedVersion: productVersion,
      visibility: "PRIVATE",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a paid price with its currency", () => {
    const parsed = updateTrainingProductDraftSchema.safeParse({
      productId: "product-1",
      expectedVersion: productVersion,
      priceCents: 9900,
      currency: "BRL",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts clearing the price to make the product free", () => {
    // Free is `priceCents: null`, never zero, and currency must clear with it.
    const parsed = updateTrainingProductDraftSchema.safeParse({
      productId: "product-1",
      expectedVersion: productVersion,
      priceCents: null,
      currency: null,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a zero price, which is not how free is expressed", () => {
    const parsed = updateTrainingProductDraftSchema.safeParse({
      productId: "product-1",
      expectedVersion: productVersion,
      priceCents: 0,
      currency: "BRL",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts granting audience by e-mail, which is what the manager knows", () => {
    const parsed = grantProductAudienceSchema.safeParse({
      productId: "product-1",
      email: "atleta@exemplo.com",
      note: null,
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts revoking audience by athlete id", () => {
    const parsed = revokeProductAudienceSchema.safeParse({
      productId: "product-1",
      athleteId: "athlete-1",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("convites screen payloads", () => {
  it("accepts an invitation with an expiry and no use limit", () => {
    const parsed = createInvitationLinkSchema.safeParse({
      type: "SCHOOL",
      schoolId: "school-1",
      requiresApproval: true,
      expiresAt: new Date("2026-10-16T12:00:00.000Z"),
      maxUses: null,
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a coach invitation that never expires", () => {
    const parsed = createInvitationLinkSchema.safeParse({
      type: "SCHOOL_COACH",
      schoolId: "school-1",
      requiresApproval: false,
      expiresAt: null,
      maxUses: 5,
    });
    expect(parsed.success).toBe(true);
  });
});

describe("atletas screen payloads", () => {
  it("accepts a bulk assignment of distinct athletes", () => {
    const parsed = bulkAssignCoachSchema.safeParse({
      coachId: "coach-1",
      athleteIds: ["athlete-1", "athlete-2"],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a batch repeating the same athlete", () => {
    const parsed = bulkAssignCoachSchema.safeParse({
      coachId: "coach-1",
      athleteIds: ["athlete-1", "athlete-1"],
    });
    expect(parsed.success).toBe(false);
  });
});
