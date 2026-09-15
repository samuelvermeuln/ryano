import { z } from "zod";
import { InvitationStatus, InvitationType } from "./enums";

const opaqueId = z.string().min(1).refine((value) => value.trim() === value);
const copiedDate = z.date().transform((value) => new Date(value));
const identitySchema = z.strictObject({
  id: opaqueId,
  tokenHash: z.string().refine((value) => value.trim().length > 0),
  type: z.enum(InvitationType),
  schoolId: opaqueId.nullable(),
  coachId: opaqueId.nullable(),
  createdBy: opaqueId,
  requiresApproval: z.boolean(),
  expiresAt: copiedDate.nullable(),
  maxUses: z.number().int().positive().nullable(),
});

/** Stored invitation state only; token generation and clock-based resolution live in use cases. */
export const invitationLinkSchema = identitySchema.extend({
  usedCount: z.number().int().nonnegative(),
  status: z.enum(InvitationStatus),
  createdAt: copiedDate,
  updatedAt: copiedDate,
  revokedAt: copiedDate.nullable(),
}).superRefine((invitation, ctx) => {
  const fail = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  const requiresSchool = invitation.type !== InvitationType.COACH;
  const requiresCoach = invitation.type !== InvitationType.SCHOOL;
  if (requiresSchool !== (invitation.schoolId !== null)) fail("schoolId", "School scope does not match invitation type");
  if (requiresCoach !== (invitation.coachId !== null)) fail("coachId", "Coach scope does not match invitation type");
  if (invitation.maxUses !== null && invitation.usedCount > invitation.maxUses) fail("usedCount", "Usage cannot exceed the limit");
  if (invitation.status === InvitationStatus.EXHAUSTED
    && (invitation.maxUses === null || invitation.usedCount !== invitation.maxUses)) {
    fail("status", "Exhausted invitation requires a reached usage limit");
  }
  if (invitation.status === InvitationStatus.EXPIRED && invitation.expiresAt === null) {
    fail("expiresAt", "Expired invitation requires an expiration date");
  }
  if ((invitation.status === InvitationStatus.REVOKED) !== (invitation.revokedAt !== null)) {
    fail("revokedAt", "Revocation date must match revoked status");
  }
  if (invitation.updatedAt < invitation.createdAt) fail("updatedAt", "Update cannot precede creation");
  if (invitation.revokedAt && (invitation.revokedAt < invitation.createdAt || invitation.revokedAt > invitation.updatedAt)) {
    fail("revokedAt", "Revocation must fall between creation and last update");
  }
});

export type InvitationLink = z.infer<typeof invitationLinkSchema>;
export type CreateInvitationLinkInput = z.infer<typeof identitySchema>;

export function createInvitationLink(raw: CreateInvitationLinkInput, now: Date): InvitationLink {
  const identity = identitySchema.parse(raw);
  return invitationLinkSchema.parse({
    ...identity,
    usedCount: 0,
    status: InvitationStatus.ACTIVE,
    createdAt: now,
    updatedAt: now,
    revokedAt: null,
  });
}
