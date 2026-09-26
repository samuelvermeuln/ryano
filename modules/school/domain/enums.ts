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

export const InvitationType = {
  SCHOOL: "SCHOOL",
  SCHOOL_COACH: "SCHOOL_COACH",
  COACH: "COACH",
} as const;
export type InvitationType = (typeof InvitationType)[keyof typeof InvitationType];

export const InvitationStatus = {
  ACTIVE: "ACTIVE",
  EXPIRED: "EXPIRED",
  REVOKED: "REVOKED",
  EXHAUSTED: "EXHAUSTED",
} as const;
export type InvitationStatus = (typeof InvitationStatus)[keyof typeof InvitationStatus];

export const InvitationUseResult = {
  PENDING_APPROVAL: "PENDING_APPROVAL",
  JOINED: "JOINED",
  REJECTED: "REJECTED",
  FAILED: "FAILED",
} as const;
export type InvitationUseResult = (typeof InvitationUseResult)[keyof typeof InvitationUseResult];

/** Explicit recipients of athlete-granted historical access (ADR-005). */
export const HistoryGranteeType = {
  SCHOOL: "SCHOOL",
  COACH: "COACH",
} as const;
export type HistoryGranteeType = (typeof HistoryGranteeType)[keyof typeof HistoryGranteeType];

/** Revocation and expiry terminate access without deleting historical data. */
export const HistoryGrantStatus = {
  ACTIVE: "ACTIVE",
  REVOKED: "REVOKED",
  EXPIRED: "EXPIRED",
} as const;
export type HistoryGrantStatus = (typeof HistoryGrantStatus)[keyof typeof HistoryGrantStatus];

export const WorkoutOwnerType = {
  COACH: "COACH",
  SCHOOL: "SCHOOL",
  SYSTEM: "SYSTEM",
} as const;
export type WorkoutOwnerType = (typeof WorkoutOwnerType)[keyof typeof WorkoutOwnerType];

export const TemplateStatus = {
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  ARCHIVED: "ARCHIVED",
} as const;
export type TemplateStatus = (typeof TemplateStatus)[keyof typeof TemplateStatus];

export const WorkoutStatus = {
  DRAFT: "DRAFT",
  SCHEDULED: "SCHEDULED",
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  ARCHIVED: "ARCHIVED",
} as const;
export type WorkoutStatus = (typeof WorkoutStatus)[keyof typeof WorkoutStatus];

export const WorkoutBlockType = {
  WARMUP: "WARMUP",
  INTERVAL: "INTERVAL",
  STEADY: "STEADY",
  RECOVERY: "RECOVERY",
  COOLDOWN: "COOLDOWN",
  DRILL: "DRILL",
  FREE: "FREE",
  CUSTOM: "CUSTOM",
} as const;
export type WorkoutBlockType = (typeof WorkoutBlockType)[keyof typeof WorkoutBlockType];

export const WorkoutAssignmentStatus = {
  SCHEDULED: "SCHEDULED",
  AVAILABLE: "AVAILABLE",
  COMPLETED: "COMPLETED",
  PARTIALLY_COMPLETED: "PARTIALLY_COMPLETED",
  MISSED: "MISSED",
  CANCELLED: "CANCELLED",
  RESCHEDULED: "RESCHEDULED",
  JUSTIFIED: "JUSTIFIED",
  // Activity performed by the athlete that was not part of any prescription (required.md §45)
  UNPLANNED: "UNPLANNED",
} as const;
export type WorkoutAssignmentStatus = (typeof WorkoutAssignmentStatus)[keyof typeof WorkoutAssignmentStatus];

export const WorkoutMatchStatus = {
  PENDING: "PENDING",
  AUTO_MATCHED: "AUTO_MATCHED",
  CONFIRMED: "CONFIRMED",
  OVERRIDDEN: "OVERRIDDEN",
  NO_MATCH: "NO_MATCH",
} as const;
export type WorkoutMatchStatus = (typeof WorkoutMatchStatus)[keyof typeof WorkoutMatchStatus];

export const WorkoutRequestStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  DECLINED: "DECLINED",
  CANCELLED: "CANCELLED",
} as const;
export type WorkoutRequestStatus = (typeof WorkoutRequestStatus)[keyof typeof WorkoutRequestStatus];

/**
 * School administration asking a coach to revise a prescription that already
 * happened. Distinct from WorkoutRequestStatus: this one is resolved by the
 * coach and carries no resulting assignment — the coach edits in place.
 */
export const WorkoutChangeRequestStatus = {
  PENDING: "PENDING",
  ACKNOWLEDGED: "ACKNOWLEDGED",
  RESOLVED: "RESOLVED",
  DECLINED: "DECLINED",
  CANCELLED: "CANCELLED",
} as const;
export type WorkoutChangeRequestStatus =
  (typeof WorkoutChangeRequestStatus)[keyof typeof WorkoutChangeRequestStatus];

// ── TrainingProduct marketplace enums (T400–T403) ────────────────────────────

export const TrainingProductStatus = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  ARCHIVED: "ARCHIVED",
} as const;
export type TrainingProductStatus = (typeof TrainingProductStatus)[keyof typeof TrainingProductStatus];

export const TrainingProductVisibility = {
  PUBLIC: "PUBLIC",
  UNLISTED: "UNLISTED",
  SCHOOL_ONLY: "SCHOOL_ONLY",
} as const;
export type TrainingProductVisibility = (typeof TrainingProductVisibility)[keyof typeof TrainingProductVisibility];

export const TrainingPurchaseStatus = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  REFUNDED: "REFUNDED",
  CANCELLED: "CANCELLED",
} as const;
export type TrainingPurchaseStatus = (typeof TrainingPurchaseStatus)[keyof typeof TrainingPurchaseStatus];

// TM057/TM067 — seller ledger (RF-205).
export const SellerType = {
  COACH: "COACH",
  SCHOOL: "SCHOOL",
} as const;
export type SellerType = (typeof SellerType)[keyof typeof SellerType];

export const SellerLedgerEntryType = {
  SALE: "SALE",
  REFUND: "REFUND",
  PAYOUT: "PAYOUT",
} as const;
export type SellerLedgerEntryType = (typeof SellerLedgerEntryType)[keyof typeof SellerLedgerEntryType];

// TM006 — PAUSED/COMPLETED added so `/app/planos` can tell "paused by the
// athlete" and "finished the plan" apart from ACTIVE (see prisma/schema.prisma
// TrainingLicenseStatus and migration 0039).
export const TrainingLicenseStatus = {
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
  EXPIRED: "EXPIRED",
  REVOKED: "REVOKED",
} as const;
export type TrainingLicenseStatus = (typeof TrainingLicenseStatus)[keyof typeof TrainingLicenseStatus];

export const TrainingLicenseActivationMode = {
  START_NOW: "START_NOW",
  START_ON_DATE: "START_ON_DATE",
  TARGET_EVENT_DATE: "TARGET_EVENT_DATE",
} as const;
export type TrainingLicenseActivationMode =
  (typeof TrainingLicenseActivationMode)[keyof typeof TrainingLicenseActivationMode];

export const TrainingLicenseActivationStatus = {
  PENDING: "PENDING",
  ACTIVATED: "ACTIVATED",
} as const;
export type TrainingLicenseActivationStatus =
  (typeof TrainingLicenseActivationStatus)[keyof typeof TrainingLicenseActivationStatus];

// ── Onda 3 — independent coach follow-up (TM008/TM072-076) ──────────────────

export const LicenseCoachEngagementStatus = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  ENDED: "ENDED",
} as const;
export type LicenseCoachEngagementStatus =
  (typeof LicenseCoachEngagementStatus)[keyof typeof LicenseCoachEngagementStatus];

export const PlanAdaptationStatus = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  DECLINED: "DECLINED",
} as const;
export type PlanAdaptationStatus = (typeof PlanAdaptationStatus)[keyof typeof PlanAdaptationStatus];
