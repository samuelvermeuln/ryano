export const AssignmentStatus = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  REJECTED: "REJECTED",
  REVOKED: "REVOKED",
  ENDED: "ENDED",
} as const;
export type AssignmentStatus = (typeof AssignmentStatus)[keyof typeof AssignmentStatus];
