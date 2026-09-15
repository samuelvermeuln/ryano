import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { InvitationType } from "@/modules/school/domain/enums";
import { createInvitationLink, invitationLinkSchema } from "@/modules/school/domain/invitation-link";

const now = new Date("2026-09-14T10:00:00Z");
const later = new Date("2026-09-15T10:00:00Z");
const input = {
  id: "invitation-opaque", tokenHash: "stored-hash", type: InvitationType.SCHOOL,
  schoolId: "school-opaque", coachId: null, createdBy: "creator-opaque",
  requiresApproval: true, expiresAt: null, maxUses: null,
};
const active = () => createInvitationLink(input, now);

describe("InvitationLink entity [T083]", () => {
  it.each([
    { type: InvitationType.SCHOOL, schoolId: "school", coachId: null },
    { type: InvitationType.SCHOOL_COACH, schoolId: "school", coachId: "coach" },
    { type: InvitationType.COACH, schoolId: null, coachId: "coach" },
  ])("creates an unused active invitation with scope $type", (scope) => {
    expect(createInvitationLink({ ...input, ...scope }, now)).toEqual({
      ...input, ...scope, status: "ACTIVE", usedCount: 0, revokedAt: null, createdAt: now, updatedAt: now,
    });
  });

  it.each([
    { schoolId: null }, { coachId: "coach" },
    { type: "SCHOOL_COACH", coachId: null },
    { type: "SCHOOL_COACH", schoolId: null, coachId: "coach" },
    { type: "COACH", coachId: "coach" },
    { type: "COACH", schoolId: null, coachId: null },
    { type: "unknown" }, { id: "" }, { createdBy: " " }, { schoolId: " padded " },
    { tokenHash: " " }, { tokenHash: "" }, { maxUses: 0 }, { maxUses: -1 }, { maxUses: 1.5 },
    { expiresAt: new Date("invalid") },
    { usedCount: -1 }, { usedCount: 0.5 }, { maxUses: 1, usedCount: 2 },
    { status: "EXHAUSTED" }, { status: "EXHAUSTED", maxUses: 2, usedCount: 1 },
    { status: "EXPIRED" }, { status: "REVOKED" }, { revokedAt: now },
    { updatedAt: new Date("2026-09-13") },
    { status: "REVOKED", revokedAt: later },
    { status: "REVOKED", revokedAt: new Date("2026-09-13") },
    { token: "plaintext" },
  ])("rejects inconsistent restored state %j", (invalid) => {
    expect(() => invitationLinkSchema.parse({ ...active(), ...invalid })).toThrow(ZodError);
  });

  it("rejects injected lifecycle fields and plaintext tokens at creation", () => {
    expect(() => createInvitationLink({ ...input, token: "plaintext" } as typeof input, now)).toThrow(ZodError);
    expect(() => createInvitationLink({ ...input, usedCount: 1 } as typeof input, now)).toThrow(ZodError);
    expect(() => createInvitationLink(input, new Date("invalid"))).toThrow(ZodError);
  });

  it("restores terminal states and accepts usage limits reached before status reconciliation", () => {
    for (const state of [
      { status: "EXHAUSTED", maxUses: 1, usedCount: 1 },
      { status: "ACTIVE", maxUses: 1, usedCount: 1 },
      { status: "EXPIRED", expiresAt: now },
      { status: "REVOKED", revokedAt: later, updatedAt: later },
    ]) expect(invitationLinkSchema.parse({ ...active(), ...state })).toMatchObject(state);
  });

  it("preserves supplied expiration values without consulting the clock and copies dates", () => {
    const clock = new Date(now);
    const expiry = new Date("2020-01-01");
    const created = createInvitationLink({ ...input, expiresAt: expiry }, clock);
    expect(created.status).toBe("ACTIVE");
    expect(created.expiresAt).toEqual(expiry);
    clock.setUTCFullYear(2000);
    expiry.setUTCFullYear(2000);
    expect(created.createdAt).toEqual(now);
    expect(created.updatedAt).toEqual(now);
    expect(created.expiresAt).toEqual(new Date("2020-01-01"));
    const restored = invitationLinkSchema.parse({ ...created, status: "REVOKED", revokedAt: later, updatedAt: later });
    expect(restored.revokedAt).not.toBe(later);
    expect(restored.createdAt).not.toBe(created.createdAt);
    expect(restored.updatedAt).not.toBe(later);
    expect(restored.expiresAt).not.toBe(created.expiresAt);
  });
});
