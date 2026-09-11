/** Provider-independent vocabulary; roles belong to memberships, not global auth. */
export const SchoolStatus = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  SUSPENDED: "SUSPENDED",
  ARCHIVED: "ARCHIVED",
} as const;
export type SchoolStatus = (typeof SchoolStatus)[keyof typeof SchoolStatus];

export const SchoolJoinPolicy = {
  AUTO_APPROVE: "AUTO_APPROVE",
  REQUIRE_APPROVAL: "REQUIRE_APPROVAL",
  INVITE_ONLY: "INVITE_ONLY",
} as const;
export type SchoolJoinPolicy = (typeof SchoolJoinPolicy)[keyof typeof SchoolJoinPolicy];

export const CoachSelectionPolicy = {
  ATHLETE_CHOOSES: "ATHLETE_CHOOSES",
  ADMIN_ASSIGNS: "ADMIN_ASSIGNS",
  AUTO_LOBBY: "AUTO_LOBBY",
  INVITE_DEFINES_COACH: "INVITE_DEFINES_COACH",
} as const;
export type CoachSelectionPolicy = (typeof CoachSelectionPolicy)[keyof typeof CoachSelectionPolicy];

export const MembershipStatus = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  REJECTED: "REJECTED",
  REVOKED: "REVOKED",
  ENDED: "ENDED",
} as const;
export type MembershipStatus = (typeof MembershipStatus)[keyof typeof MembershipStatus];

export const AssignmentStatus = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  REJECTED: "REJECTED",
  REVOKED: "REVOKED",
  ENDED: "ENDED",
} as const;
export type AssignmentStatus = (typeof AssignmentStatus)[keyof typeof AssignmentStatus];

export const CoachStatus = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  SUSPENDED: "SUSPENDED",
} as const;
export type CoachStatus = (typeof CoachStatus)[keyof typeof CoachStatus];

export const SchoolRole = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  COACH: "COACH",
  ASSISTANT_COACH: "ASSISTANT_COACH",
  STAFF: "STAFF",
  ATHLETE: "ATHLETE",
  GUARDIAN: "GUARDIAN",
} as const;
export type SchoolRole = (typeof SchoolRole)[keyof typeof SchoolRole];

export const MembershipJoinSource = {
  SCHOOL_INVITE: "SCHOOL_INVITE",
  SCHOOL_COACH_INVITE: "SCHOOL_COACH_INVITE",
  COACH_INVITE: "COACH_INVITE",
  MANUAL_SEARCH: "MANUAL_SEARCH",
  ADMIN_CREATED: "ADMIN_CREATED",
  MIGRATION: "MIGRATION",
} as const;
export type MembershipJoinSource = (typeof MembershipJoinSource)[keyof typeof MembershipJoinSource];
