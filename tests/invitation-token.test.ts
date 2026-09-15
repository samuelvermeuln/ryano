import { describe, expect, it } from "vitest";
import { InvitationType } from "@/modules/school/domain/enums";
import { createInvitationLink, invitationLinkSchema } from "@/modules/school/domain/invitation-link";
import { generateInvitationToken, hashInvitationToken } from "@/modules/school/infrastructure/invitation-token";

describe("invitation token security [T084]", () => {
  it("issues distinct URL-safe 256-bit credentials with matching SHA-256 hashes", () => {
    const issued = Array.from({ length: 32 }, () => generateInvitationToken());
    expect(new Set(issued.map(({ token }) => token)).size).toBe(issued.length);
    for (const { token, persistence } of issued) {
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      expect(persistence.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(persistence.tokenHash).toBe(hashInvitationToken(token));
      expect(persistence.tokenHash).not.toBe(token);
      expect(Object.keys(persistence)).toEqual(["tokenHash"]);
    }
  });

  it("uses deterministic SHA-256 and preserves the exact credential bytes", () => {
    expect(hashInvitationToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hashInvitationToken("abc")).not.toBe(hashInvitationToken("ABC"));
    expect(hashInvitationToken("abc")).not.toBe(hashInvitationToken(" abc "));
  });

  it("keeps the delivered credential out of persistable invitation state", () => {
    const issued = generateInvitationToken();
    const stored = createInvitationLink({
      id: "invitation", ...issued.persistence, type: InvitationType.SCHOOL,
      schoolId: "school", coachId: null, createdBy: "creator",
      requiresApproval: true, expiresAt: null, maxUses: 1,
    }, new Date("2026-09-14T10:00:00Z"));

    expect(stored.tokenHash).toBe(hashInvitationToken(issued.token));
    expect(JSON.stringify(stored)).not.toContain(issued.token);
    expect(invitationLinkSchema.safeParse({ ...stored, token: issued.token }).success).toBe(false);
    expect(invitationLinkSchema.safeParse({ ...stored, ...issued }).success).toBe(false);
  });
});
